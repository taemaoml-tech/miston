import { Camera, RotateCcw, Send, Square, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api';
import type { Message } from '../../types/models';
import { errorMessage, formatDuration } from '../../utils/format';
import {
  VIDEO_NOTE_MAX_SECONDS,
  compressVideoNote,
  needsVideoNoteCompression,
  pickVideoNoteMime,
  videoNoteBaseMime,
  videoNoteErrorMessage,
  videoNoteExtension,
} from '../../utils/videoNote';

type Stage = 'starting' | 'recording' | 'preview' | 'compressing' | 'sending' | 'error';

const RING_RADIUS = 47;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

interface VideoNoteRecorderProps {
  conversationId: string;
  onSent: (message: Message) => void;
  onClose: () => void;
  replyToId?: string | null;
}

export function VideoNoteRecorder({ conversationId, onSent, onClose, replyToId = null }: VideoNoteRecorderProps) {
  const [stage, setStage] = useState<Stage>('starting');
  const [seconds, setSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [compressProgress, setCompressProgress] = useState(0);
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | undefined>(undefined);
  const startedAtRef = useRef(0);
  const runTokenRef = useRef(0);
  const cancelledRef = useRef(false);
  const blobRef = useRef<Blob | null>(null);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const clearTimer = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = undefined;
  };

  function startRecording() {
    const token = runTokenRef.current + 1;
    runTokenRef.current = token;
    setError('');
    setCompressProgress(0);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    blobRef.current = null;
    cancelledRef.current = false;
    setStage('starting');
    setSeconds(0);

    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        setError('Браузер не підтримує запис відео. Потрібен HTTPS або localhost.');
        setStage('error');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: {
            facingMode: 'user',
            width: { ideal: 480 },
            height: { ideal: 480 },
            aspectRatio: { ideal: 1 },
            frameRate: { ideal: 30, max: 30 },
          },
        });
        if (runTokenRef.current !== token) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const mimeType = pickVideoNoteMime();
        const recorder = new MediaRecorder(stream, {
          ...(mimeType ? { mimeType } : {}),
          videoBitsPerSecond: 800_000,
          audioBitsPerSecond: 64_000,
        });
        chunksRef.current = [];
        recorderRef.current = recorder;
        recorder.ondataavailable = (event) => {
          if (event.data.size) chunksRef.current.push(event.data);
        };
        recorder.onstop = () => {
          clearTimer();
          stopTracks();
          recorderRef.current = null;
          if (cancelledRef.current || runTokenRef.current !== token) return;
          const duration = Math.min(VIDEO_NOTE_MAX_SECONDS, Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)));
          const blob = new Blob(chunksRef.current, { type: videoNoteBaseMime(recorder.mimeType || 'video/webm') });
          if (!blob.size) {
            cancelledRef.current = true;
            setError('Не вдалося записати відео. Перевірте камеру та спробуйте ще раз.');
            setStage('error');
            return;
          }
          blobRef.current = blob;
          setSeconds(duration);
          setPreviewUrl(URL.createObjectURL(blob));
          setStage('preview');
        };
        recorder.start(250);
        startedAtRef.current = Date.now();
        setStage('recording');
        timerRef.current = window.setInterval(() => {
          const elapsed = (Date.now() - startedAtRef.current) / 1000;
          setSeconds(Math.min(VIDEO_NOTE_MAX_SECONDS, elapsed));
          if (elapsed >= VIDEO_NOTE_MAX_SECONDS && recorder.state === 'recording') recorder.stop();
        }, 250);
      } catch (cause) {
        stopTracks();
        setError(videoNoteErrorMessage(cause));
        setStage('error');
      }
    })();
  }

  useEffect(() => {
    // A deferred start collapses StrictMode's mount/cleanup/mount cycle into a
    // single getUserMedia call; two overlapping streams can starve the encoder.
    const startTimer = window.setTimeout(() => startRecording(), 0);
    return () => {
      window.clearTimeout(startTimer);
      runTokenRef.current += 1;
      cancelledRef.current = true;
      clearTimer();
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.onstop = null;
        if (recorder.state !== 'inactive') recorder.stop();
      }
      recorderRef.current = null;
      stopTracks();
    };
    // Recording starts once per mounted modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const video = liveVideoRef.current;
    if (!video || !streamRef.current) return;
    video.srcObject = streamRef.current;
    void video.play().catch(() => undefined);
  }, [stage]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      cancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // cancel is stable for the lifetime of the modal
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopRecording() {
    clearTimer();
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
    } else {
      stopTracks();
    }
  }

  function cancel() {
    runTokenRef.current += 1;
    cancelledRef.current = true;
    clearTimer();
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      if (recorder.state !== 'inactive') recorder.stop();
    }
    recorderRef.current = null;
    stopTracks();
    onClose();
  }

  async function send() {
    const blob = blobRef.current;
    if (!blob || stage !== 'preview') return;
    setError('');
    let payload = blob;
    try {
      if (needsVideoNoteCompression(blob)) {
        setStage('compressing');
        setCompressProgress(0);
        payload = await compressVideoNote(blob, {
          durationSeconds: seconds,
          onProgress: (value) => setCompressProgress(value),
        });
      }
      setStage('sending');
      const uploadType = videoNoteBaseMime(payload.type || 'video/webm');
      const extension = videoNoteExtension(uploadType);
      const file = new File([payload], `video-note-${Date.now()}.${extension}`, {
        type: uploadType,
      });
      const result = await api.conversations.sendFile(conversationId, file, '', 'video_note', Math.round(seconds), replyToId);
      onSent(result.message);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
      setStage('preview');
    }
  }

  const busy = stage === 'compressing' || stage === 'sending';
  const ringProgress = stage === 'recording'
    ? Math.min(1, seconds / VIDEO_NOTE_MAX_SECONDS)
    : stage === 'preview' || busy
      ? 1
      : 0;
  const ringTone = stage === 'recording' ? 'stroke-rose-500' : 'stroke-accent-500';

  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-slate-950/95 p-4 text-white backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Відеокружечок">
      <header className="flex shrink-0 items-center justify-between gap-3 pb-2">
        <button type="button" onClick={cancel} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20" aria-label="Закрити запис відеокружечка">
          <X size={20} />
        </button>
        <div className="min-w-0 text-center">
          <p className="text-sm font-semibold">Відеокружечок</p>
          <p className="text-xs text-slate-400">{stage === 'recording' ? 'Натисніть, щоб зупинити' : stage === 'preview' ? 'Перегляд перед відправкою' : stage === 'compressing' ? 'Стискаємо відео…' : stage === 'sending' ? 'Надсилаємо…' : 'Запис із камери'}</p>
        </div>
        <span className="h-10 w-10" aria-hidden />
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6">
        <div className="relative" style={{ width: 'min(78vw, 380px)', height: 'min(78vw, 380px)' }}>
          <svg className="pointer-events-none absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
            <circle cx="50" cy="50" r={RING_RADIUS} fill="none" strokeWidth="2.5" className="stroke-white/15" />
            <circle
              cx="50"
              cy="50"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={RING_LENGTH}
              strokeDashoffset={RING_LENGTH * (1 - ringProgress)}
              className={`${ringTone} transition-[stroke-dashoffset] duration-200`}
            />
          </svg>
          <div className="absolute inset-[7px] overflow-hidden rounded-full border border-white/10 bg-slate-900">
            {stage === 'preview' && previewUrl ? (
              <video key="note-preview" src={previewUrl} autoPlay muted playsInline className="h-full w-full object-cover" aria-label="Попередній перегляд відеокружечка" />
            ) : stage === 'error' ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
                <Camera size={40} className="text-slate-500" aria-hidden />
                <p className="text-sm text-slate-300">{error || 'Запис недоступний'}</p>
              </div>
            ) : (
              <video key="live-camera" ref={liveVideoRef} autoPlay muted playsInline className="h-full w-full scale-x-[-1] object-cover" aria-label="Попередній перегляд камери" />
            )}
            {stage === 'starting' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/80">
                <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                <p className="text-xs text-slate-300">Вмикаємо камеру…</p>
              </div>
            )}
            {busy && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/75 px-8 text-center">
                <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                <p className="text-sm font-medium">{stage === 'sending' ? 'Надсилаємо відеокружечок…' : `Стискаємо відео… ${Math.round(compressProgress * 100)}%`}</p>
              </div>
            )}
            {stage === 'recording' && (
              <span className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-rose-600/90 px-2.5 py-1 text-[11px] font-semibold tabular-nums backdrop-blur">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                {formatDuration(seconds)} / {formatDuration(VIDEO_NOTE_MAX_SECONDS)}
              </span>
            )}
          </div>
        </div>

        {error && stage !== 'error' && (
          <div role="alert" className="max-w-md rounded-xl bg-rose-950/60 px-3.5 py-2 text-center text-sm text-rose-200">{error}</div>
        )}

        {stage === 'error' ? (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={startRecording} className="secondary-btn border-white/20 bg-white/10 text-white hover:bg-white/20">Спробувати ще раз</button>
            <button type="button" onClick={cancel} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-white/10">Закрити</button>
          </div>
        ) : stage === 'preview' ? (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={cancel} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/10">Скасувати</button>
            <button type="button" onClick={startRecording} className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10">
              <RotateCcw size={16} /> Перезаписати
            </button>
            <button type="button" onClick={() => void send()} className="primary-btn rounded-full px-6 py-3 shadow-glow" aria-label="Надіслати відеокружечок">
              <Send size={18} /> Надіслати
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={stopRecording}
              disabled={stage !== 'recording'}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-rose-600 text-white shadow-2xl transition hover:bg-rose-500 active:scale-95 disabled:opacity-40"
              aria-label="Зупинити запис відеокружечка"
            >
              <Square size={26} fill="currentColor" />
            </button>
            <p className="text-xs text-slate-400">Максимум {formatDuration(VIDEO_NOTE_MAX_SECONDS)} · без тексту</p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
