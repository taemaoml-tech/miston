import { Smile, Sticker } from 'lucide-react';
import { useState } from 'react';
import type { Sticker as StickerModel } from '../../types/models';
import { EmojiGrid } from './EmojiGrid';
import { StickerGrid } from './StickerGrid';

interface PickerPanelProps {
  onEmoji: (emoji: string) => void;
  onSticker: (sticker: StickerModel) => void;
}

export function PickerPanel({ onEmoji, onSticker }: PickerPanelProps) {
  const [tab, setTab] = useState<'emoji' | 'stickers'>('stickers');

  return (
    <div className="overflow-hidden rounded-2xl border bg-white shadow-soft dark:bg-slate-900">
      <div className="flex items-center gap-1 border-b px-2 pt-1.5" role="tablist" aria-label="Панель вставки">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'stickers'}
          onClick={() => setTab('stickers')}
          className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs font-semibold transition ${tab === 'stickers' ? 'border-b-2 border-accent-500 text-accent-600 dark:text-accent-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
        >
          <Sticker size={15} /> Стікери
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'emoji'}
          onClick={() => setTab('emoji')}
          className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs font-semibold transition ${tab === 'emoji' ? 'border-b-2 border-accent-500 text-accent-600 dark:text-accent-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
        >
          <Smile size={15} /> Емодзі
        </button>
      </div>
      <div className="h-72 sm:h-80">
        {tab === 'stickers'
          ? <StickerGrid onPick={onSticker} />
          : <EmojiGrid onInsert={onEmoji} />}
      </div>
    </div>
  );
}
