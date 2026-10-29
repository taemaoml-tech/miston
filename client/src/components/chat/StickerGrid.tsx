import { Clock, Heart, Plus, Search, Star, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import { assetUrl } from '../../api/client';
import type { Sticker, StickerCategory, StickerLibrary, StickerPack } from '../../types/models';
import { errorMessage } from '../../utils/format';
import { Spinner } from '../common/Spinner';

interface StickerGridProps {
  onPick: (sticker: Sticker) => void;
}

type View = 'favorites' | 'recents' | StickerCategory;

const BUILTIN_TABS: { key: View; label: string }[] = [
  { key: 'emotions', label: 'Емоції' },
  { key: 'memes', label: 'Меми' },
  { key: 'animals', label: 'Тварини' },
  { key: 'games', label: 'Ігри' },
  { key: 'holidays', label: 'Свята' },
  { key: 'anime', label: 'Аніме' },
  { key: 'reactions', label: 'Реакції' },
];

export function StickerGrid({ onPick }: StickerGridProps) {
  const [library, setLibrary] = useState<StickerLibrary | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('favorites');
  const [packId, setPackId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void api.stickers.library()
      .then((result) => { if (active) { setLibrary(result); setView(result.favorites.length ? 'favorites' : 'emotions'); } })
      .catch((cause) => { if (active) setError(errorMessage(cause)); });
    return () => { active = false; };
  }, []);

  const byId = useMemo(() => {
    const map = new Map<string, Sticker>();
    for (const pack of library?.packs ?? []) for (const sticker of pack.stickers) map.set(sticker.id, sticker);
    return map;
  }, [library]);

  const visiblePacks: StickerPack[] = useMemo(() => {
    const packs = library?.packs ?? [];
    if (view === 'favorites') return [];
    if (view === 'recents') return [];
    return packs.filter((pack) => (view === 'custom' ? pack.isOwned : pack.category === view));
  }, [library, view]);

  const activePack: StickerPack | null = useMemo(
    () => visiblePacks.find((pack) => pack.id === packId) ?? visiblePacks[0] ?? null,
    [visiblePacks, packId],
  );

  const tiles: Sticker[] = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('uk-UA');
    if (needle) {
      const pool = view === 'custom' ? (library?.packs ?? []).filter((pack) => pack.isOwned) : library?.packs ?? [];
      return pool.flatMap((pack) => pack.stickers.filter((sticker) =>
        `${sticker.label} ${sticker.keywords} ${pack.name}`.toLocaleLowerCase('uk-UA').includes(needle)));
    }
    if (view === 'favorites') return (library?.favorites ?? []).map((id) => byId.get(id)).filter((s): s is Sticker => Boolean(s));
    if (view === 'recents') return (library?.recents ?? []).map((id) => byId.get(id)).filter((s): s is Sticker => Boolean(s));
    return activePack?.stickers ?? [];
  }, [activePack, byId, library, query, view]);

  async function reload() {
    try {
      setLibrary(await api.stickers.library());
    } catch (cause) { setError(errorMessage(cause)); }
  }

  async function toggleFavorite(sticker: Sticker) {
    const isFavorite = (library?.favorites ?? []).includes(sticker.id);
    setLibrary((current) => current ? {
      ...current,
      favorites: isFavorite ? current.favorites.filter((id) => id !== sticker.id) : [sticker.id, ...current.favorites],
    } : current);
    try {
      await api.stickers.setFavorite(sticker.id, !isFavorite);
    } catch (cause) {
      setError(errorMessage(cause));
      await reload();
    }
  }

  async function createPack() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true); setError('');
    try {
      const { pack } = await api.stickers.createPack(name, '');
      setNewName('');
      await reload();
      setView('custom');
      setPackId(pack.id);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  async function uploadSticker(file: File) {
    if (!activePack || busy) return;
    setBusy(true); setError('');
    try {
      await api.stickers.addSticker(activePack.id, file, file.name.replace(/\.[^.]+$/, '').slice(0, 80));
      await reload();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function removeSticker(sticker: Sticker) {
    setBusy(true); setError('');
    try {
      await api.stickers.deleteSticker(sticker.id);
      await reload();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  async function togglePublic(pack: StickerPack) {
    setBusy(true); setError('');
    try {
      await api.stickers.updatePack(pack.id, { isPublic: !pack.isPublic });
      await reload();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  async function removePack(pack: StickerPack) {
    setBusy(true); setError('');
    try {
      await api.stickers.deletePack(pack.id);
      setPackId(null);
      await reload();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  if (error && !library) {
    return <p className="flex h-full items-center justify-center px-4 text-center text-xs text-rose-600 dark:text-rose-400">{error}</p>;
  }
  if (!library) return <Spinner label="Завантаження стікерів…" className="h-full" />;

  const tabs: { key: View; label: string; icon?: typeof Star }[] = [
    { key: 'favorites', label: 'Улюблені', icon: Star },
    { key: 'recents', label: 'Недавні', icon: Clock },
    ...BUILTIN_TABS,
    { key: 'custom', label: 'Мої', icon: Plus },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-3 pb-2 pt-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Пошук стікерів…"
            aria-label="Пошук стікерів"
            className="w-full rounded-xl border-transparent bg-slate-100 py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:bg-white dark:bg-slate-800 dark:focus:bg-slate-800"
          />
        </div>
      </div>

      <div className="subtle-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {error && (
          <div role="status" className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            <span>{error}</span>
            <button type="button" onClick={() => setError('')} aria-label="Закрити помилку"><X size={14} /></button>
          </div>
        )}

        {view === 'custom' && !query && (
          <div className="mb-3 flex gap-2">
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              maxLength={80}
              placeholder="Нова назва набору"
              aria-label="Назва нового набору"
              className="min-w-0 flex-1 rounded-xl border-transparent bg-slate-100 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:bg-white dark:bg-slate-800 dark:focus:bg-slate-800"
            />
            <button type="button" onClick={() => void createPack()} disabled={busy || !newName.trim()} className="secondary-btn shrink-0 px-3 py-2 text-xs">
              <Plus size={15} /> Створити
            </button>
          </div>
        )}

        {visiblePacks.length > 1 && !query && view !== 'favorites' && view !== 'recents' && (
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Набори стікерів">
            {visiblePacks.map((pack) => (
              <button
                key={pack.id}
                type="button"
                role="tab"
                aria-selected={activePack?.id === pack.id}
                onClick={() => setPackId(pack.id)}
                title={pack.description || pack.name}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${activePack?.id === pack.id ? 'bg-accent-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
              >
                {pack.name}
              </button>
            ))}
          </div>
        )}

        {view === 'custom' && !query && activePack && (
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="secondary-btn px-3 py-1.5">
              <Upload size={15} /> Додати PNG/GIF/WebP
            </button>
            <button type="button" onClick={() => void togglePublic(activePack)} disabled={busy} className="secondary-btn px-3 py-1.5">
              {activePack.isPublic ? 'Зробити приватним' : 'Опублікувати'}
            </button>
            <button type="button" onClick={() => void removePack(activePack)} disabled={busy} className="secondary-btn px-3 py-1.5 text-rose-600 dark:text-rose-400">
              <Trash2 size={15} /> Видалити набір
            </button>
            <span className="text-slate-400">{activePack.stickers.length} стікерів</span>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/webp,image/gif"
          className="hidden"
          aria-label="Файл нового стікера"
          onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadSticker(file); else event.target.value = ''; }}
        />

        {!tiles.length ? (
          <p className="px-1 py-8 text-center text-xs text-slate-400">
            {query
              ? 'Стікерів за запитом немає.'
              : view === 'favorites'
                ? 'Натисніть на зірочку у стікері, щоб додати його в улюблені.'
                : view === 'recents'
                  ? 'Нещодавно надіслані стікери зʼявляться тут.'
                  : view === 'custom'
                    ? 'Створіть набір і додайте у нього власні стікери.'
                    : 'У цьому наборі поки немає стікерів.'}
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
            {tiles.map((sticker) => (
              <div key={sticker.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onPick(sticker)}
                  title={sticker.label}
                  aria-label={`Надіслати стікер «${sticker.label}»`}
                  className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl transition hover:bg-slate-100 active:scale-95 dark:hover:bg-slate-700/60"
                >
                  <img src={assetUrl(sticker.asset)} alt={sticker.label} loading="lazy" className="h-full w-full object-contain p-1" />
                </button>
                <div className="absolute right-0.5 top-0.5 flex gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={() => void toggleFavorite(sticker)}
                    aria-label={library.favorites.includes(sticker.id) ? 'Прибрати з улюблених' : 'Додати в улюблені'}
                    className={`rounded-lg bg-white/90 p-1 text-slate-500 shadow-sm hover:text-accent-600 dark:bg-slate-800/90 ${library.favorites.includes(sticker.id) ? 'text-accent-600 dark:text-accent-400' : ''}`}
                  >
                    <Heart size={13} fill={library.favorites.includes(sticker.id) ? 'currentColor' : 'none'} />
                  </button>
                  {view === 'custom' && activePack?.isOwned && (
                    <button
                      type="button"
                      onClick={() => void removeSticker(sticker)}
                      aria-label="Видалити стікер"
                      className="rounded-lg bg-white/90 p-1 text-slate-500 shadow-sm hover:text-rose-600 dark:bg-slate-800/90"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <nav className="subtle-scrollbar flex shrink-0 gap-1 overflow-x-auto border-t px-2 py-1.5" aria-label="Категорії стікерів">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => { setQuery(''); setView(tab.key); setPackId(null); }}
              aria-current={tab.key === view}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition ${tab.key === view && !query ? 'bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
            >
              {Icon ? <Icon size={14} aria-hidden /> : null}
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
