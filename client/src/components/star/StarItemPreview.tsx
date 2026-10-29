import type { StarCosmetic, StarItem, User } from '../../types/models';
import { configString, configStringArray } from '../../utils/star';
import { Avatar } from '../common/Avatar';
import { StarDisplayName } from './StarDisplayName';

function asCosmetic(item: StarItem): StarCosmetic {
  return { itemId: item.id, name: item.name, icon: item.icon, type: item.type, config: item.config };
}

export function StarItemPreview({ item, user }: { item: StarItem; user: User | null }) {
  const name = user?.displayName ?? 'Ваше ім\'я';
  const frameCosmetic = asCosmetic(item);
  const effectCosmetic = asCosmetic(item);
  if (item.type === 'profile_frame') {
    return <Avatar name={name} src={user?.avatarUrl} size="lg" cosmetics={{ frame: frameCosmetic }} />;
  }
  if (item.type === 'avatar_effect') {
    return <Avatar name={name} src={user?.avatarUrl} size="lg" cosmetics={{ avatar_effect: effectCosmetic }} />;
  }
  if (item.type === 'nickname_color') {
    return <span className="text-lg font-bold"><StarDisplayName name={name} cosmetics={{ nickname: asCosmetic(item) }} /></span>;
  }
  if (item.type === 'badge') {
    return <StarDisplayName name={name} className="text-lg font-bold text-white drop-shadow" cosmetics={{ badge: asCosmetic(item) }} />;
  }
  if (item.type === 'profile_background') {
    const gradient = configStringArray(item.config, 'gradient');
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-xl px-4 text-center" style={{ backgroundImage: gradient.length ? `linear-gradient(135deg, ${gradient.join(', ')})` : undefined }}>
        <Avatar name={name} src={user?.avatarUrl} />
        <span className="text-xs font-semibold text-white drop-shadow">{name}</span>
      </div>
    );
  }
  if (item.type === 'theme') {
    const palette = configStringArray(item.config, 'palette');
    return (
      <div className="flex w-full flex-col items-center gap-2">
        <div className="flex overflow-hidden rounded-full shadow-sm ring-1 ring-black/10 dark:ring-white/10">
          {(palette.length ? palette.slice(2, 10) : ['#6366f1']).map((color) => <span key={color} className="h-5 w-5" style={{ backgroundColor: color }} />)}
        </div>
        <span className="rounded-full px-3 py-1 text-[11px] font-semibold text-white" style={{ backgroundColor: palette[5] ?? '#6366f1' }}>{configString(item.config, 'label') ?? item.name}</span>
      </div>
    );
  }
  if (item.type === 'chat_background') {
    const light = configString(item.config, 'light');
    return <div className="flex h-full w-full items-center justify-center rounded-xl text-2xl" style={{ backgroundImage: light }} aria-hidden>💬</div>;
  }
  if (item.type === 'message_effect') {
    const colors = configStringArray(item.config, 'colors');
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-3xl">{item.icon}</span>
        {Array.from({ length: 5 }).map((_, index) => <span key={index} className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index % Math.max(1, colors.length)] ?? '#f59e0b' }} />)}
      </div>
    );
  }
  if (item.type === 'notification_sound') {
    const notes = configStringArray(item.config, 'notes').map(Number);
    return (
      <div className="flex items-end gap-1" aria-hidden>
        {[0.45, 0.8, 0.6, 1, 0.7, 0.5, 0.9].map((height, index) => <span key={index} className="w-1.5 rounded-full bg-accent-400" style={{ height: `${height * 32}px`, opacity: notes.length ? 1 : 0.6 }} />)}
      </div>
    );
  }
  if (item.type === 'emoji_pack' || item.type === 'sticker_pack') {
    const emojis = item.type === 'emoji_pack'
      ? configStringArray(item.config, 'emojis')
      : (Array.isArray(item.config.stickers) ? (item.config.stickers as Array<{ emoji?: string }>).map((sticker) => sticker.emoji ?? '') : []);
    return <div className="flex max-w-[180px] flex-wrap justify-center gap-1 text-2xl">{emojis.slice(0, 8).map((emoji, index) => <span key={`${emoji}-${index}`}>{emoji}</span>)}</div>;
  }
  if (item.type === 'collection') {
    const gradient = configStringArray(item.config, 'gradient');
    const emojis = configStringArray(item.config, 'emojis');
    return (
      <div className="flex h-full w-full items-center justify-center gap-1 rounded-xl" style={{ backgroundImage: gradient.length ? `linear-gradient(135deg, ${gradient.join(', ')})` : undefined }}>
        {emojis.slice(0, 5).map((emoji, index) => <span key={`${emoji}-${index}`} className="text-2xl drop-shadow">{emoji}</span>)}
      </div>
    );
  }
  return <span className="text-4xl">{item.icon}</span>;
}
