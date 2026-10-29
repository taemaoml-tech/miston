import type { CSSProperties } from 'react';
import { assetUrl } from '../../api/client';
import type { StarCosmetics } from '../../types/models';
import { initials } from '../../utils/format';
import { configString, configStringArray, hexToRgb } from '../../utils/star';

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  online?: boolean;
  square?: boolean;
  cosmetics?: StarCosmetics | null;
}

const sizes = { sm: 'h-8 w-8 text-[11px]', md: 'h-11 w-11 text-sm', lg: 'h-14 w-14 text-lg', xl: 'h-24 w-24 text-2xl' };

export function Avatar({ name, src, size = 'md', online, square = false, cosmetics }: AvatarProps) {
  const url = assetUrl(src);
  const frame = cosmetics?.frame;
  const effect = cosmetics?.avatar_effect;
  const gradient = frame ? configStringArray(frame.config, 'gradient') : [];
  const frameRgb = frame ? hexToRgb(configString(frame.config, 'glow') ?? gradient[0] ?? '') : null;
  const animated = frame?.config?.animated === true;
  const effectName = effect ? configString(effect.config, 'effect') : undefined;
  const effectRgb = effect ? hexToRgb(configString(effect.config, 'color') ?? '') : null;
  const radius = square ? 'rounded-2xl' : 'rounded-full';
  const hasFrame = gradient.length >= 2;
  const style = {
    ...(effectRgb ? { '--effect-rgb': effectRgb } : {}),
    ...(hasFrame ? { background: `linear-gradient(135deg, ${gradient.join(', ')})` } : {}),
    ...(frameRgb && !hasFrame ? { boxShadow: `0 0 0 2px rgb(${frameRgb} / .75)` } : {}),
  } as CSSProperties;

  return (
    <div
      className={`relative shrink-0 ${sizes[size]} ${effectName === 'pulse' ? 'avatar-effect-pulse' : ''} ${effectName === 'orbit' ? 'avatar-effect-orbit' : ''}`}
      style={style}
    >
      <div className={`h-full w-full ${radius} ${hasFrame ? 'p-[2px]' : ''} ${animated ? 'avatar-frame-animated' : ''}`} style={hasFrame ? { backgroundSize: animated ? '200% 200%' : undefined } : undefined}>
        <div className={`flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-400 to-violet-600 font-semibold text-white ${radius}`}>
          {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : initials(name)}
        </div>
      </div>
      {online !== undefined && (
        <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white dark:border-slate-900 ${online ? 'bg-emerald-500' : 'bg-slate-400'}`} aria-label={online ? 'Онлайн' : 'Офлайн'} />
      )}
    </div>
  );
}
