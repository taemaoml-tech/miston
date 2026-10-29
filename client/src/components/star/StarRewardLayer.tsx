import { Sparkles, Trophy, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { StarAchievement, StarReward } from '../../types/models';

interface StarRewardLayerProps {
  celebration: { key: number; rewards: StarReward[]; achievements: StarAchievement[] } | null;
  onClose: () => void;
}

export function StarRewardLayer({ celebration, onClose }: StarRewardLayerProps) {
  if (!celebration) return null;
  const total = celebration.rewards.reduce((sum, reward) => sum + reward.amount, 0);
  return createPortal(
    <div className="pointer-events-none fixed right-3 top-3 z-[130] w-[min(92vw,360px)] animate-star-toast sm:right-5 sm:top-5" role="status" aria-live="polite">
      <div className="pointer-events-auto overflow-hidden rounded-2xl border border-amber-300/40 bg-slate-950/95 text-white shadow-2xl backdrop-blur-xl dark:border-amber-400/30">
        <div className="relative flex items-start gap-3 p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 text-slate-950 shadow-glow">
            <Sparkles size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">Star-нагорода</p>
            {total > 0 && <p className="mt-0.5 text-xl font-bold tabular-nums">+{total} <span className="text-sm font-semibold text-amber-200">зірок</span></p>}
            <ul className="mt-1.5 space-y-1 text-xs text-slate-300">
              {celebration.rewards.map((reward) => <li key={reward.id} className="flex items-center gap-1.5"><span className="text-amber-300">★</span><span className="truncate">{reward.description}</span><span className="ml-auto shrink-0 font-semibold tabular-nums text-amber-200">+{reward.amount}</span></li>)}
            </ul>
            {celebration.achievements.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {celebration.achievements.map((achievement) => (
                  <span key={achievement.id} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white"><Trophy size={11} className="text-amber-300" />{achievement.icon} {achievement.name}</span>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white" aria-label="Закрити нагороду"><X size={15} /></button>
        </div>
        <div className="h-1 bg-white/10"><div className="h-full bg-gradient-to-r from-amber-300 to-orange-500 animate-star-progress" /></div>
      </div>
    </div>,
    document.body,
  );
}
