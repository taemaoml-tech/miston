import { useMemo, useState } from 'react';
import { EMOJI_GROUPS, RECENT_EMOJI_LIMIT, searchEmojis } from '../../utils/emojis';

const STORAGE_KEY = 'relay.recentEmojis';

function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

interface EmojiGridProps {
  onInsert: (emoji: string) => void;
}

export function EmojiGrid({ onInsert }: EmojiGridProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(EMOJI_GROUPS[0]?.key ?? 'smileys');
  const [recents, setRecents] = useState<string[]>(() => readRecents());

  const search = useMemo(() => searchEmojis(query), [query]);
  const group = EMOJI_GROUPS.find((item) => item.key === active) ?? EMOJI_GROUPS[0];

  function use(emoji: string) {
    onInsert(emoji);
    setRecents((current) => {
      const next = [emoji, ...current.filter((item) => item !== emoji)].slice(0, RECENT_EMOJI_LIMIT);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Приватний режим не дозволяє зберігати недавні — панель усе одно працює.
      }
      return next;
    });
  }

  const tiles = (chars: { char: string; name: string }[]) => chars.map((item) => (
    <button
      key={item.char}
      type="button"
      onClick={() => use(item.char)}
      title={item.name}
      aria-label={item.name}
      className="flex h-11 w-11 items-center justify-center rounded-xl text-2xl transition hover:bg-slate-100 active:scale-90 dark:hover:bg-slate-700"
    >
      <span aria-hidden>{item.char}</span>
    </button>
  ));

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-3 pb-2 pt-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Пошук емодзі…"
          aria-label="Пошук емодзі"
          className="w-full rounded-xl border-transparent bg-slate-100 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:bg-white dark:bg-slate-800 dark:focus:bg-slate-800"
        />
      </div>
      <div className="subtle-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {query ? (
          search.length
            ? <div className="flex flex-wrap gap-1">{tiles(search)}</div>
            : <p className="px-1 py-6 text-center text-xs text-slate-400">Нічого не знайдено. Спробуйте інше слово.</p>
        ) : (
          <>
            {recents.length > 0 && (
              <section className="pb-2">
                <h3 className="sticky top-0 z-10 bg-white/95 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 backdrop-blur dark:bg-slate-900/95">
                  Нещодавні
                </h3>
                <div className="flex flex-wrap gap-1">
                  {recents.map((char) => (
                    <button
                      key={char}
                      type="button"
                      onClick={() => use(char)}
                      aria-label="Вставити емодзі"
                      className="flex h-11 w-11 items-center justify-center rounded-xl text-2xl transition hover:bg-slate-100 active:scale-90 dark:hover:bg-slate-700"
                    >
                      <span aria-hidden>{char}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            <section>
              <h3 className="sticky top-0 z-10 bg-white/95 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 backdrop-blur dark:bg-slate-900/95">
                {group.name}
              </h3>
              <div className="flex flex-wrap gap-1">{tiles(group.emojis)}</div>
            </section>
          </>
        )}
      </div>
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-t px-2 py-1.5" aria-label="Категорії емодзі">
        {EMOJI_GROUPS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => { setQuery(''); setActive(item.key); }}
            aria-label={item.name}
            title={item.name}
            aria-current={item.key === active}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg transition ${item.key === active && !query ? 'bg-accent-50 dark:bg-accent-500/15' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}
          >
            <span aria-hidden>{item.emojis[0]?.char}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
