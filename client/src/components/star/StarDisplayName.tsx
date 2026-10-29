import { BadgeCheck } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { StarCosmetics } from '../../types/models';
import { configString, configStringArray } from '../../utils/star';

interface StarDisplayNameProps {
  name: string;
  cosmetics?: StarCosmetics | null;
  verified?: boolean;
  className?: string;
}

export function StarDisplayName({ name, cosmetics, verified, className = '' }: StarDisplayNameProps) {
  const nickname = cosmetics?.nickname;
  const badge = cosmetics?.badge;
  const color = nickname ? configString(nickname.config, 'color') : undefined;
  const gradient = nickname ? configStringArray(nickname.config, 'gradient') : [];
  const animated = nickname?.config?.animated === true;
  const badgeEmoji = badge ? configString(badge.config, 'emoji') ?? badge.icon : undefined;
  const badgeLabel = badge ? configString(badge.config, 'label') ?? badge.name : undefined;
  const style: CSSProperties | undefined = gradient.length >= 2
    ? { backgroundImage: `linear-gradient(90deg, ${gradient.join(', ')})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }
    : color ? { color } : undefined;

  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className}`}>
      <span className={`truncate ${gradient.length >= 2 && animated ? 'avatar-frame-animated' : ''}`} style={style}>{name}</span>
      {verified && <BadgeCheck size={14} className="shrink-0 text-sky-500" aria-label="Верифікований акаунт" role="img" />}
      {badgeEmoji && <span title={badgeLabel} aria-label={badgeLabel} className="shrink-0 text-[0.95em] leading-none">{badgeEmoji}</span>}
    </span>
  );
}
