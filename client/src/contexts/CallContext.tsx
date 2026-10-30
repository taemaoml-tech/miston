import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Socket } from 'socket.io-client';
import { api } from '../api';
import type {
  CallEndReason, CallInfo, CallKind, CallParticipant, CallPhase, MessageSender,
} from '../types/models';
import { useAuth } from './AuthContext';
import { useMessenger } from './MessengerContext';
import { useSocket } from './SocketContext';
import { dismissBackgroundNotification, isNativeApp, notifyInBackground } from '../utils/notifications';

const CALL_NOTIFICATION_GROUP = 'calls:incoming';

interface CallAck {
  ok: boolean;
  code?: string;
  message?: string;
  call?: CallInfo;
  participants?: CallParticipant[];
}

interface PeerState {
  pc: RTCPeerConnection;
  videoSender: RTCRtpSender | null;
  remoteStream: MediaStream;
  remoteUserId: string;
}

interface RingtoneHandle {
  ctx: AudioContext;
  gain: GainNode;
  timer: number;
}

interface CallContextValue {
  phase: CallPhase;
  call: CallInfo | null;
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  micOn: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  connectedAt: number | null;
  startCall: (conversationId: string, kind: CallKind) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => void;
  hangUp: () => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  toggleScreen: () => Promise<void>;
}

const CallContext = createContext<CallContextValue | null>(null);

function emitWithAck<T>(socket: Socket, event: string, payload: unknown, timeoutMs = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Сервер не відповів. Спробуйте ще раз.')), timeoutMs);
    socket.emit(event, payload, (response: T) => {
      window.clearTimeout(timer);
      resolve(response);
    });
  });
}

function mediaErrorMessage(error: unknown): string {
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'Браузер не підтримує дзвінки. Потрібен HTTPS або localhost.';
  }
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'Доступ до камери й мікрофона заборонено. Дозвольте його в налаштуваннях браузера.';
    }
    if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
      return 'Не знайдено камеру або мікрофон.';
    }
    if (error.name === 'NotReadableError') {
      return 'Камера або мікрофон зайняті іншим застосунком.';
    }
  }
  return 'Не вдалося отримати доступ до камери й мікрофона.';
}

