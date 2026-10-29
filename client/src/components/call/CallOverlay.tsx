import {
  Mic, MicOff, Phone, PhoneOff, ScreenShare, ScreenShareOff, Video, VideoOff,
} from 'lucide-react';
import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCall } from '../../contexts/CallContext';
import { useMessenger } from '../../contexts/MessengerContext';
import type { CallInfo, CallParticipant, MessageSender } from '../../types/models';
import { Avatar } from '../common/Avatar';

function displayName(user: MessageSender | undefined): string {
  return user?.displayName || user?.username || 'Учасник';
}

function participantsLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} учасник`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} учасники`;
  return `${count} учасників`;
}

function formatDuration(startedAt: number | null): string {
  if (!startedAt) return '00:00';
  const total = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

function useElapsed(startedAt: number | null): string {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return formatDuration(startedAt);
}

function StreamVideo({ stream, muted, className }: { stream: MediaStream; muted: boolean; className: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (element.srcObject !== stream) element.srcObject = stream;
    if (!muted) void element.play().catch(() => undefined);
  }, [stream, muted]);
  return createElement('video', { ref, autoPlay: true, playsInline: true, muted, className });
}

function StreamAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (element.srcObject !== stream) element.srcObject = stream;
    void element.play().catch(() => undefined);
  }, [stream]);
  return createElement('audio', { ref, autoPlay: true });
}

