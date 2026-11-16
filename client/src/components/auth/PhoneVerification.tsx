import { ArrowRight, LogOut, MessageSquareText, Phone, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../../api';
import { ApiError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { errorMessage } from '../../utils/format';
import { Logo } from '../common/Logo';
import { Spinner } from '../common/Spinner';

/** Скільки секунд чекати повторної відправки, якщо сервер відповів 429. */
function retryAfterSeconds(error: unknown): number {
  if (!(error instanceof ApiError)) return 0;
  const payload = error.details as { error?: { details?: { retryAfter?: number } } } | undefined;
  const value = payload?.error?.details?.retryAfter;
  return typeof value === 'number' && value > 0 ? Math.ceil(value) : 0;
}

export function PhoneVerification() {
  const { user, updateUser, logout } = useAuth();
  const [phone, setPhone] = useState(user?.phoneNumber ?? '');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>(user?.phoneNumber ? 'code' : 'phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [debugCode, setDebugCode] = useState('');
  const [cooldown, setCooldown] = useState(0);

  // Після перезапуску застосунку вже надісланий код лишається дійсним:
  // підхоплюємо номер, на який він був відправлений.
  useEffect(() => {
    let active = true;
    api.auth.phone.status()
      .then((status) => {
        if (!active || !status.pendingPhone) return;
        setPhone(status.pendingPhone);
        setStep('code');
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const maskedPhone = useMemo(() => {
    if (phone.length <= 6) return phone;
    return `${phone.slice(0, 3)} ••• •• ${phone.slice(-2)}`;
  }, [phone]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  if (!user) return null;

  async function sendCode(event?: FormEvent) {
    event?.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const result = await api.auth.phone.request(phone.trim());
      setPhone(result.phoneNumber);
      setStep('code');
      setCode('');
      setCooldown(60);
      setDebugCode(result.debugCode ?? '');
      setNotice(result.debugCode ? 'SMS не налаштований — тестовий код показано нижче.' : 'Код надіслано в SMS.');
    } catch (cause) {
      setError(errorMessage(cause));
      setCooldown(retryAfterSeconds(cause));
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api.auth.phone.verify(code.trim());
      updateUser(result.user);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  async function skip() {
    updateUser({ ...user!, phoneVerified: true });
  }

  return (
    <main className="relative flex min-h-full items-center justify-center overflow-hidden bg-slate-50 p-5 dark:bg-slate-950">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-violet-400/20 blur-3xl" />

      <div className="relative w-full max-w-md rounded-3xl border border-white/80 bg-white/95 p-6 shadow-soft backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/95 sm:p-8">
        <div className="mb-6 flex items-center justify-between">
          <Logo />
          <button
            type="button"
            onClick={() => void logout()}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 transition hover:text-rose-500"
          >
            <LogOut size={14} /> Вийти
          </button>
        </div>

        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-50 text-accent-600 dark:bg-accent-500/10 dark:text-accent-400">
          {step === 'phone' ? <Phone size={22} /> : <ShieldCheck size={22} />}
        </div>
        <h2 className="text-2xl font-bold tracking-tight">
          {step === 'phone' ? 'Додайте номер телефону' : 'Підтвердіть номер'}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          {step === 'phone'
            ? 'Для безпеки акаунта прив’яжіть номер телефону. Ми надішлемо 8-значний код через SMS.'
            : <>Код із 8 цифр надіслано на <span className="font-semibold text-slate-700 dark:text-slate-200">{maskedPhone}</span>.</>}
        </p>

        {step === 'phone' ? (
          <form onSubmit={sendCode} className="mt-6 space-y-4">
            <label className="block">
              <span className="field-label">Номер телефону</span>
              <input
                className="text-input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                autoFocus
                required
                minLength={8}
                maxLength={30}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+380 50 123 45 67"
              />
            </label>
            {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">{error}</div>}
            <button type="submit" className="primary-btn w-full py-3" disabled={loading}>
              {loading ? <Spinner label="Надсилаємо код" className="text-white" /> : <>Надіслати код <ArrowRight size={17} /></>}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="mt-6 space-y-4">
            <label className="block">
              <span className="field-label">Код із SMS</span>
              <input
                className="text-input text-center text-xl font-bold tracking-[0.35em]"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                pattern="[0-9]{8}"
                maxLength={8}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="12345678"
              />
            </label>
            {debugCode && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                <MessageSquareText size={15} className="mr-1 inline" /> Тестовий код: <span className="font-mono text-base font-bold tracking-widest">{debugCode}</span>
              </div>
            )}
            {notice && !debugCode && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">{notice}</div>}
            {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">{error}</div>}
            <button type="submit" className="primary-btn w-full py-3" disabled={loading || code.length !== 8}>
              {loading ? <Spinner label="Перевіряємо" className="text-white" /> : <>Підтвердити <ShieldCheck size={17} /></>}
            </button>
            <div className="flex items-center justify-between gap-3 pt-1 text-xs">
              <button type="button" onClick={() => { setStep('phone'); setError(''); setNotice(''); }} className="font-semibold text-slate-500 underline transition hover:text-slate-800 dark:hover:text-slate-200">
                Змінити номер
              </button>
              <button
                type="button"
                onClick={() => void sendCode()}
                disabled={loading || cooldown > 0}
                className="font-semibold text-accent-600 transition hover:text-accent-500 disabled:text-slate-400 dark:text-accent-400"
              >
                {cooldown > 0 ? `Надіслати ще раз через ${cooldown} с` : 'Надіслати код ще раз'}
              </button>
            </div>
          </form>
        )}

        <div className="mt-6 border-t border-slate-100 pt-4 text-center dark:border-slate-800">
          <button type="button" onClick={() => void skip()} className="text-xs text-slate-400 underline transition hover:text-slate-600 dark:hover:text-slate-300">
            Продовжити без підтвердження
          </button>
        </div>
      </div>
    </main>
  );
}
