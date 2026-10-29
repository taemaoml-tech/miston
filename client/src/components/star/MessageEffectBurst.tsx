import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { StarCosmetic } from '../../types/models';
import { configString, configStringArray } from '../../utils/star';

const FALLBACK_COLORS = ['#f472b6', '#facc15', '#38bdf8', '#34d399'];

export function MessageEffectBurst({ effect, burst }: { effect: StarCosmetic | null; burst: number }) {
  const [active, setActive] = useState(false);
  const kind = effect ? configString(effect.config, 'effect') : undefined;
  const colors = useMemo(() => {
    const configured = effect ? configStringArray(effect.config, 'colors') : [];
    return configured.length ? configured : FALLBACK_COLORS;
  }, [effect?.itemId, effect]);

  useEffect(() => {
    if (!burst || !effect) return;
    setActive(true);
    const timer = window.setTimeout(() => setActive(false), 1500);
    return () => window.clearTimeout(timer);
  }, [burst, effect]);

  if (!active || !kind) return null;
  const count = kind === 'fireworks' ? 24 : 30;

  return (
    <div key={burst} className="pointer-events-none absolute inset-0 z-30 overflow-hidden" aria-hidden>
      {Array.from({ length: count }, (_, index) => {
        const angle = (index / count) * Math.PI * 2 + (kind === 'fireworks' ? 0 : index * 0.31);
        const distance = 90 + ((index * 37) % 120);
        const spread = kind === 'fireworks' ? 1 : 0.65;
        const dx = Math.cos(angle) * distance * spread;
        const dy = Math.sin(angle) * distance + (kind === 'fireworks' ? 30 : 70);
        const style = {
          '--dx': `${dx.toFixed(1)}px`,
          '--dy': `${dy.toFixed(1)}px`,
          '--rot': `${(index * 47) % 540}deg`,
          '--delay': `${(index % 6) * 35}ms`,
          backgroundColor: colors[index % colors.length],
        } as CSSProperties;
        return <span key={`${burst}-${index}`} className={kind === 'fireworks' ? 'firework-spark' : 'confetti-piece'} style={style} />;
      })}
    </div>
  );
}
