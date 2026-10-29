import { ArrowUpDown, Check, CheckCheck, ChevronRight, Gift, Lock, Package, Search, ShoppingBag, Sparkles, Star, Trophy, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { useStar } from '../../contexts/StarContext';
import type { StarCategory, StarInventoryResponse, StarItem, StarRarity, StarShopResponse, User } from '../../types/models';
import { errorMessage } from '../../utils/format';
import { CATEGORY_META, RARITY_META } from '../../utils/star';
import { EmptyState } from '../common/EmptyState';
import { Spinner } from '../common/Spinner';
import { StarItemPreview } from './StarItemPreview';

type Tab = 'shop' | 'inventory' | 'achievements';
type CategoryFilter = StarCategory | 'all';
type RarityFilter = StarRarity | 'all';

const CATEGORY_ORDER: StarCategory[] = ['profile', 'chats', 'emoji', 'collections'];
const RARITY_ORDER: StarRarity[] = ['common', 'rare', 'epic', 'legendary', 'seasonal'];
const SORT_OPTIONS = [
  { value: 'recommended', label: 'Рекомендовані' },
  { value: 'price-asc', label: 'Спочатку дешевші' },
  { value: 'price-desc', label: 'Спочатку дорожчі' },
  { value: 'rarity', label: 'За рідкістю' },
  { value: 'new', label: 'Новинки' },
];

const numberFormat = new Intl.NumberFormat('uk-UA');

export function StarShop({ open, onClose, initialTab = 'shop' }: { open: boolean; onClose: () => void; initialTab?: Tab }) {
  const { user } = useAuth();
  const { overview, loading: overviewLoading, error: overviewError, refresh, claimDaily, purchase, equip, unequip } = useStar();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [rarity, setRarity] = useState<RarityFilter>('all');
  const [sort, setSort] = useState('recommended');
  const [query, setQuery] = useState('');
  const [shop, setShop] = useState<StarShopResponse | null>(null);
  const [inventory, setInventory] = useState<StarInventoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventorySort, setInventorySort] = useState('equipped');
  const [inventoryCategory, setInventoryCategory] = useState<CategoryFilter>('all');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmItem, setConfirmItem] = useState<StarItem | null>(null);
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const noticeTimer = useRef<number | undefined>(undefined);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 3200);
  }, []);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setError('');
    setNotice('');
    setConfirmItem(null);
    void refresh();
  }, [open, initialTab, refresh]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => panelRef.current?.focus(), 40);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (confirmItem) { setConfirmItem(null); return; }
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = original;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, confirmItem]);

  useEffect(() => {
    if (!open || tab !== 'shop') return;
    let active = true;
    const load = () => {
      setLoading(true);
      void api.star.shop({ category, rarity, sort, q: query.trim() })
        .then((result) => { if (active) { setShop(result); setError(''); } })
        .catch((cause) => { if (active) setError(errorMessage(cause)); })
        .finally(() => { if (active) setLoading(false); });
    };
    const timer = window.setTimeout(load, query ? 220 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [open, tab, category, rarity, sort, query]);

  const loadInventory = useCallback(async () => {
    setInventoryLoading(true);
    try {
      const result = await api.star.inventory(inventorySort);
      setInventory(result);
      setError('');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setInventoryLoading(false);
    }
  }, [inventorySort]);

  useEffect(() => {
    if (!open || tab !== 'inventory') return;
    void loadInventory();
  }, [open, tab, loadInventory]);

  useEffect(() => () => { if (noticeTimer.current) window.clearTimeout(noticeTimer.current); }, []);

  const wallet = overview?.wallet ?? shop?.wallet ?? inventory?.wallet ?? null;
  const categories = shop?.counts ?? { profile: 0, chats: 0, emoji: 0, collections: 0 };

  const shopItems = useMemo(() => (shop?.items ?? []).map((item) => ({
    ...item,
    canAfford: wallet ? wallet.balance >= item.price : item.canAfford,
    levelLocked: wallet ? wallet.level < item.levelRequired : item.levelLocked,
  })), [shop?.items, wallet]);

  const inventoryItems = useMemo(() => (inventory?.items ?? []).filter((item) => inventoryCategory === 'all' || item.category === inventoryCategory), [inventory?.items, inventoryCategory]);
  const equippedCount = inventory?.items.filter((item) => item.equipped).length ?? 0;

  const markEquipped = (items: StarItem[] | undefined, itemId: string, equipped: boolean, slot: string | null) => items?.map((item) => {
    if (item.id === itemId) return { ...item, equipped };
    if (equipped && slot && item.slot === slot && item.equipped) return { ...item, equipped: false };
    return item;
  });

  async function buy() {
    if (!confirmItem) return;
    setBusy(true);
    setError('');
    try {
      const result = await purchase(confirmItem.id);
      setShop((current) => current ? { ...current, items: markEquipped(current.items, confirmItem.id, result.item.equipped, confirmItem.slot) ?? current.items } : current);
      setInventory((current) => current ? { ...current, items: markEquipped(current.items, confirmItem.id, result.item.equipped, confirmItem.slot) ?? current.items } : current);
      showNotice(`«${confirmItem.name}» додано в інвентар${result.item.equipped ? ' та екіпіровано' : ''}`);
      setConfirmItem(null);
      if (tab === 'inventory') void loadInventory();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function toggleEquip(item: StarItem) {
    setBusy(true);
    setError('');
    try {
      if (item.equipped) await unequip(item.id); else await equip(item.id);
      const nextEquipped = !item.equipped;
      setShop((current) => current ? { ...current, items: markEquipped(current.items, item.id, nextEquipped, item.slot) ?? current.items } : current);
      setInventory((current) => current ? { ...current, items: markEquipped(current.items, item.id, nextEquipped, item.slot) ?? current.items } : current);
      showNotice(nextEquipped ? `«${item.name}» екіпіровано` : `«${item.name}» знято`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function daily() {
    setBusy(true);
    setError('');
    try {
      const claimed = await claimDaily();
      showNotice(claimed ? 'Щоденну нагороду +5 зірок зараховано!' : 'Щоденну нагороду вже отримано сьогодні');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function openItem(item: StarItem) {
    if (!item.owned) { setConfirmItem(item); return; }
    if (item.slot) void toggleEquip(item);
  }

  if (!open) return null;

  const level = wallet?.levelProgress;
  const refreshFailed = overviewError && !overview;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex bg-slate-950/60 backdrop-blur-sm animate-fade-in sm:items-center sm:justify-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="star-shop-title" className="relative flex h-dvh w-full max-w-[1180px] flex-col overflow-hidden bg-white shadow-2xl outline-none animate-slide-up dark:bg-slate-900 sm:h-[min(92vh,900px)] sm:rounded-[28px] sm:border">
        <header className="relative shrink-0 overflow-hidden bg-slate-950 text-white">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(129,140,248,.4),transparent_36%),radial-gradient(circle_at_84%_82%,rgba(245,158,11,.22),transparent_34%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:26px_26px]" />
          <div className="relative flex flex-col gap-4 p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300"><Sparkles size={14} /> Miston Star</p>
                <h2 id="star-shop-title" className="mt-1 text-xl font-bold sm:text-2xl">Магазин зірок</h2>
                <p className="mt-1 max-w-md text-xs text-slate-300 sm:text-sm">Заробляйте зірки за активність, відкривайте рівні та колекціонуйте унікальну косметику.</p>
              </div>
              <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-slate-200 transition hover:bg-white/20 hover:text-white" aria-label="Закрити магазин"><X size={19} /></button>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1.1fr_1fr_auto]">
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.06] p-3 backdrop-blur">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 text-slate-950 shadow-glow"><Star size={26} fill="currentColor" /></span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Баланс</p>
                  <p className="flex items-baseline gap-1.5 text-2xl font-bold tabular-nums">{overviewLoading && !wallet ? '…' : numberFormat.format(wallet?.balance ?? 0)}<span className="text-xs font-medium text-amber-200">зірок</span></p>
                </div>
                {wallet && (wallet.daily.canClaim ? (
                  <button type="button" onClick={() => void daily()} disabled={busy} className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-2 text-xs font-bold text-slate-950 shadow-sm transition hover:bg-amber-300 active:scale-95 disabled:opacity-60"><Gift size={15} /> +{wallet.daily.reward}</button>
                ) : (
                  <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-300"><Check size={12} /> Отримано</span>
                ))}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[.06] p-3 backdrop-blur">
                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400"><span>Рівень {level?.level ?? wallet?.level ?? 1}</span><span className="text-slate-300">{level?.xpIntoLevel ?? 0} / {level ? Math.max(1, level.nextLevelXp - level.currentLevelXp) : 100} XP</span></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-500 transition-all duration-500" style={{ width: `${level?.percent ?? 0}%` }} /></div>
                <p className="mt-1.5 truncate text-[11px] text-slate-400">{level?.maxLevel ? 'Максимальний рівень' : `До наступного рівня: ${level?.xpForNext ?? 0} XP`}</p>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[.06] p-3 backdrop-blur sm:flex-col sm:items-start sm:justify-center">
                <div className="flex items-center gap-2 text-xs font-semibold"><Trophy size={15} className="text-amber-300" /> {overview?.stats.unlockedAchievements ?? 0} / {overview?.stats.totalAchievements ?? 4}</div>
                <p className="text-[11px] text-slate-400">Досягнень відкрито</p>
              </div>
            </div>

            <nav className="flex gap-1.5 overflow-x-auto" aria-label="Розділи магазину">
              {([{ id: 'shop', label: 'Магазин', icon: ShoppingBag }, { id: 'inventory', label: 'Інвентар', icon: Package }, { id: 'achievements', label: 'Досягнення', icon: Trophy }] as const).map((item) => (
                <button key={item.id} type="button" onClick={() => setTab(item.id)} aria-pressed={tab === item.id} className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${tab === item.id ? 'bg-white text-slate-950 shadow-sm' : 'bg-white/10 text-slate-200 hover:bg-white/15'}`}>
                  <item.icon size={15} /> {item.label}
                  {item.id === 'inventory' && inventory && <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${tab === item.id ? 'bg-slate-950/10' : 'bg-white/15'}`}>{inventory.items.length}</span>}
                </button>
              ))}
            </nav>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r p-3 md:flex" aria-label="Категорії">
            {tab === 'shop' && (
              <>
                <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Категорії</p>
                <SideButton active={category === 'all'} onClick={() => setCategory('all')} icon={<Sparkles size={16} />} label="Усі товари" count={Object.values(categories).reduce((sum, value) => sum + value, 0)} />
                {CATEGORY_ORDER.map((item) => <SideButton key={item} active={category === item} onClick={() => setCategory(item)} icon={<ChevronRight size={15} className={category === item ? 'text-accent-500' : 'text-slate-400'} />} label={CATEGORY_META[item].label} count={categories[item]} />)}
                <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                  <p className="font-semibold text-slate-700 dark:text-slate-200">{wallet?.daily.claimedToday ? 'Нагороду отримано' : 'Щоденна нагорода'}</p>
                  <p>Заходьте щодня та забирайте {wallet?.daily.reward ?? 5} зірок. Ще +50 за запрошеного друга.</p>
                </div>
              </>
            )}
            {tab === 'inventory' && (
              <>
                <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Категорії</p>
                <SideButton active={inventoryCategory === 'all'} onClick={() => setInventoryCategory('all')} icon={<Package size={16} />} label="Усі предмети" count={inventory?.items.length ?? 0} />
                {CATEGORY_ORDER.map((item) => <SideButton key={item} active={inventoryCategory === item} onClick={() => setInventoryCategory(item)} icon={<ChevronRight size={15} className={inventoryCategory === item ? 'text-accent-500' : 'text-slate-400'} />} label={CATEGORY_META[item].label} count={(inventory?.items ?? []).filter((entry) => entry.category === item).length} />)}
                <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                  <p className="font-semibold text-slate-700 dark:text-slate-200">Екіпіровано: {equippedCount}</p>
                  <p>Рамки, ніки, значки та теми змінюють ваш вигляд у чатах.</p>
                </div>
              </>
            )}
            {tab === 'achievements' && (
              <div className="rounded-2xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                <p className="font-semibold text-slate-700 dark:text-slate-200">Шлях до легенди</p>
                <p>10 повідомлень — Новачок, 100 — Активний користувач, 30 днів — Ветеран, 10 рівень — Легенда.</p>
              </div>
            )}
          </aside>

          <main className="subtle-scrollbar min-w-0 flex-1 overflow-y-auto">
            <div className="sticky top-0 z-10 border-b bg-white/90 px-3 py-3 backdrop-blur-xl dark:bg-slate-900/90 sm:px-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                {tab === 'shop' ? (
                  <>
                    <label className="relative flex-1"><Search size={16} className="absolute left-3.5 top-3 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="text-input border-transparent bg-slate-100 py-2.5 pl-10 pr-9 dark:bg-slate-800" placeholder="Пошук товарів" aria-label="Пошук товарів" />{query && <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" aria-label="Очистити пошук"><X size={15} /></button>}</label>
                    <div className="flex gap-2">
                      <label className="flex-1 sm:flex-none"><span className="sr-only">Рідкість</span><select value={rarity} onChange={(event) => setRarity(event.target.value as RarityFilter)} className="text-input min-h-10 py-2 text-xs dark:bg-slate-800"><option value="all">Уся рідкість</option>{RARITY_ORDER.map((value) => <option key={value} value={value}>{RARITY_META[value].label}</option>)}</select></label>
                      <label className="flex-1 sm:flex-none"><span className="sr-only">Сортування</span><select value={sort} onChange={(event) => setSort(event.target.value)} className="text-input min-h-10 py-2 text-xs dark:bg-slate-800">{SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                    </div>
                  </>
                ) : tab === 'inventory' ? (
                  <>
                    <div className="flex flex-1 items-center gap-2 text-sm font-semibold"><Package size={17} className="text-accent-500" /> Ваш інвентар <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-300">{inventoryItems.length}</span></div>
                    <label className="flex items-center gap-2 text-xs text-slate-500"><ArrowUpDown size={14} /><span className="sr-only">Сортування інвентаря</span><select value={inventorySort} onChange={(event) => setInventorySort(event.target.value)} className="text-input min-h-10 py-2 text-xs dark:bg-slate-800"><option value="equipped">Спочатку екіпіровані</option><option value="recent">Спочатку нові</option><option value="price">За ціною</option><option value="rarity">За рідкістю</option><option value="name">За назвою</option></select></label>
                  </>
                ) : (
                  <div className="flex flex-1 items-center gap-2 text-sm font-semibold"><Trophy size={17} className="text-amber-500" /> Досягнення та рівні</div>
                )}
              </div>
              {tab === 'shop' && (
                <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 md:hidden">
                  <CategoryChip active={category === 'all'} onClick={() => setCategory('all')} label="Усі" />
                  {CATEGORY_ORDER.map((item) => <CategoryChip key={item} active={category === item} onClick={() => setCategory(item)} label={`${CATEGORY_META[item].label} · ${categories[item]}`} />)}
                </div>
              )}
              {tab === 'inventory' && (
                <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 md:hidden">
                  <CategoryChip active={inventoryCategory === 'all'} onClick={() => setInventoryCategory('all')} label="Усі" />
                  {CATEGORY_ORDER.map((item) => <CategoryChip key={item} active={inventoryCategory === item} onClick={() => setInventoryCategory(item)} label={CATEGORY_META[item].label} />)}
                </div>
              )}
            </div>

            <div className="p-3 sm:p-6">
              {error && <div role="alert" className="mb-3 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"><X size={16} className="mt-0.5 shrink-0" /><span className="flex-1">{error}</span><button type="button" onClick={() => setError('')} aria-label="Закрити помилку"><X size={14} /></button></div>}
              {refreshFailed && <p className="mb-3 text-sm text-slate-500">Не вдалося завантажити гаманець. Спробуйте оновити магазин.</p>}

              {tab === 'shop' && (
                loading && !shop ? <Spinner label="Завантаження товарів…" className="py-20" /> : shopItems.length === 0 ? (
                  <EmptyState icon={ShoppingBag} title="Нічого не знайдено" description="Змініть категорію, рідкість або пошуковий запит." action={<button type="button" className="secondary-btn" onClick={() => { setQuery(''); setCategory('all'); setRarity('all'); }}>Скинути фільтри</button>} />
                ) : (
                  <>
                    <div className="mb-3 flex items-center justify-between text-xs text-slate-400"><span>{shopItems.length} товарів</span>{loading && <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-accent-500" /> Оновлення…</span>}</div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {shopItems.map((item) => <ShopCard key={item.id} item={item} user={user} busy={busy} onAction={() => openItem(item)} />)}
                    </div>
                  </>
                )
              )}

              {tab === 'inventory' && (
                inventoryLoading ? <Spinner label="Завантаження інвентаря…" className="py-20" /> : inventoryItems.length === 0 ? (
                  <EmptyState icon={Package} title="Інвентар порожній" description="Купуйте рамки, теми, емодзі та колекції — усе з'явиться тут." action={<button type="button" className="primary-btn" onClick={() => setTab('shop')}>До магазину</button>} />
                ) : (
                  <>
                    <div className="mb-3 text-xs text-slate-400">{inventoryItems.length} предметів · екіпіровано {equippedCount}</div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {inventoryItems.map((item) => <ShopCard key={item.id} item={item} user={user} busy={busy} onAction={() => openItem(item)} inventory />)}
                    </div>
                  </>
                )
              )}

              {tab === 'achievements' && (
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-900 to-indigo-950 p-5 text-white">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300">Ваш прогрес</p>
                        <p className="mt-1 text-2xl font-bold">Рівень {level?.level ?? 1}</p>
                        <p className="mt-1 text-xs text-slate-300">{wallet?.xp ?? 0} XP · {wallet?.messageCount ?? 0} повідомлень · {wallet?.activeDays ?? 0} днів активності</p>
                      </div>
                      <div className="flex gap-4 text-center text-xs">
                        <div><p className="text-xl font-bold tabular-nums text-amber-200">{overview?.stats.owned ?? 0}</p><p className="text-slate-400">предметів</p></div>
                        <div><p className="text-xl font-bold tabular-nums text-amber-200">{overview?.stats.unlockedAchievements ?? 0}</p><p className="text-slate-400">досягнень</p></div>
                        <div><p className="text-xl font-bold tabular-nums text-amber-200">{wallet?.balance ?? 0}</p><p className="text-slate-400">зірок</p></div>
                      </div>
                    </div>
                    <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-500 transition-all duration-500" style={{ width: `${level?.percent ?? 0}%` }} /></div>
                    <div className="mt-1.5 flex justify-between text-[11px] text-slate-400"><span>{level?.xpIntoLevel ?? 0} XP на рівні</span><span>{level?.maxLevel ? 'Максимум' : `Ще ${level?.xpForNext ?? 0} XP`}</span></div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {(overview?.achievements ?? []).map((achievement) => <AchievementCard key={achievement.id} achievement={achievement} />)}
                  </div>

                  <div className="rounded-2xl border p-4">
                    <h3 className="text-sm font-semibold">Як заробляти зірки</h3>
                    <ul className="mt-3 grid gap-2 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-2">
                      <li className="flex items-center gap-2 rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60"><Gift size={15} className="text-amber-500" /> Щоденний вхід — +5 зірок</li>
                      <li className="flex items-center gap-2 rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60"><Sparkles size={15} className="text-amber-500" /> Запрошений друг — +50 зірок</li>
                      <li className="flex items-center gap-2 rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60"><Star size={15} className="text-amber-500" /> Кожні 100 повідомлень — +10 зірок</li>
                      <li className="flex items-center gap-2 rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60"><Trophy size={15} className="text-amber-500" /> 30 днів активності — +200 зірок</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>

        {notice && <div role="status" className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-slate-950/90 px-4 py-2 text-xs font-semibold text-white shadow-lg animate-slide-up">{notice}</div>}

        {confirmItem && (
          <div className="absolute inset-0 z-30 flex items-end justify-center bg-slate-950/55 p-3 backdrop-blur-sm animate-fade-in sm:items-center" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setConfirmItem(null); }}>
            <div role="dialog" aria-modal="true" aria-labelledby="star-buy-title" className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl animate-slide-up dark:bg-slate-900">
              <div className={`relative flex h-36 items-center justify-center bg-gradient-to-br ${RARITY_META[confirmItem.rarity].card}`}>
                <StarItemPreview item={confirmItem} user={user} />
                <span className={`absolute left-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-bold ${RARITY_META[confirmItem.rarity].badge}`}>{RARITY_META[confirmItem.rarity].label}</span>
              </div>
              <div className="p-5">
                <h3 id="star-buy-title" className="text-lg font-bold">Купити «{confirmItem.name}»?</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{confirmItem.description}</p>
                <div className="mt-4 space-y-2 rounded-2xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
                  <div className="flex items-center justify-between"><span className="text-slate-500 dark:text-slate-400">Ціна</span><span className="inline-flex items-center gap-1 font-bold tabular-nums text-amber-600 dark:text-amber-400"><Star size={15} fill="currentColor" /> {numberFormat.format(confirmItem.price)}</span></div>
                  <div className="flex items-center justify-between"><span className="text-slate-500 dark:text-slate-400">Після покупки</span><span className="font-semibold tabular-nums">{numberFormat.format(Math.max(0, (wallet?.balance ?? 0) - confirmItem.price))} зірок</span></div>
                  {confirmItem.slot && <p className="text-[11px] text-slate-400">Предмет можна екіпірувати одразу після покупки.</p>}
                </div>
                <div className="mt-4 flex gap-2">
                  <button type="button" className="secondary-btn flex-1" onClick={() => setConfirmItem(null)} disabled={busy}>Скасувати</button>
                  <button type="button" className="primary-btn flex-1" onClick={() => void buy()} disabled={busy || !wallet || wallet.balance < confirmItem.price}>{busy ? 'Купуємо…' : 'Підтвердити'}</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function SideButton({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; count: number }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition ${active ? 'bg-accent-50 font-semibold text-accent-700 dark:bg-accent-500/10 dark:text-accent-300' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">{count}</span>
    </button>
  );
}

function CategoryChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${active ? 'bg-accent-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{label}</button>;
}

function ShopCard({ item, user, busy, onAction, inventory = false }: { item: StarItem; user: User | null; busy: boolean; onAction: () => void; inventory?: boolean }) {
  const meta = RARITY_META[item.rarity];
  let action: ReactNode;
  if (item.owned) {
    if (item.slot) action = <button type="button" onClick={onAction} disabled={busy} className={`inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold transition disabled:opacity-60 ${item.equipped ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'}`}>{item.equipped ? <><CheckCheck size={13} /> Зняти</> : <><Check size={13} /> Екіпірувати</>}</button>;
    else action = <span className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-slate-100 px-2.5 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400"><Check size={13} /> У колекції</span>;
  } else if (item.levelLocked) action = <span className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-slate-100 px-2.5 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400"><Lock size={13} /> Рівень {item.levelRequired}</span>;
  else if (!item.canAfford) action = <span className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-slate-100 px-2.5 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400"><Star size={13} /> Мало зірок</span>;
  else action = <button type="button" onClick={onAction} disabled={busy} className="primary-btn min-h-8 gap-1 px-2.5 py-1 text-[11px]"><ShoppingBag size={13} /> Купити</button>;

  return (
    <article className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-gradient-to-br transition duration-200 hover:-translate-y-0.5 hover:shadow-lg ${meta.card} ${meta.glow}`}>
      <div className="relative flex h-28 items-center justify-center overflow-hidden bg-white/40 px-4 dark:bg-slate-950/20">
        <StarItemPreview item={item} user={user} />
        <span className={`absolute left-2.5 top-2.5 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${meta.badge}`}>{meta.label}</span>
        {item.owned && <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-0.5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm"><Check size={10} /> Ваше</span>}
        {!item.owned && item.levelRequired > 1 && <span className="absolute right-2.5 top-2.5 rounded-full bg-slate-900/80 px-1.5 py-0.5 text-[9px] font-bold text-white">LVL {item.levelRequired}</span>}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <h3 className="truncate text-sm font-bold">{item.name}</h3>
        <p className="mt-0.5 line-clamp-2 min-h-8 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{item.description}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          {item.owned ? <span className="text-[11px] font-medium text-slate-400">{inventory ? 'У власності' : 'Куплено'}</span> : <span className={`inline-flex items-center gap-1 text-sm font-bold tabular-nums ${item.canAfford ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}><Star size={14} fill="currentColor" /> {numberFormat.format(item.price)}</span>}
          {action}
        </div>
      </div>
    </article>
  );
}

function AchievementCard({ achievement }: { achievement: { id: string; name: string; description: string; icon: string; progress: number; current: number; threshold: number; reward: number; unlocked: boolean; rarity: StarRarity } }) {
  const meta = RARITY_META[achievement.rarity];
  return (
    <div className={`relative overflow-hidden rounded-2xl border p-4 ${achievement.unlocked ? 'bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/30 dark:to-slate-900' : 'bg-white dark:bg-slate-900'}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl ${achievement.unlocked ? 'bg-amber-100 dark:bg-amber-950/50' : 'bg-slate-100 grayscale dark:bg-slate-800'}`}>{achievement.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><h3 className="truncate text-sm font-bold">{achievement.name}</h3><span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${meta.badge}`}>{meta.label}</span></div>
          <p className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{achievement.description}</p>
        </div>
        {achievement.unlocked ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"><Check size={11} /> Отримано</span> : <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300"><Star size={10} /> {achievement.reward}</span>}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className={`h-full rounded-full ${achievement.unlocked ? 'bg-emerald-500' : 'bg-accent-500'}`} style={{ width: `${achievement.progress}%` }} /></div>
        <span className="shrink-0 text-[10px] font-medium tabular-nums text-slate-400">{Math.min(achievement.current, achievement.threshold)} / {achievement.threshold}</span>
      </div>
    </div>
  );
}
