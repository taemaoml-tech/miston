import { CheckCircle2, KeyRound, LockKeyhole, ShieldCheck, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import type { E2eeStatus } from '../../types/models';
import { createBackup, disableE2ee, enableE2ee, isE2eeReady, removeBackup, restoreBackup } from '../../utils/e2ee';
import { errorMessage } from '../../utils/format';

/** Налаштування наскрізного шифрування: ключі, резервна копія, відновлення. */
export function E2eeSettings() {
  const { user } = useAuth();
  const [status, setStatus] = useState<E2eeStatus | null>(null);
  const [localReady, setLocalReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    try {
      const next = await api.e2ee.status();
      setStatus(next);
      setLocalReady(isE2eeReady(user.id));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, [user?.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (!user) return null;
  const needsRestore = Boolean(status?.enabled && !localReady);

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      await action();
      setPassphrase(''); setConfirmPassphrase('');
      setNotice(success);
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent, mode: 'backup' | 'restore') {
    event.preventDefault();
    if (passphrase.length < 8) {
      setError('Пароль резервної копії має бути не коротшим за 8 символів');
      return;
    }
    if (mode === 'backup' && passphrase !== confirmPassphrase) {
      setError('Паролі не співпадають');
      return;
    }
    void run(() => mode === 'backup' ? createBackup(user!.id, passphrase) : restoreBackup(user!.id, passphrase),
      mode === 'backup' ? 'Резервну копію збережено' : 'Ключ відновлено на цьому пристрої');
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border p-4 dark:border-slate-800">
        <p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={17} className="text-emerald-500" /> Наскрізне шифрування</p>
        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          Текст повідомлень шифрується на вашому пристрої й розшифровується лише на пристроях учасників розмови.
          Сервер зберігає тільки шифротекст. Для кожного учасника ключ розмови зберігається окремо, загорнутим його публічним ключем.
        </p>
        <p className="mt-2 flex items-center gap-2 text-sm font-medium">
          {status === null ? 'Перевіряємо стан…' : needsRestore
            ? <span className="text-amber-600 dark:text-amber-400">Потрібно відновити ключ із резервної копії</span>
            : status.enabled && localReady
              ? <span className="text-emerald-600 dark:text-emerald-400">Увімкнено на цьому пристрої</span>
              : <span className="text-ios-secondary">Вимкнено</span>}
        </p>
        {status?.enabled && localReady && <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={14} /> Приватний ключ зберігається тільки тут</p>}
      </div>

      {error && <p role="alert" className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {notice && <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">{notice}</p>}

      {!status?.enabled && !needsRestore && (
        <button type="button" disabled={busy} className="primary-btn w-full" onClick={() => void run(() => enableE2ee(user.id), 'Шифрування увімкнено')}>
          <LockKeyhole size={17} /> Увімкнути E2EE
        </button>
      )}

      {needsRestore && (
        <form onSubmit={(event) => onSubmit(event, 'restore')} className="space-y-2 rounded-2xl border p-4 dark:border-slate-800">
          <p className="flex items-center gap-2 text-sm font-semibold"><KeyRound size={16} /> Відновлення на новому пристрої</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Введіть пароль резервної копії, створеної на іншому пристрої.</p>
          <input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} placeholder="Пароль резервної копії" autoComplete="off" className="w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none focus:border-ios-blue dark:border-slate-700" />
          <button type="submit" disabled={busy} className="primary-btn w-full">Відновити ключ</button>
        </form>
      )}

      {status?.enabled && localReady && (
        <>
          <form onSubmit={(event) => onSubmit(event, 'backup')} className="space-y-2 rounded-2xl border p-4 dark:border-slate-800">
            <p className="flex items-center gap-2 text-sm font-semibold"><KeyRound size={16} /> {status.hasBackup ? 'Оновити резервну копію' : 'Створити резервну копію'}</p>
            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
              Приватний ключ шифрується вашим паролем (PBKDF2, 210 000 ітерацій). Сервер не знає пароля й не може розшифрувати копію.
              Без неї відновити доступ до старих повідомлень на новому пристрої неможливо.
            </p>
            <input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} placeholder="Пароль (мінімум 8 символів)" autoComplete="new-password" className="w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none focus:border-ios-blue dark:border-slate-700" />
            <input type="password" value={confirmPassphrase} onChange={(event) => setConfirmPassphrase(event.target.value)} placeholder="Повторіть пароль" autoComplete="new-password" className="w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none focus:border-ios-blue dark:border-slate-700" />
            <button type="submit" disabled={busy} className="primary-btn w-full">Зберегти резервну копію</button>
          </form>

          <div className="flex gap-2">
            {status.hasBackup && (
              <button type="button" disabled={busy} className="secondary-btn flex-1 text-rose-600 dark:text-rose-400" onClick={() => void run(() => removeBackup(), 'Резервну копію видалено')}>
                <Trash2 size={16} /> Видалити копію
              </button>
            )}
            <button type="button" disabled={busy} className="secondary-btn flex-1" onClick={() => {
              if (!window.confirm('Вимкнути E2EE? Приватний ключ буде видалено з цього пристрою.')) return;
              void run(() => disableE2ee(user.id), 'Шифрування вимкнено');
            }}>
              Вимкнути E2EE
            </button>
          </div>
        </>
      )}

      <p className="rounded-xl bg-ios-fill/10 p-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
        Наскрізно шифруються текстові повідомлення та підписи до файлів. Вкладення, стікери, ігри та службові повідомлення
        зберігаються сервером у звичайному вигляді. Увімкніть E2EE на всіх пристроях і створіть резервну копію — інакше
        учасники без ключа не зможуть прочитати зашифровані повідомлення.
      </p>
    </div>
  );
}
