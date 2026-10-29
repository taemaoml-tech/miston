import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const RING_RADIUS = 47;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

interface VideoNoteProps {
  src: string;
  durationSeconds?: number | null;
  label: string;
}

function clock(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const total = Math.round(value);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function VideoNote({ src, durationSeconds, label }: VideoNoteProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(durationSeconds || 0);

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setDuration(durationSeconds || 0);
  }, [src, durationSeconds]);

  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      const video = videoRef.current;
      if (!video) return;
      const total = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : duration;
      setProgress(total > 0 ? Math.min(1, video.currentTime / total) : 0);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [playing, duration]);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      video.pause();
      setPlaying(false);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    const next = !muted;
    video.muted = next;
    setMuted(next);
  };

  return (
    <div className="relative h-52 w-52 select-none sm:h-60 sm:w-60">
      <svg className="pointer-events-none absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r={RING_RADIUS} fill="none" strokeWidth="2" className="stroke-slate-300/70 dark:stroke-slate-600/70" />
        <circle
          cx="50"
          cy="50"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * (1 - progress)}
          className="stroke-accent-500 transition-[stroke-dashoffset] duration-150 ease-linear"
        />
      </svg>
      <div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggle();
          }
        }}
        aria-label={playing ? `Призупинити відеокружечок ${label}` : `Відтворити відеокружечок ${label}`}
        className="absolute inset-[6px] cursor-pointer overflow-hidden rounded-full bg-slate-900 shadow-md outline-none ring-accent-400 transition focus-visible:ring-2"
      >
        <video
          ref={videoRef}
          src={src}
          playsInline
          muted={muted}
          preload="metadata"
          className="pointer-events-none h-full w-full object-cover"
          onLoadedMetadata={(event) => {
            const value = event.currentTarget.duration;
            if (Number.isFinite(value) && value > 0) setDuration(value);
          }}
          onEnded={() => {
            setPlaying(false);
            setProgress(0);
            const video = videoRef.current;
            if (video) video.currentTime = 0;
          }}
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
        />
        {!playing && (
          <span className="absolute inset-0 flex items-center justify-center bg-slate-950/25 transition hover:bg-slate-950/35">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-950/55 text-white backdrop-blur-sm">
              <Play size={24} fill="currentColor" className="ml-0.5" />
            </span>
          </span>
        )}
        {!playing && progress === 0 && duration > 0 && (
          <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-slate-950/60 px-2.5 py-1 text-[11px] font-medium tabular-nums text-white backdrop-blur-sm">
            {clock(duration)}
          </span>
        )}
        {playing && (
          <span className="absolute bottom-3 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full bg-slate-950/45 text-white backdrop-blur-sm" aria-hidden>
            <Pause size={15} fill="currentColor" />
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          toggleMute();
        }}
        className="absolute bottom-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-slate-950/60 text-white backdrop-blur-sm transition hover:bg-slate-950/80"
        aria-label={muted ? 'Увімкнути звук відеокружечка' : 'Вимкнути звук відеокружечка'}
      >
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
    </div>
  );
}
