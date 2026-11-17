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
    <main className="relative flex min-h-full items-center justify-center overflow-hidden bg-ios-bg p-5">
      <div className="pointer-events-none absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-ios-blue/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-ios-blue/[.07] blur-3xl" />

      <div className="ios-glass relative w-full max-w-md rounded-[32px] border p-6 shadow-soft sm:p-8">
        <div className="mb-6 flex items-center justify-between">
          <Logo />
          <button
            type="button"
            onClick={() => void logout()}
            className="flex items-center gap-1.5 text-xs font-semibold text-ios-secondary transition hover:text-rose-500"
          >
            <LogOut size={14} /> Вийти
          </button>
        </div>

        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-[18px] bg-ios-blue text-white shadow-glow">
          {step === 'phone' ? <Phone size={22} /> : <ShieldCheck size={22} />}
        </div>
        <h2 className="text-2xl font-bold tracking-tight">
          {step === 'phone' ? 'Додайте номер телефону' : 'Підтвердіть номер'}
        </h2>
        <p className="mt-2 text-sm leading-6 text-ios-secondary">
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
            {error && <div role="alert" className="ios-glass rounded-2xl border border-rose-500/25 px-3.5 py-3 text-sm text-rose-600 dark:text-rose-300">{error}</div>}
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
              <div className="ios-glass rounded-2xl border border-amber-500/25 px-3.5 py-3 text-sm text-amber-700 dark:text-amber-300">
                <MessageSquareText size={15} className="mr-1 inline" /> Тестовий код: <span className="font-mono text-base font-bold tracking-widest">{debugCode}</span>
              </div>
            )}
            {notice && !debugCode && <div role="status" className="ios-glass rounded-2xl border border-[#34C759]/25 px-3.5 py-3 text-sm text-[#248A3D] dark:text-[#30D158]">{notice}</div>}
            {error && <div role="alert" className="ios-glass rounded-2xl border border-rose-500/25 px-3.5 py-3 text-sm text-rose-600 dark:text-rose-300">{error}</div>}
            <button type="submit" className="primary-btn w-full py-3" disabled={loading || code.length !== 8}>
              {loading ? <Spinner label="Перевіряємо" className="text-white" /> : <>Підтвердити <ShieldCheck size={17} /></>}
            </button>
            <div className="flex items-center justify-between gap-3 pt-1 text-xs">
              <button type="button" onClick={() => { setStep('phone'); setError(''); setNotice(''); }} className="font-semibold text-ios-secondary underline transition hover:text-ios-label">
                Змінити номер
              </button>
              <button
                type="button"
                onClick={() => void sendCode()}
                disabled={loading || cooldown > 0}
                className="font-semibold text-ios-blue transition hover:text-accent-500 disabled:text-ios-secondary"
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
