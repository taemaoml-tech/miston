import { Mark } from './Logo';

export const SLOGAN = 'Miston — твій сучасний месенджер.';

export function Splash({ label = SLOGAN, hint }: { label?: string; hint?: string }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-6 overflow-hidden bg-slate-50 px-6 dark:bg-slate-950">
      <span className="splash-halo pointer-events-none absolute h-64 w-64 rounded-full bg-gradient-to-br from-indigo-400/40 to-violet-500/30 blur-3xl" />
      <Mark size={76} className="splash-mark relative rounded-[22px] shadow-glow" />
      <div className="splash-copy relative text-center">
        <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Miston</p>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{label}</p>
      </div>
      <div className="relative h-1 w-40 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <span className="splash-bar block h-full w-1/2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" />
      </div>
      {hint && <p role="status" className="relative text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