function ParticipantTile({ participant, stream, isLocal, compact = false }: {
  participant: CallParticipant;
  stream?: MediaStream;
  isLocal?: boolean;
  compact?: boolean;
}) {
  const videoVisible = Boolean(stream) && (participant.screen || participant.camera);
  const name = displayName(participant.user);
  return (
    <div className={`relative flex min-h-0 items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-slate-800/80 ${compact ? 'h-full w-full' : 'h-full w-full'}`}>
      {videoVisible && stream ? (
        <StreamVideo
          stream={stream}
          muted
          className={`h-full w-full ${participant.screen ? 'bg-black object-contain' : 'object-cover'}`}
        />
      ) : (
        <div className="flex flex-col items-center gap-3 p-4 text-center">
          <Avatar name={name} src={participant.user.avatarUrl} size={compact ? 'md' : 'xl'} />
          {!compact && <p className="max-w-full truncate text-sm font-medium text-white/90">{name}</p>}
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
        <span className="flex max-w-[75%] items-center gap-2 rounded-full bg-slate-950/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
          {participant.screen && <ScreenShare size={12} />}
          <span className="truncate">{name}{isLocal ? ' (ви)' : ''}</span>
        </span>
        {!participant.mic && <span className="rounded-full bg-rose-600 p-1.5 text-white" title="Мікрофон вимкнено"><MicOff size={13} /></span>}
      </div>
      {participant.screen && (
        <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-accent-600/85 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
          Демонстрація екрана
        </span>
      )}
    </div>
  );
}

function ControlButton({ label, onClick, active = false, danger = false, children }: {
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  const tone = danger
    ? 'bg-rose-600 hover:bg-rose-500 text-white'
    : active
      ? 'bg-white text-slate-900 hover:bg-slate-100'
      : 'bg-white/10 text-white hover:bg-white/20';
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className={`flex h-12 w-12 items-center justify-center rounded-full transition active:scale-95 sm:h-14 sm:w-14 ${tone}`}>
      {children}
    </button>
  );
}

function RingingCard() {
  const { call, acceptCall, declineCall } = useCall();
  if (!call) return null;
  const caller = call.participants.find((participant) => participant.userId === call.initiatorId);
  const isGroup = call.conversation.kind === 'group';
  const name = isGroup ? call.conversation.title || 'Груповий дзвінок' : displayName(caller?.user);
  const subtitle = isGroup
    ? `Груповий ${call.kind === 'video' ? 'відео' : 'аудіо'}дзвінок${caller ? ` · ${displayName(caller.user)}` : ''}`
    : `Вхідний ${call.kind === 'video' ? 'відео' : 'аудіо'}дзвінок`;

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Вхідний дзвінок">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900 p-7 text-center text-white shadow-2xl animate-slide-up">
        <div className="relative mx-auto mb-5 flex h-24 w-24 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/25" />
          <Avatar name={name} src={isGroup ? call.conversation.avatarUrl : caller?.user.avatarUrl} size="xl" />
        </div>
        <h2 className="truncate text-xl font-semibold">{name}</h2>
        <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
        <div className="mt-8 flex items-center justify-center gap-8">
          <div className="flex flex-col items-center gap-2">
            <button type="button" onClick={declineCall} aria-label="Відхилити дзвінок" className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-600 text-white transition hover:bg-rose-500 active:scale-95">
              <PhoneOff size={26} />
            </button>
            <span className="text-xs text-slate-400">Відхилити</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button type="button" onClick={() => void acceptCall()} aria-label="Прийняти дзвінок" className="flex h-16 w-16 animate-pulse items-center justify-center rounded-full bg-emerald-500 text-white transition hover:bg-emerald-400 active:scale-95">
              {call.kind === 'video' ? <Video size={26} /> : <Phone size={26} />}
            </button>
            <span className="text-xs text-slate-400">Прийняти</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActiveCall({ call }: { call: CallInfo }) {
  const { user } = useAuth();
  const { conversations } = useMessenger();
  const {
    phase, localStream, screenStream, remoteStreams, micOn, cameraOn, screenOn, connectedAt,
    hangUp, toggleMic, toggleCamera, toggleScreen,
  } = useCall();
  const elapsed = useElapsed(connectedAt);

  const conversation = conversations.find((item) => item.id === call.conversationId);
  const remoteParticipants = call.participants.filter((participant) => participant.userId !== user?.id);
  const localParticipant = useMemo<CallParticipant | null>(() => (user ? {
    userId: user.id,
    user: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl },
    mic: micOn,
    camera: cameraOn,
    screen: screenOn,
  } : null), [cameraOn, micOn, screenOn, user]);

  const directPeer = call.conversation.kind === 'direct' ? remoteParticipants[0] : undefined;
  const directMember = conversation?.members.find((member) => member.id !== user?.id);
  const directTitle = directPeer ? displayName(directPeer.user) : directMember?.displayName || call.conversation.title || 'Дзвінок';
  const directAvatar = directPeer?.user.avatarUrl ?? directMember?.avatarUrl ?? call.conversation.avatarUrl;
  const title = call.conversation.kind === 'direct' ? directTitle : call.conversation.title || conversation?.title || 'Груповий дзвінок';
  const avatar = call.conversation.kind === 'direct' ? directAvatar : call.conversation.avatarUrl ?? conversation?.avatarUrl;
  const hasScreen = screenOn || remoteParticipants.some((participant) => participant.screen);
  const videoLayout = call.kind === 'video' || hasScreen;
  const everyone = localParticipant ? [localParticipant, ...remoteParticipants] : remoteParticipants;
  const participantCount = everyone.length;

  const status = phase === 'outgoing'
    ? 'Виклик…'
    : phase === 'connecting'
      ? 'З\u2019єднання…'
      : hasScreen
        ? `Демонстрація екрана · ${elapsed}`
        : call.conversation.kind === 'direct'
          ? `${call.kind === 'video' ? 'Відеодзвінок' : 'Аудіодзвінок'} · ${elapsed}`
          : `${participantsLabel(participantCount)} · ${elapsed}`;

  const localPreview = screenOn ? screenStream : localStream;

  return (
    <div className="fixed inset-0 z-[80] flex h-dvh flex-col bg-slate-950 text-white" role="dialog" aria-modal="true" aria-label={`${call.kind === 'video' ? 'Відеодзвінок' : 'Аудіодзвінок'} з ${title}`}>
      <header className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-6">
        <Avatar name={title} src={avatar} size="md" square={call.conversation.kind !== 'direct'} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold sm:text-lg">{title}</h1>
          <p className="truncate text-xs text-slate-400 sm:text-sm">{status}</p>
        </div>
        {hasScreen && <span className="hidden items-center gap-1.5 rounded-full bg-accent-500/15 px-3 py-1.5 text-xs font-medium text-accent-300 sm:flex"><ScreenShare size={14} /> Екран</span>}
        {phase === 'outgoing' && <span className="hidden items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs text-slate-300 sm:flex"><span className="flex gap-1">{[0, 1, 2].map((dot) => <span key={dot} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${dot * 140}ms` }} />)}</span> Очікування</span>}
      </header>

      <main className="flex min-h-0 flex-1 flex-col px-3 pb-2 sm:px-6">
        {videoLayout ? (
          call.conversation.kind === 'direct' ? (
            <div className="relative mx-auto flex h-full w-full max-w-6xl flex-1 items-center justify-center py-2">
              <div className="h-full w-full">
                {directPeer ? (
                  <ParticipantTile participant={directPeer} stream={remoteStreams[directPeer.userId]} />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-4 rounded-3xl border border-white/10 bg-slate-900/60">
                    <Avatar name={directTitle} src={directAvatar} size="xl" />
                    <p className="text-sm text-slate-400">{phase === 'outgoing' ? 'Очікуємо відповіді…' : 'Підключення…'}</p>
                  </div>
                )}
              </div>
              <div className="absolute bottom-4 right-4 aspect-[3/4] w-28 overflow-hidden rounded-2xl border border-white/20 bg-slate-900 shadow-2xl sm:w-40">
                {localParticipant && (
                  <ParticipantTile participant={localParticipant} stream={localPreview ?? undefined} isLocal compact />
                )}
              </div>
            </div>
          ) : (
            <div className="subtle-scrollbar mx-auto grid w-full max-w-7xl flex-1 auto-rows-fr gap-3 overflow-y-auto py-2 sm:grid-cols-2 xl:grid-cols-3">
              {everyone.map((participant) => (
                <div key={participant.userId} className="min-h-[180px] sm:min-h-[220px]">
                  <ParticipantTile
                    participant={participant}
                    stream={participant.userId === user?.id ? localPreview ?? undefined : remoteStreams[participant.userId]}
                    isLocal={participant.userId === user?.id}
                  />
                </div>
              ))}
              {everyone.length === 0 && <p className="col-span-full py-10 text-center text-sm text-slate-400">Очікуємо учасників…</p>}
            </div>
          )
        ) : (
          <div className="mx-auto flex w-full max-w-4xl flex-1 flex-wrap content-center items-center justify-center gap-x-8 gap-y-6 py-6">
            {everyone.map((participant) => (
              <div key={participant.userId} className="flex w-24 flex-col items-center gap-2 text-center sm:w-28">
                <div className="relative">
                  <Avatar name={displayName(participant.user)} src={participant.user.avatarUrl} size="xl" />
                  {!participant.mic && <span className="absolute -bottom-1 -right-1 rounded-full bg-rose-600 p-1.5 text-white"><MicOff size={14} /></span>}
                </div>
                <p className="max-w-full truncate text-sm text-slate-200">{displayName(participant.user)}{participant.userId === user?.id ? ' (ви)' : ''}</p>
              </div>
            ))}
          </div>
        )}

      </main>

      <footer className="shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3 sm:px-6">
        <div className="mx-auto flex max-w-lg items-start justify-center gap-3 sm:gap-5">
          <div className="flex flex-col items-center gap-1.5">
            <ControlButton label={micOn ? 'Вимкнути мікрофон' : 'Увімкнути мікрофон'} onClick={toggleMic} active={!micOn}>
              {micOn ? <Mic size={22} /> : <MicOff size={22} />}
            </ControlButton>
            <span className="text-[10px] text-slate-400">Мікрофон</span>
          </div>
          {call.kind === 'video' && (
            <div className="flex flex-col items-center gap-1.5">
              <ControlButton label={cameraOn ? 'Вимкнути камеру' : 'Увімкнути камеру'} onClick={toggleCamera} active={!cameraOn}>
                {cameraOn ? <Video size={22} /> : <VideoOff size={22} />}
              </ControlButton>
              <span className="text-[10px] text-slate-400">Камера</span>
            </div>
          )}
          <div className="flex flex-col items-center gap-1.5">
            <ControlButton label={screenOn ? 'Зупинити демонстрацію екрана' : 'Демонструвати екран'} onClick={() => void toggleScreen()} active={screenOn}>
              {screenOn ? <ScreenShareOff size={22} /> : <ScreenShare size={22} />}
            </ControlButton>
            <span className="text-[10px] text-slate-400">Екран</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <ControlButton label={phase === 'outgoing' ? 'Скасувати виклик' : 'Завершити дзвінок'} onClick={hangUp} danger>
              <PhoneOff size={22} />
            </ControlButton>
            <span className="text-[10px] text-slate-400">{phase === 'outgoing' ? 'Скасувати' : 'Завершити'}</span>
          </div>
        </div>
      </footer>

      {remoteParticipants.map((participant) => {
        const stream = remoteStreams[participant.userId];
        return stream ? <StreamAudio key={participant.userId} stream={stream} /> : null;
      })}
    </div>
  );
}

export function CallOverlay() {
  const { phase, call } = useCall();
  if (!call) return null;
  if (phase === 'incoming') return <RingingCard />;
  return <ActiveCall call={call} />;
}
