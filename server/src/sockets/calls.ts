import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { config } from '../config/env';
import { query } from '../db/pool';
import type {
  CallConversation, CallInfo, CallKind, CallParticipant, CallEndReason, ConversationKind, Sender,
} from '../types/domain';
import { uuid } from '../utils/validation';
import { isUserOnline } from './presence';

interface SessionParticipant extends CallParticipant {
  socketId: string;
}

interface CallSession {
  id: string;
  conversationId: string;
  conversation: CallConversation;
  kind: CallKind;
  initiatorId: string;
  participants: Map<string, SessionParticipant>;
  invited: Set<string>;
  answered: boolean;
  ringTimer: ReturnType<typeof setTimeout> | null;
  startedAt: string;
}

interface CallActor {
  userId: string;
  user: Sender;
}

interface CallResponse {
  ok: boolean;
  code?: string;
  message?: string;
  call?: CallInfo;
  participants?: CallParticipant[];
}

const calls = new Map<string, CallSession>();

const inviteSchema = z.object({
  conversationId: uuid,
  kind: z.enum(['audio', 'video']),
});
const callIdSchema = z.object({ callId: uuid });
const offerSchema = z.object({ callId: uuid, toUserId: uuid, sdp: z.string().min(1).max(300_000) });
const answerSchema = z.object({ callId: uuid, toUserId: uuid, sdp: z.string().min(1).max(300_000) });
const iceSchema = z.object({
  callId: uuid,
  toUserId: uuid,
  candidate: z.object({
    candidate: z.string(),
    sdpMid: z.string().nullish(),
    sdpMLineIndex: z.number().nullish(),
    usernameFragment: z.string().nullish(),
  }),
});
const mediaSchema = z.object({
  callId: uuid,
  mic: z.boolean(),
  camera: z.boolean(),
  screen: z.boolean(),
});

function reply(ack: unknown, response: CallResponse): void {
  if (typeof ack === 'function') (ack as (response: CallResponse) => void)(response);
}

function publicParticipant(participant: SessionParticipant): CallParticipant {
  return {
    userId: participant.userId,
    user: participant.user,
    mic: participant.mic,
    camera: participant.camera,
    screen: participant.screen,
  };
}

function serializeCall(call: CallSession): CallInfo {
  const seen = new Set<string>();
  const participants: CallParticipant[] = [];
  for (const participant of call.participants.values()) {
    if (seen.has(participant.userId)) continue;
    seen.add(participant.userId);
    participants.push(publicParticipant(participant));
  }
  return {
    id: call.id,
    conversationId: call.conversationId,
    conversation: call.conversation,
    kind: call.kind,
    initiatorId: call.initiatorId,
    participants,
    startedAt: call.startedAt,
  };
}

function findParticipantBySocket(call: CallSession, socketId: string): SessionParticipant | undefined {
  return call.participants.get(socketId);
}

function findParticipantByUser(call: CallSession, userId: string): SessionParticipant | undefined {
  for (const participant of call.participants.values()) {
    if (participant.userId === userId) return participant;
  }
  return undefined;
}

function userInCall(userId: string, exceptCallId?: string): CallSession | undefined {
  for (const call of calls.values()) {
    if (call.id === exceptCallId) continue;
    if (findParticipantByUser(call, userId)) return call;
  }
  return undefined;
}

function stopRinging(io: Server, call: CallSession): void {
  if (call.invited.size === 0) return;
  for (const userId of call.invited) {
    io.to(`user:${userId}`).emit('call:ring-stopped', { callId: call.id });
  }
  call.invited.clear();
}

function finishCall(io: Server, call: CallSession, reason: CallEndReason, actor?: CallActor): void {
  if (calls.get(call.id) !== call) return;
  calls.delete(call.id);
  if (call.ringTimer) {
    clearTimeout(call.ringTimer);
    call.ringTimer = null;
  }
  const payload = {
    callId: call.id,
    reason,
    ...(actor ? { userId: actor.userId, user: actor.user } : {}),
  };
  io.to(`call:${call.id}`).emit('call:ended', payload);
  for (const userId of call.invited) io.to(`user:${userId}`).emit('call:ended', payload);
  io.in(`call:${call.id}`).socketsLeave(`call:${call.id}`);
}

