import { Check, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { ApiError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useStar } from '../../contexts/StarContext';
import type { StarItem } from '../../types/models';
import { errorMessage } from '../../utils/format';
import { StarItemPreview } from '../star/StarItemPreview';

/** Безкоштовне оформлення профілю: ті самі косметики, але без магазину й зірок. */
export function ProfileCustomization() {
  const { user } = useAuth();
  const { purchase, equip, unequip } = useStar();
  const [items, setItems] = useState<StarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.star.shop({ category: 'profile' });
      setItems(result.items);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function toggle(item: StarItem) {
    setBusyId(item.id);
    setError('');
    setNotice('');
    try {
      if (!item.owned) {
        try {
          await purchase(item.id);
        } catch (cause) {
          // Предмет уже додано в інвентар з іншого місця — просто екіпіруємо.
          if (!(cause instanceof ApiError) || cause.status !== 409) throw cause;
        }
      }
      if (item.equipped) await unequip(item.id);
      else await equip(item.id);
      setNotice(item.equipped ? `«${item.name}» знято` : `«${item.name}» застосовано`);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl bg-ios-blue/10 p-4">
        <Sparkles size={19} className="mt-0.5 shrink-0 text-ios-blue" />
        <div>
          <p className="text-sm font-semibold text-ios-label">Все безкоштовно</p>
          <p className="mt-1 text-xs leading-5 text-ios-secondary">
            Рамки, колір імені, значки та фон профілю доступні кожному. Обраний вигляд можна змінити або зняти в будь-який момент.
          </p>
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}
      {notice && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{notice}</p>}
      {loading && <p className="text-sm text-ios-secondary">Завантажуємо оформлення…</p>}

      {!loading && items.length === 0 && (
        <p className="rounded-2xl border border-ios-separator/10 p-4 text-sm text-ios-secondary">Оформлення поки недоступне.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={busyId !== null}
            onClick={() => void toggle(item)}
            aria-pressed={item.equipped}
            className={`overflow-hidden rounded-2xl border text-left transition disabled:opacity-60 ${item.equipped ? 'border-ios-blue ring-1 ring-ios-blue' : 'border-ios-separator/10 hover:border-ios-blue/40'}`}
          >
            <div className="flex h-24 items-center justify-center overflow-hidden bg-ios-fill/5 px-3">
              <StarItemPreview item={item} user={user} />
            </div>
            <div className="flex items-start gap-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ios-label">{item.name}</p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-ios-secondary">{item.description}</p>
              </div>
              <span className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${item.equipped ? 'bg-ios-blue text-white' : 'bg-ios-fill/10 text-ios-secondary'}`}>
                {item.equipped && <Check size={12} />}
                {busyId === item.id ? '…' : item.equipped ? 'Увімкнено' : 'Обрати'}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
