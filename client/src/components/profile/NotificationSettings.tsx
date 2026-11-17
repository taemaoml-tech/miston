import { BellRing, MessageSquareText, Phone, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { errorMessage } from '../../utils/format';
import { diagnoseNotifications, sendTestNotification } from '../../utils/notifications';
import type { NotificationReport } from '../../utils/notifications';
import { getFcmToken, getNativeFcmToken } from '../../utils/firebase';

function maskPhone(phone: string): string {
  if (phone.length <= 6) return phone;
  return `${phone.slice(0, 3)} ••• •• ${phone.slice(-2)}`;
}

export function NotificationSettings() {
  const { user, updateUser } = useAuth();
  const [report, setReport] = useState<NotificationReport | null>(null);
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(user?.smsNotificationsEnabled ?? true);
  const [smsError, setSmsError] = useState('');
  const [smsBusy, setSmsBusy] = useState(false);
  const [serverPush, setServerPush] = useState<{ tokens: number; configured: boolean } | null>(null);

  const phoneVerified = user?.phoneVerified === true;
  const phoneNumber = user?.phoneNumber ?? null;

  const refreshServerPush = () => {
    void api.push.status().then(setServerPush).catch(() => setServerPush(null));
  };

  useEffect(() => {
    let alive = true;
    setReport(null);
    void diagnoseNotifications().then((next) => { if (alive) setReport(next); });
    refreshServerPush();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    setSmsEnabled(user?.smsNotificationsEnabled ?? true);
  }, [user?.smsNotificationsEnabled]);

  const check = () => {
    setBusy(true); setResult('');
    void diagnoseNotifications()
      .then(setReport)
      .finally(() => setBusy(false));
    refreshServerPush();
  };
  const test = () => {
    setBusy(true); setResult('');
    void (async () => {
      const local = await sendTestNotification();
      try {
        const status = await api.push.status();
        setServerPush(status);
        if (!status.configured) {
          setResult(`${local} Серверні пуші вимкнені: немає ключа Firebase на сервері.`);
          return;
        }
        if (status.tokens === 0) {
          setResult(`${local} Але цей пристрій ще не зареєстрований для пушів — перезавантажте Miston і дозвольте сповіщення.`);
          return;
        }
        const sent = await api.push.test();
        if (sent.sent === 0 && sent.failed > 0) {
          setResult(`${local} Firebase відхилив пуш: ${sent.errors[0] || 'невідома помилка'}`);
          return;
        }
        setResult(`${local} Сервер надіслав пуш: успішно ${sent.sent}, помилок ${sent.failed}.`);
      } catch (cause) {
        setResult(`${local} ${errorMessage(cause)}`);
      }
    })().finally(() => setBusy(false));
  };

  const enablePush = async () => {
    setBusy(true); setResult('');
    try {
      const nativeToken = await getNativeFcmToken();
      const token = nativeToken ?? (await getFcmToken());
      if (!token) {
        setResult('Не вдалося отримати дозвіл на сповіщення. Перевірте налаштування browser/Android для Miston.');
        return;
      }
      await api.push.register(token, nativeToken ? 'android' : 'web');
      setResult('Сповіщення увімкнено для цього пристрою.');
      refreshServerPush();
    } catch (cause) {
      setResult(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const toggleSms = async (enabled: boolean) => {
    setSmsBusy(true);
    setSmsError('');
    try {
      const result = await api.auth.phone.setNotifications(enabled);
      setSmsEnabled(result.smsNotificationsEnabled);
      updateUser(result.user);
    } catch (cause) {
      setSmsError(errorMessage(cause));
    } finally {
      setSmsBusy(false);
    }
  };

  return (
    <section className="mt-6 border-t pt-5" aria-label="Сповіщення">
      <p className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"><BellRing size={13} /> Сповіщення</p>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {report ? report.message : 'Перевіряємо…'}
      </p>
      {serverPush && (
        <p className="mt-1 text-xs text-slate-400">
          {serverPush.configured
            ? `Серверні пуші увімкнено, пристроїв у черзі: ${serverPush.tokens}.`
            : 'Серверні пуші вимкнені: немає ключа Firebase.'}
        </p>
      )}
      {result && (
        <p className={`mt-2 rounded-xl p-3 text-sm ${report?.ready || result.startsWith('Тестове') ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'}`}>
          {result}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="secondary-btn" onClick={() => void enablePush()} disabled={busy}>Увімкнути сповіщення</button>
        <button type="button" className="secondary-btn" onClick={test} disabled={busy}>Надіслати тестове</button>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-accent-300 hover:text-accent-700 dark:text-slate-300 dark:hover:text-accent-300" onClick={check} disabled={busy}>
          <RefreshCw size={13} /> Перевірити ще раз
        </button>
      </div>
      <p className="mt-2.5 text-xs text-slate-400">
        Нові повідомлення надходять через Firebase навіть коли вкладку закрито або застосунок у фоні.
        На Android системні налаштування можуть обмежувати фонову роботу: Додатки → Miston → Батарея → «Без обмежень».
      </p>

      <div className="mt-5 border-t pt-4">
        <p className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"><MessageSquareText size={13} /> SMS-повідомлення</p>
        {phoneVerified ? (
          <>
            <p className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
              <Phone size={13} /> Номер: <span className="font-semibold text-slate-700 dark:text-slate-200">{phoneNumber ? maskPhone(phoneNumber) : 'не вказано'}</span>
            </p>
            <label className="mt-2.5 flex cursor-pointer items-start gap-2.5 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-accent-600"
                checked={smsEnabled}
                disabled={smsBusy}
                onChange={(event) => void toggleSms(event.target.checked)}
              />
              <span>Присилати SMS про нові повідомлення</span>
            </label>
            <p className="mt-2 text-xs text-slate-400">
              Надсилаємо, коли ви не в застосунку або не відповіли в розмові понад 5 хвилин. Не частіше одного SMS на розмовку за 10 хвилин.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Підтвердіть номер телефону, щоб отримувати SMS про нові повідомлення.
            </p>
            <button
              type="button"
              className="secondary-btn mt-2.5"
              onClick={() => user && updateUser({ ...user, phoneVerified: false })}
            >
              <Phone size={14} /> Підтвердити номер
            </button>
          </>
        )}
        {smsError && (
          <p className="mt-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{smsError}</p>
        )}
      </div>
    </section>
  );
}