async function loadSender(userId: string): Promise<Sender | null> {
  const result = await query<Record<string, unknown>>(
    'SELECT id, username, display_name, avatar_url FROM users WHERE id = $1',
    [userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: String(row.display_name),
    avatarUrl: row.avatar_url == null ? null : String(row.avatar_url),
  };
}

interface LoadedConversation {
  conversation: CallConversation;
  memberIds: string[];
}

async function loadConversation(conversationId: string): Promise<LoadedConversation | null> {
  const result = await query<Record<string, unknown>>(
    `SELECT c.id, c.kind, c.title, c.avatar_url,
            COALESCE(ARRAY(
              SELECT cm.user_id::text FROM conversation_members cm
              WHERE cm.conversation_id = c.id
            ), '{}') AS member_ids
     FROM conversations c WHERE c.id = $1`,
    [conversationId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const memberIds = Array.isArray(row.member_ids) ? row.member_ids.map(String) : [];
  return {
    conversation: {
      id: String(row.id),
      kind: row.kind as ConversationKind,
      title: row.title == null ? null : String(row.title),
      avatarUrl: row.avatar_url == null ? null : String(row.avatar_url),
    },
    memberIds,
  };
}

function removeParticipant(io: Server, call: CallSession, participant: SessionParticipant, reason: 'left' | 'disconnected'): void {
  call.participants.delete(participant.socketId);
  io.to(`call:${call.id}`).emit('call:peer-left', {
    callId: call.id,
    userId: participant.userId,
    user: participant.user,
    reason,
  });
  if (call.conversation.kind === 'direct' || call.participants.size === 0) {
    finishCall(io, call, 'left', participant);
  }
}

async function handleInvite(io: Server, socket: Socket, userId: string, payload: unknown, ack: unknown): Promise<void> {
  let input: z.infer<typeof inviteSchema>;
  try {
    input = inviteSchema.parse(payload);
  } catch {
    reply(ack, { ok: false, code: 'INVALID_PAYLOAD', message: 'Некоректні параметри дзвінка' });
    return;
  }

  if (userInCall(userId)) {
    reply(ack, { ok: false, code: 'BUSY', message: 'Ви вже берете участь у дзвінку' });
    return;
  }

  const loaded = await loadConversation(input.conversationId);
  if (!loaded) {
    reply(ack, { ok: false, code: 'NOT_FOUND', message: 'Розмову не знайдено' });
    return;
  }
  if (!loaded.memberIds.includes(userId)) {
    reply(ack, { ok: false, code: 'NOT_MEMBER', message: 'Дзвінки доступні лише учасникам розмови' });
    return;
  }
  if (loaded.conversation.kind === 'channel') {
    reply(ack, { ok: false, code: 'UNSUPPORTED', message: 'У каналах дзвінки недоступні' });
    return;
  }
  if (loaded.conversation.kind === 'saved') {
    reply(ack, { ok: false, code: 'UNSUPPORTED', message: 'У нотатках дзвінки недоступні' });
    return;
  }

  const others = loaded.memberIds.filter((id) => id !== userId);
  if (others.length === 0) {
    reply(ack, { ok: false, code: 'NO_PARTICIPANTS', message: 'У розмові немає інших учасників' });
    return;
  }

  const online = others.filter((id) => isUserOnline(id));
  const available = online.filter((id) => !userInCall(id));
  if (available.length === 0) {
    const busy = online.some((id) => userInCall(id));
    reply(ack, {
      ok: false,
      code: busy ? 'BUSY' : 'OFFLINE',
      message: busy ? 'Учасники вже в іншому дзвінку' : 'Нікого немає в мережі',
    });
    return;
  }

  const caller = await loadSender(userId);
  if (!caller) {
    reply(ack, { ok: false, code: 'NOT_FOUND', message: 'Користувача не знайдено' });
    return;
  }

  // A parallel request may have moved this user into a call while we loaded data.
  if (userInCall(userId)) {
    reply(ack, { ok: false, code: 'BUSY', message: 'Ви вже берете участь у дзвінку' });
    return;
  }

  const id = randomUUID();
  const participant: SessionParticipant = {
    socketId: socket.id,
    userId,
    user: caller,
    mic: true,
    camera: input.kind === 'video',
    screen: false,
  };
  const call: CallSession = {
    id,
    conversationId: input.conversationId,
    conversation: loaded.conversation,
    kind: input.kind,
    initiatorId: userId,
    participants: new Map([[socket.id, participant]]),
    invited: new Set(available),
    answered: false,
    ringTimer: null,
    startedAt: new Date().toISOString(),
  };
  calls.set(id, call);
  call.ringTimer = setTimeout(() => {
    call.ringTimer = null;
    if (call.answered) stopRinging(io, call);
    else finishCall(io, call, 'timeout');
  }, config.CALL_RING_TIMEOUT_MS);

  await socket.join(`call:${id}`);
  reply(ack, { ok: true, call: serializeCall(call) });

  const incoming = { call: serializeCall(call) };
  for (const memberId of call.invited) {
    io.to(`user:${memberId}`).emit('call:incoming', incoming);
  }
}

async function handleAccept(socket: Socket, userId: string, payload: unknown, ack: unknown): Promise<void> {
  let input: z.infer<typeof callIdSchema>;
  try {
    input = callIdSchema.parse(payload);
  } catch {
    reply(ack, { ok: false, code: 'INVALID_PAYLOAD', message: 'Некоректний ідентифікатор дзвінка' });
    return;
  }

  const call = calls.get(input.callId);
  if (!call) {
    reply(ack, { ok: false, code: 'NOT_FOUND', message: 'Дзвінок уже завершено' });
    return;
  }
  if (findParticipantByUser(call, userId)) {
    reply(ack, { ok: false, code: 'ALREADY_JOINED', message: 'Ви вже в цьому дзвінку' });
    return;
  }
  if (userInCall(userId, call.id)) {
    reply(ack, { ok: false, code: 'BUSY', message: 'Ви вже берете участь в іншому дзвінку' });
    return;
  }
  if (!call.invited.has(userId)) {
    reply(ack, { ok: false, code: 'NOT_INVITED', message: 'Запрошення вже неактивне' });
    return;
  }
  if (call.participants.size >= config.MAX_CALL_PARTICIPANTS) {
    reply(ack, { ok: false, code: 'CALL_FULL', message: 'У дзвінку вже максимальна кількість учасників' });
    return;
  }

  const user = await loadSender(userId);
  if (!user) {
    reply(ack, { ok: false, code: 'NOT_FOUND', message: 'Користувача не знайдено' });
    return;
  }

  if (findParticipantByUser(call, userId)) {
    reply(ack, { ok: false, code: 'ALREADY_JOINED', message: 'Ви вже в цьому дзвінку' });
    return;
  }
  if (!call.invited.has(userId) || calls.get(call.id) !== call) {
    reply(ack, { ok: false, code: 'NOT_INVITED', message: 'Запрошення вже неактивне' });
    return;
  }
  if (call.participants.size >= config.MAX_CALL_PARTICIPANTS) {
    reply(ack, { ok: false, code: 'CALL_FULL', message: 'У дзвінку вже максимальна кількість учасників' });
    return;
  }

  const existingParticipants = [...call.participants.values()];
  const participant: SessionParticipant = {
    socketId: socket.id,
    userId,
    user,
    mic: true,
    camera: call.kind === 'video',
    screen: false,
  };
  call.participants.set(socket.id, participant);
  call.invited.delete(userId);
  call.answered = true;
  await socket.join(`call:${call.id}`);

  // Other tabs of the same user should stop ringing after this one answers.
  socket.to(`user:${userId}`).emit('call:handled', { callId: call.id });

  reply(ack, {
    ok: true,
    call: serializeCall(call),
    participants: existingParticipants.map(publicParticipant),
  });

  const joined = { callId: call.id, participant: publicParticipant(participant) };
  for (const existing of existingParticipants) {
    socket.to(existing.socketId).emit('call:peer-joined', joined);
  }
}

async function handleDecline(io: Server, socket: Socket, userId: string, payload: unknown): Promise<void> {
  let input: z.infer<typeof callIdSchema>;
  try {
    input = callIdSchema.parse(payload);
  } catch {
    return;
  }
  const call = calls.get(input.callId);
  if (!call || !call.invited.has(userId)) return;

  call.invited.delete(userId);
  socket.to(`user:${userId}`).emit('call:handled', { callId: call.id });

  const user = await loadSender(userId);
  if (!user) return;

  if (call.conversation.kind === 'direct') {
    finishCall(io, call, 'declined', { userId, user });
    return;
  }

  io.to(`call:${call.id}`).emit('call:declined', { callId: call.id, userId, user });
  if (call.invited.size === 0 && !call.answered) finishCall(io, call, 'declined');
}

function handleLeave(io: Server, socket: Socket, userId: string, payload: unknown): void {
  let input: z.infer<typeof callIdSchema>;
  try {
    input = callIdSchema.parse(payload);
  } catch {
    return;
  }
  const call = calls.get(input.callId);
  if (!call) return;
  const participant = findParticipantBySocket(call, socket.id);
  if (!participant || participant.userId !== userId) return;
  void socket.leave(`call:${call.id}`);
  removeParticipant(io, call, participant, 'left');
}

function handleSignal(
  io: Server,
  socket: Socket,
  userId: string,
  payload: unknown,
  event: 'offer' | 'answer' | 'ice',
): void {
  const schema = event === 'offer' ? offerSchema : event === 'answer' ? answerSchema : iceSchema;
  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(payload);
  } catch {
    return;
  }

  const call = calls.get(input.callId);
  if (!call) return;
  const sender = findParticipantBySocket(call, socket.id);
  if (!sender || sender.userId !== userId) return;
  const target = findParticipantByUser(call, input.toUserId);
  if (!target || target.socketId === socket.id) return;

  if (event === 'offer') {
    io.to(target.socketId).emit('call:offer', {
      callId: call.id,
      fromUserId: sender.userId,
      fromUser: sender.user,
      sdp: (input as z.infer<typeof offerSchema>).sdp,
    });
  } else if (event === 'answer') {
    io.to(target.socketId).emit('call:answer', {
      callId: call.id,
      fromUserId: sender.userId,
      sdp: (input as z.infer<typeof answerSchema>).sdp,
    });
  } else {
    io.to(target.socketId).emit('call:ice', {
      callId: call.id,
      fromUserId: sender.userId,
      candidate: (input as z.infer<typeof iceSchema>).candidate,
    });
  }
}

function handleMedia(socket: Socket, userId: string, payload: unknown): void {
  let input: z.infer<typeof mediaSchema>;
  try {
    input = mediaSchema.parse(payload);
  } catch {
    return;
  }
  const call = calls.get(input.callId);
  if (!call) return;
  const participant = findParticipantBySocket(call, socket.id);
  if (!participant || participant.userId !== userId) return;
  participant.mic = input.mic;
  participant.camera = input.camera;
  participant.screen = input.screen;
  socket.to(`call:${call.id}`).emit('call:media', {
    callId: call.id,
    userId,
    mic: input.mic,
    camera: input.camera,
    screen: input.screen,
  });
}

export function registerCallHandlers(io: Server, socket: Socket, userId: string): void {
  socket.on('call:invite', (payload: unknown, ack?: unknown) => {
    void handleInvite(io, socket, userId, payload, ack).catch((error) => {
      console.error('Failed to create call', error);
      reply(ack, { ok: false, code: 'INTERNAL', message: 'Не вдалося створити дзвінок' });
    });
  });
  socket.on('call:accept', (payload: unknown, ack?: unknown) => {
    void handleAccept(socket, userId, payload, ack).catch((error) => {
      console.error('Failed to accept call', error);
      reply(ack, { ok: false, code: 'INTERNAL', message: 'Не вдалося приєднатися до дзвінка' });
    });
  });
  socket.on('call:decline', (payload: unknown) => {
    void handleDecline(io, socket, userId, payload).catch((error) => {
      console.error('Failed to decline call', error);
    });
  });
  socket.on('call:leave', (payload: unknown) => handleLeave(io, socket, userId, payload));
  socket.on('call:offer', (payload: unknown) => handleSignal(io, socket, userId, payload, 'offer'));
  socket.on('call:answer', (payload: unknown) => handleSignal(io, socket, userId, payload, 'answer'));
  socket.on('call:ice', (payload: unknown) => handleSignal(io, socket, userId, payload, 'ice'));
  socket.on('call:media', (payload: unknown) => handleMedia(socket, userId, payload));
}

export function handleCallDisconnect(io: Server, socketId: string): void {
  for (const call of [...calls.values()]) {
    const participant = findParticipantBySocket(call, socketId);
    if (!participant) continue;
    removeParticipant(io, call, participant, 'disconnected');
  }
}