function remoteName(user: MessageSender | undefined): string {
  return user?.displayName || user?.username || 'Учасник';
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const { notify } = useMessenger();
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const showToast = useCallback((title: string, body?: string) => notifyRef.current(title, body), []);

  const [phase, setPhase] = useState<CallPhase>('idle');
  const [call, setCall] = useState<CallInfo | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);

  const callRef = useRef<CallInfo | null>(null);
  const phaseRef = useRef<CallPhase>('idle');
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamsRef = useRef<Record<string, MediaStream>>({});
  const micRef = useRef(true);
  const cameraRef = useRef(false);
  const screenRef = useRef(false);
  const peersRef = useRef<Map<string, PeerState>>(new Map());
  const peerCreationsRef = useRef<Map<string, Promise<PeerState | null>>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const iceConfigRef = useRef<RTCIceServer[]>([]);
  const iceConfigPromiseRef = useRef<Promise<RTCIceServer[]> | null>(null);
  const ringtoneRef = useRef<RingtoneHandle | null>(null);
  const sessionTokenRef = useRef(0);
  const startingRef = useRef(false);
  const cameraPendingRef = useRef(false);

  const setPhaseState = useCallback((next: CallPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const setCallState = useCallback((next: CallInfo | null) => {
    callRef.current = next;
    setCall(next);
  }, []);

  const patchCall = useCallback((update: (current: CallInfo) => CallInfo) => {
    const current = callRef.current;
    if (!current) return;
    const next = update(current);
    callRef.current = next;
    setCall(next);
  }, []);

  const setRemote = useCallback((userId: string, stream: MediaStream | null) => {
    const next = { ...remoteStreamsRef.current };
    if (stream) next[userId] = stream;
    else delete next[userId];
    remoteStreamsRef.current = next;
    setRemoteStreams(next);
  }, []);

  const stopRingtone = useCallback(() => {
    const handle = ringtoneRef.current;
    if (!handle) return;
    ringtoneRef.current = null;
    window.clearInterval(handle.timer);
    void handle.ctx.close().catch(() => undefined);
  }, []);

  const startRingtone = useCallback((mode: 'incoming' | 'outgoing') => {
    stopRingtone();
    try {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const oscillator = ctx.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = mode === 'incoming' ? 620 : 425;
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start();
      const pulse = () => {
        const now = ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.07, now + 0.05);
        gain.gain.setValueAtTime(0.07, now + 0.35);
        gain.gain.linearRampToValueAtTime(0, now + 0.5);
      };
      pulse();
      const timer = window.setInterval(pulse, mode === 'incoming' ? 1900 : 3000);
      ringtoneRef.current = { ctx, gain, timer };
      void ctx.resume().catch(() => undefined);
    } catch {
      // Ringtone is optional; browsers may block audio without a user gesture.
    }
  }, [stopRingtone]);

  const loadIceServers = useCallback(async (): Promise<RTCIceServer[]> => {
    if (iceConfigRef.current.length) return iceConfigRef.current;
    if (!iceConfigPromiseRef.current) {
      iceConfigPromiseRef.current = api.calls.config()
        .then(({ iceServers }) => {
          const servers = iceServers as RTCIceServer[];
          iceConfigRef.current = servers;
          return servers;
        })
        .catch(() => {
          iceConfigPromiseRef.current = null;
          return [{ urls: 'stun:stun.l.google.com:19302' }];
        });
    }
    return iceConfigPromiseRef.current;
  }, []);

  const closePeer = useCallback((remoteUserId: string) => {
    const peer = peersRef.current.get(remoteUserId);
    if (peer) {
      peer.pc.onicecandidate = null;
      peer.pc.ontrack = null;
      peer.pc.onconnectionstatechange = null;
      peer.pc.close();
      peersRef.current.delete(remoteUserId);
    }
    pendingCandidatesRef.current.delete(remoteUserId);
    peerCreationsRef.current.delete(remoteUserId);
  }, []);

  const markActive = useCallback(() => {
    if (phaseRef.current === 'outgoing' || phaseRef.current === 'connecting') {
      setPhaseState('active');
    }
    setConnectedAt((current) => current ?? Date.now());
    stopRingtone();
  }, [setPhaseState, stopRingtone]);

  const flushCandidates = useCallback(async (remoteUserId: string, pc: RTCPeerConnection) => {
    const queued = pendingCandidatesRef.current.get(remoteUserId);
    if (!queued?.length) return;
    pendingCandidatesRef.current.delete(remoteUserId);
    for (const candidate of queued) {
      await pc.addIceCandidate(candidate).catch(() => undefined);
    }
  }, []);

  const createPeerInternal = useCallback(async (remoteUserId: string, initiator: boolean): Promise<PeerState | null> => {
    const currentCall = callRef.current;
    if (!currentCall) return null;
    const iceServers = await loadIceServers();
    if (!callRef.current || callRef.current.id !== currentCall.id) return null;

    const pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 4 });
    const state: PeerState = {
      pc,
      videoSender: null,
      remoteStream: new MediaStream(),
      remoteUserId,
    };
    peersRef.current.set(remoteUserId, state);

    pc.onicecandidate = (event) => {
      if (!event.candidate || !socket) return;
      socket.emit('call:ice', {
        callId: currentCall.id,
        toUserId: remoteUserId,
        candidate: event.candidate.toJSON(),
      });
    };
    pc.ontrack = (event) => {
      const remote = event.streams[0] ?? state.remoteStream;
      if (!event.streams[0]) remote.addTrack(event.track);
      state.remoteStream = remote;
      setRemote(remoteUserId, remote);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') markActive();
      if (pc.connectionState === 'failed') {
        showToast('Проблема зі з\u2019єднанням', 'Не вдалося встановити медіаз\u2019єднання. Перевірте мережу.');
      }
    };

    const local = localStreamRef.current;
    const audioTrack = local?.getAudioTracks()[0];
    if (audioTrack && local) pc.addTrack(audioTrack, local);

    if (initiator) {
      // The offerer owns the video m-line; the answerer binds to it after setRemoteDescription.
      const transceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
      state.videoSender = transceiver.sender;
      const nextVideo = screenRef.current
        ? screenStreamRef.current?.getVideoTracks()[0] ?? null
        : cameraRef.current
          ? local?.getVideoTracks()[0] ?? null
          : null;
      if (nextVideo) await transceiver.sender.replaceTrack(nextVideo).catch(() => undefined);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdp = pc.localDescription?.sdp;
      if (sdp && socket) {
        socket.emit('call:offer', { callId: currentCall.id, toUserId: remoteUserId, sdp });
      }
    }
    return state;
  }, [loadIceServers, markActive, setRemote, showToast, socket]);

  const createPeer = useCallback((remoteUserId: string, initiator: boolean): Promise<PeerState | null> => {
    const existing = peersRef.current.get(remoteUserId);
    if (existing) return Promise.resolve(existing);
    const pending = peerCreationsRef.current.get(remoteUserId);
    if (pending) return pending;
    const promise = createPeerInternal(remoteUserId, initiator)
      .finally(() => peerCreationsRef.current.delete(remoteUserId));
    peerCreationsRef.current.set(remoteUserId, promise);
    return promise;
  }, [createPeerInternal]);

  const handleOffer = useCallback(async (fromUserId: string, sdp: string) => {
    const peer = await createPeer(fromUserId, false);
    if (!peer || !socket || !callRef.current) return;
    await peer.pc.setRemoteDescription({ type: 'offer', sdp });
    const videoTransceiver = peer.pc.getTransceivers().find((transceiver) => transceiver.receiver.track.kind === 'video');
    if (videoTransceiver) {
      videoTransceiver.direction = 'sendrecv';
      peer.videoSender = videoTransceiver.sender;
      const local = localStreamRef.current;
      const nextVideo = screenRef.current
        ? screenStreamRef.current?.getVideoTracks()[0] ?? null
        : cameraRef.current
          ? local?.getVideoTracks()[0] ?? null
          : null;
      if (nextVideo) await videoTransceiver.sender.replaceTrack(nextVideo).catch(() => undefined);
    }
    await flushCandidates(fromUserId, peer.pc);
    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);
    const answerSdp = peer.pc.localDescription?.sdp;
    if (answerSdp) {
      socket.emit('call:answer', { callId: callRef.current.id, toUserId: fromUserId, sdp: answerSdp });
    }
  }, [createPeer, flushCandidates, socket]);

  const handleAnswer = useCallback(async (fromUserId: string, sdp: string) => {
    const peer = peersRef.current.get(fromUserId);
    if (!peer) return;
    await peer.pc.setRemoteDescription({ type: 'answer', sdp });
    await flushCandidates(fromUserId, peer.pc);
  }, [flushCandidates]);

  const handleIce = useCallback((fromUserId: string, candidate: RTCIceCandidateInit) => {
    const peer = peersRef.current.get(fromUserId);
    if (!peer || !peer.pc.remoteDescription) {
      const queued = pendingCandidatesRef.current.get(fromUserId) ?? [];
      queued.push(candidate);
      pendingCandidatesRef.current.set(fromUserId, queued);
      return;
    }
    void peer.pc.addIceCandidate(candidate).catch(() => undefined);
  }, []);

  const broadcastMedia = useCallback(() => {
    if (!socket || !callRef.current) return;
    socket.emit('call:media', {
      callId: callRef.current.id,
      mic: micRef.current,
      camera: cameraRef.current,
      screen: screenRef.current,
    });
  }, [socket]);

  const applyVideoTrack = useCallback(async () => {
    const local = localStreamRef.current;
    const track = screenRef.current
      ? screenStreamRef.current?.getVideoTracks()[0] ?? null
      : cameraRef.current
        ? local?.getVideoTracks()[0] ?? null
        : null;
    await Promise.all([...peersRef.current.values()].map((peer) => (
      peer.videoSender ? peer.videoSender.replaceTrack(track).catch(() => undefined) : Promise.resolve()
    )));
  }, []);

  const stopScreenShare = useCallback(() => {
    if (!screenRef.current) return;
    screenRef.current = false;
    setScreenOn(false);
    const stream = screenStreamRef.current;
    screenStreamRef.current = null;
    setScreenStream(null);
    stream?.getVideoTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    void applyVideoTrack();
    broadcastMedia();
  }, [applyVideoTrack, broadcastMedia]);

  const teardown = useCallback(() => {
    sessionTokenRef.current += 1;
    stopRingtone();
    void dismissBackgroundNotification({ kind: 'calls', group: CALL_NOTIFICATION_GROUP });
    for (const remoteUserId of [...peersRef.current.keys()]) closePeer(remoteUserId);
    peerCreationsRef.current.clear();
    pendingCandidatesRef.current.clear();

    const local = localStreamRef.current;
    localStreamRef.current = null;
    local?.getTracks().forEach((track) => track.stop());
    setLocalStream(null);

    const screen = screenStreamRef.current;
    screenStreamRef.current = null;
    screen?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    setScreenStream(null);

    remoteStreamsRef.current = {};
    setRemoteStreams({});
    micRef.current = true;
    setMicOn(true);
    cameraRef.current = false;
    setCameraOn(false);
    screenRef.current = false;
    setScreenOn(false);
    setConnectedAt(null);
    setPhaseState('idle');
    setCallState(null);
  }, [closePeer, setCallState, setPhaseState, stopRingtone]);

  const prepareLocalMedia = useCallback(async (kind: CallKind): Promise<MediaStream> => {
    if (!navigator.mediaDevices?.getUserMedia) throw new DOMException('Unsupported', 'NotSupportedError');
    let stream: MediaStream;
    let cameraFallback = false;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: kind === 'video'
          ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
          : false,
      });
    } catch (error) {
      const cameraBusy = kind === 'video' && error instanceof DOMException
        && ['NotReadableError', 'NotFoundError', 'OverconstrainedError'].includes(error.name);
      if (!cameraBusy) throw error;
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      cameraFallback = true;
    }
    localStreamRef.current = stream;
    setLocalStream(stream);
    micRef.current = true;
    setMicOn(true);
    const hasVideo = stream.getVideoTracks().length > 0;
    cameraRef.current = hasVideo;
    setCameraOn(hasVideo);
    if (cameraFallback) {
      showToast('Камера недоступна', 'Приєдналися без відео. Натисніть «Камера», щоб спробувати ще раз.');
    }
    return stream;
  }, [showToast]);

  const startCall = useCallback(async (conversationId: string, kind: CallKind) => {
    if (startingRef.current || phaseRef.current !== 'idle') {
      showToast('Уже є активний дзвінок', 'Завершіть поточний дзвінок, щоб розпочати новий.');
      return;
    }
    if (!socket) {
      showToast('Немає з\u2019єднання із сервером', 'Спробуйте ще раз за мить.');
      return;
    }

    startingRef.current = true;
    try {
      const token = ++sessionTokenRef.current;
      let stream: MediaStream;
      try {
        stream = await prepareLocalMedia(kind);
      } catch (error) {
        showToast('Не вдалося почати дзвінок', mediaErrorMessage(error));
        return;
      }
      if (sessionTokenRef.current !== token) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      setPhaseState('outgoing');
      startRingtone('outgoing');
      try {
        const response = await emitWithAck<CallAck>(socket, 'call:invite', { conversationId, kind });
        if (!response.ok || !response.call) {
          teardown();
          showToast('Не вдалося зателефонувати', response.message || 'Спробуйте ще раз.');
          return;
        }
        if (sessionTokenRef.current !== token || !localStreamRef.current) {
          socket.emit('call:leave', { callId: response.call.id });
          return;
        }
        setCallState(response.call);
        setPhaseState('outgoing');
        broadcastMedia();
      } catch (error) {
        teardown();
        showToast('Не вдалося зателефонувати', error instanceof Error ? error.message : 'Спробуйте ще раз.');
      }
    } finally {
      startingRef.current = false;
    }
  }, [broadcastMedia, prepareLocalMedia, setCallState, setPhaseState, showToast, socket, startRingtone, teardown]);

  const acceptCall = useCallback(async () => {
    const current = callRef.current;
    if (!current || phaseRef.current !== 'incoming' || !socket) return;
    const token = sessionTokenRef.current;
    setPhaseState('connecting');
    stopRingtone();

    let stream: MediaStream;
    try {
      stream = await prepareLocalMedia(current.kind);
    } catch (error) {
      socket.emit('call:decline', { callId: current.id });
      teardown();
      showToast('Не вдалося приєднатися', mediaErrorMessage(error));
      return;
    }
    if (sessionTokenRef.current !== token) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    try {
      const response = await emitWithAck<CallAck>(socket, 'call:accept', { callId: current.id });
      if (!response.ok || !response.call) {
        teardown();
        showToast('Не вдалося приєднатися', response.message || 'Дзвінок уже недоступний.');
        return;
      }
      if (sessionTokenRef.current !== token) {
        socket.emit('call:leave', { callId: current.id });
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      setCallState(response.call);
      setPhaseState('connecting');
      broadcastMedia();
      for (const participant of response.participants ?? []) {
        if (participant.userId !== user?.id) void createPeer(participant.userId, false);
      }
    } catch (error) {
      teardown();
      showToast('Не вдалося приєднатися', error instanceof Error ? error.message : 'Спробуйте ще раз.');
    }
  }, [broadcastMedia, createPeer, prepareLocalMedia, setCallState, setPhaseState, showToast, socket, stopRingtone, teardown, user?.id]);

  const declineCall = useCallback(() => {
    const current = callRef.current;
    if (current && socket) socket.emit('call:decline', { callId: current.id });
    teardown();
  }, [socket, teardown]);

  const hangUp = useCallback(() => {
    const current = callRef.current;
    if (current && socket) {
      if (phaseRef.current === 'incoming') socket.emit('call:decline', { callId: current.id });
      else socket.emit('call:leave', { callId: current.id });
    }
    teardown();
  }, [socket, teardown]);

  const toggleMic = useCallback(() => {
    const next = !micRef.current;
    micRef.current = next;
    setMicOn(next);
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = next; });
    broadcastMedia();
  }, [broadcastMedia]);

  const toggleCamera = useCallback(async () => {
    if (callRef.current?.kind !== 'video') return;
    if (cameraRef.current) {
      cameraRef.current = false;
      setCameraOn(false);
      const stream = localStreamRef.current;
      stream?.getVideoTracks().forEach((track) => {
        track.onended = null;
        track.stop();
        stream.removeTrack(track);
      });
      if (!screenRef.current) void applyVideoTrack();
      broadcastMedia();
      return;
    }
    if (cameraPendingRef.current) return;
    cameraPendingRef.current = true;
    const token = sessionTokenRef.current;
    try {
      const camera = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      });
      const track = camera.getVideoTracks()[0];
      const stream = localStreamRef.current;
      if (!track || !stream || !callRef.current || sessionTokenRef.current !== token) {
        camera.getTracks().forEach((item) => item.stop());
        return;
      }
      const merged = new MediaStream([...stream.getTracks(), track]);
      localStreamRef.current = merged;
      setLocalStream(merged);
      cameraRef.current = true;
      setCameraOn(true);
      if (!screenRef.current) void applyVideoTrack();
      broadcastMedia();
    } catch (error) {
      showToast('Камера недоступна', mediaErrorMessage(error));
    } finally {
      cameraPendingRef.current = false;
    }
  }, [applyVideoTrack, broadcastMedia, showToast]);

  const toggleScreen = useCallback(async () => {
    if (screenRef.current) {
      stopScreenShare();
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      showToast('Демонстрація екрана недоступна', 'Браузер не підтримує цю функцію.');
      return;
    }
    const token = sessionTokenRef.current;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15 } },
        audio: false,
      });
      if (sessionTokenRef.current !== token || !callRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      screenStreamRef.current = stream;
      setScreenStream(stream);
      screenRef.current = true;
      setScreenOn(true);
      const track = stream.getVideoTracks()[0];
      if (track) track.onended = () => stopScreenShare();
      await applyVideoTrack();
      broadcastMedia();
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError')) return;
      showToast('Не вдалося почати демонстрацію екрана', 'Перевірте дозволи браузера та спробуйте ще раз.');
    }
  }, [applyVideoTrack, broadcastMedia, showToast, stopScreenShare]);

  useEffect(() => {
    if (!socket || !user) return;

    const onIncoming = ({ call: incoming }: { call: CallInfo }) => {
      if (!incoming) return;
      if (callRef.current || phaseRef.current !== 'idle') {
        socket.emit('call:decline', { callId: incoming.id });
        return;
      }
      setCallState(incoming);
      setPhaseState('incoming');
      startRingtone('incoming');
      const caller = incoming.participants.find((participant) => participant.userId === incoming.initiatorId);
      const title = incoming.conversation.kind === 'direct'
        ? remoteName(caller?.user)
        : incoming.conversation.title || 'Груповий дзвінок';
      const body = incoming.conversation.kind === 'direct'
        ? (incoming.kind === 'video' ? 'Вхідний відеодзвінок' : 'Вхідний аудіодзвінок')
        : 'Вхідний груповий дзвінок';
      showToast(title, body);
      if (isNativeApp() || document.hidden) {
        void notifyInBackground({
          title: `Вхідний дзвінок · ${title}`,
          body,
          kind: 'calls',
          group: CALL_NOTIFICATION_GROUP,
          conversationId: incoming.conversation.id,
        });
      }
    };

    const onHandled = ({ callId }: { callId: string }) => {
      if (callRef.current?.id === callId && phaseRef.current === 'incoming') teardown();
    };

    const onRingStopped = ({ callId }: { callId: string }) => {
      if (callRef.current?.id !== callId || phaseRef.current !== 'incoming') return;
      teardown();
      showToast('Дзвінок уже розпочато', 'Ви не приєдналися до нього.');
    };

    const onPeerJoined = ({ callId, participant }: { callId: string; participant: CallParticipant }) => {
      if (callRef.current?.id !== callId) return;
      patchCall((current) => ({
        ...current,
        participants: [...current.participants.filter((item) => item.userId !== participant.userId), participant],
      }));
      markActive();
      void createPeer(participant.userId, true);
    };

    const onPeerLeft = ({ callId, userId, user: leftUser }: { callId: string; userId: string; user: MessageSender }) => {
      const current = callRef.current;
      if (current?.id !== callId) return;
      closePeer(userId);
      setRemote(userId, null);
      patchCall((active) => ({
        ...active,
        participants: active.participants.filter((participant) => participant.userId !== userId),
      }));
      if (current.conversation.kind === 'group') {
        showToast(remoteName(leftUser), 'Більше не в дзвінку');
      }
    };

    const onDeclined = ({ callId, user: declinedUser }: { callId: string; userId: string; user: MessageSender }) => {
      if (callRef.current?.id !== callId) return;
      showToast('Запрошення відхилено', remoteName(declinedUser));
    };

    const onEnded = ({ callId, reason }: { callId: string; reason: CallEndReason; user?: MessageSender }) => {
      if (callRef.current?.id !== callId) return;
      const wasIncoming = phaseRef.current === 'incoming';
      teardown();
      if (wasIncoming) {
        showToast('Пропущений дзвінок', 'Ви не встигли відповісти.');
      } else if (reason === 'timeout') {
        showToast('Немає відповіді', 'Співрозмовник не відповів.');
      } else if (reason === 'declined') {
        showToast('Дзвінок відхилено');
      } else {
        showToast('Дзвінок завершено');
      }
    };

    const onMedia = ({ callId, userId, mic, camera, screen }: { callId: string; userId: string; mic: boolean; camera: boolean; screen: boolean }) => {
      if (callRef.current?.id !== callId) return;
      patchCall((current) => ({
        ...current,
        participants: current.participants.map((participant) => (
          participant.userId === userId ? { ...participant, mic, camera, screen } : participant
        )),
      }));
    };

    const onOffer = ({ callId, fromUserId, sdp }: { callId: string; fromUserId: string; sdp: string }) => {
      if (callRef.current?.id !== callId) return;
      void handleOffer(fromUserId, sdp).catch(() => {
        showToast('Помилка дзвінка', 'Не вдалося встановити з\u2019єднання.');
      });
    };

    const onAnswer = ({ callId, fromUserId, sdp }: { callId: string; fromUserId: string; sdp: string }) => {
      if (callRef.current?.id !== callId) return;
      void handleAnswer(fromUserId, sdp).catch(() => undefined);
    };

    const onIce = ({ callId, fromUserId, candidate }: { callId: string; fromUserId: string; candidate: RTCIceCandidateInit }) => {
      if (callRef.current?.id !== callId) return;
      handleIce(fromUserId, candidate);
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:handled', onHandled);
    socket.on('call:ring-stopped', onRingStopped);
    socket.on('call:peer-joined', onPeerJoined);
    socket.on('call:peer-left', onPeerLeft);
    socket.on('call:declined', onDeclined);
    socket.on('call:ended', onEnded);
    socket.on('call:media', onMedia);
    socket.on('call:offer', onOffer);
    socket.on('call:answer', onAnswer);
    socket.on('call:ice', onIce);
    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:handled', onHandled);
      socket.off('call:ring-stopped', onRingStopped);
      socket.off('call:peer-joined', onPeerJoined);
      socket.off('call:peer-left', onPeerLeft);
      socket.off('call:declined', onDeclined);
      socket.off('call:ended', onEnded);
      socket.off('call:media', onMedia);
      socket.off('call:offer', onOffer);
      socket.off('call:answer', onAnswer);
      socket.off('call:ice', onIce);
    };
  }, [closePeer, createPeer, handleAnswer, handleIce, handleOffer, markActive, patchCall, setCallState, setPhaseState, setRemote, showToast, socket, startRingtone, teardown, user]);

  useEffect(() => {
    if (!socket) return;
    const onDisconnect = () => {
      if (!callRef.current) return;
      teardown();
      showToast('Дзвінок завершено', 'Втрачено зв\u2019язок із сервером.');
    };
    socket.on('disconnect', onDisconnect);
    return () => { socket.off('disconnect', onDisconnect); };
  }, [showToast, socket, teardown]);

  const value = useMemo<CallContextValue>(() => ({
    phase,
    call,
    localStream,
    screenStream,
    remoteStreams,
    micOn,
    cameraOn,
    screenOn,
    connectedAt,
    startCall,
    acceptCall,
    declineCall,
    hangUp,
    toggleMic,
    toggleCamera,
    toggleScreen,
  }), [
    phase, call, localStream, screenStream, remoteStreams, micOn, cameraOn, screenOn, connectedAt,
    startCall, acceptCall, declineCall, hangUp, toggleMic, toggleCamera, toggleScreen,
  ]);

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall(): CallContextValue {
  const context = useContext(CallContext);
  if (!context) throw new Error('useCall must be used within CallProvider');
  return context;
}
