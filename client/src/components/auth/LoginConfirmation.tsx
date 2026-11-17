import { ArrowLeft, ArrowRight, LockKeyhole, MessageSquareText, ShieldCheck, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { errorMessage } from '../../utils/format';
import { Logo } from '../common/Logo';
import { Spinner } from '../common/Spinner';

function retryAfterSeconds(error: unknown): number {
  if (!(error instanceof ApiError)) return 0;
  const payload = error.details as { error?: { details?: { retryAfter?: number } } } | undefined;
  const value = payload?.error?.details?.retryAfter;
  return typeof value === 'number' && value > 0 ? Math.ceil(value) : 0;
}

export function LoginConfirmation() {
  const { pendingLogin, pendingTwoFactor, confirmLogin, completeTwoFactor, resendLogin, requestLoginEmail, cancelLogin } = useAuth();
  const [code, setCode] = useState('');
  const [tfPassword, setTfPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  if (!pendingLogin) return null;

  const viaMiston = pendingLogin.delivery === 'miston';
  const viaEmail = pendingLogin.delivery === 'email';

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await confirmLogin(code.trim());
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  async function submit2fa(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await completeTwoFactor(tfPassword);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      await resendLogin();
      setCooldown(60);
      setNotice(viaMiston ? 'Новий код надіслано в чат Miston.' : 'Новий код надіслано в SMS.');
    } catch (cause) {
      setError(errorMessage(cause));
      setCooldown(retryAfterSeconds(cause));
    } finally {
      setLoading(false);
    }
  }

  async function toEmail() {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      await requestLoginEmail();
      setCooldown(60);
      setNotice('Код надіслано на email.');
    } catch (cause) {
      setError(errorMessage(cause));
      setCooldown(retryAfterSeconds(cause));
    } finally {
      setLoading(false);
    }
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
            onClick={cancelLogin}
            className="flex items-center gap-1.5 text-xs font-semibold text-ios-secondary transition hover:text-ios-blue"
          >
            <ArrowLeft size={14} /> Інший акаунт
          </button>
        </div>

        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-[18px] bg-ios-blue text-white shadow-glow">
          {viaMiston ? <MessageSquareText size={22} /> : <Smartphone size={22} />}
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Підтвердіть вхід</h2>
        <p className="mt-2 text-sm leading-6 text-ios-secondary">
          {viaMiston
            ? 'Ми надіслали 8-значний код у Miston — у чат із ботом Miston. Відкрийте застосунок на іншому пристрої, щоб побачити його.'
            : viaEmail
              ? `Ми надіслали 8-значний код на email ${pendingLogin.emailHint ?? ''}.`
              : `Ми надіслали 8-значний код SMS на номер ${pendingLogin.emailHint ?? 'телефону'}.`}
        </p>

        {pendingLogin.deliveryError && (
          <div role="status" className="mt-4 ios-glass rounded-2xl border border-amber-500/25 px-3.5 py-3 text-sm text-amber-700 dark:text-amber-300">
            {pendingLogin.deliveryError}
            {viaMiston ? ' Код також є в чаті Miston.' : ''}
          </div>
        )}

        {pendingTwoFactor ? (
          <form onSubmit={submit2fa} className="mt-6 space-y-4">
            <div role="status" className="ios-glass rounded-2xl border border-[#34C759]/25 px-3.5 py-3 text-sm text-[#248A3D] dark:text-[#30D158]">
              Код підтвердження правильний. Введіть пароль двоетапної перевірки.
            </div>
            <label className="block">
              <span className="field-label">Пароль двоетапної перевірки</span>
              <input
                className="text-input"
                type="password"
                autoFocus
                required
                value={tfPassword}
                onChange={(event) => setTfPassword(event.target.value)}
                placeholder="••••••••"
              />
            </label>
            {error && (
              <div role="alert" className="ios-glass rounded-2xl border border-rose-500/25 px-3.5 py-3 text-sm text-rose-600 dark:text-rose-300">
                {error}
              </div>
            )}
            <button type="submit" className="primary-btn w-full py-3" disabled={loading || !tfPassword}>
              {loading ? <Spinner label="Перевіряємо" className="text-white" /> : <>Увійти <ArrowRight size={17} /></>}
            </button>
          </form>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block">
              <span className="field-label">Код підтвердження</span>
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

            {pendingLogin.smsDebugCode && (
              <div className="ios-glass rounded-2xl border border-amber-500/25 px-3.5 py-3 text-sm text-amber-700 dark:text-amber-300">
                Тестовий код: <span className="font-mono text-base font-bold tracking-widest">{pendingLogin.smsDebugCode}</span>
              </div>
            )}
            {notice && (
              <div role="status" className="ios-glass rounded-2xl border border-[#34C759]/25 px-3.5 py-3 text-sm text-[#248A3D] dark:text-[#30D158]">
                {notice}
              </div>
            )}
            {error && (
              <div role="alert" className="ios-glass rounded-2xl border border-rose-500/25 px-3.5 py-3 text-sm text-rose-600 dark:text-rose-300">
                {error}
              </div>
            )}

            <button type="submit" className="primary-btn w-full py-3" disabled={loading || code.length !== 8}>
              {loading ? <Spinner label="Перевіряємо" className="text-white" /> : <>Підтвердити вхід <ShieldCheck size={17} /></>}
            </button>
          </form>
        )}

        <div className="mt-4 flex flex-col gap-2 text-center text-xs">
          {viaMiston && pendingLogin.canRequestEmail && (
            <button
              type="button"
              onClick={() => void toEmail()}
              disabled={loading || cooldown > 0}
              className="font-semibold text-ios-blue transition hover:text-accent-500 disabled:text-ios-secondary"
            >
              Немає доступу до Miston? Надіслати код на email
            </button>
          )}
          {!pendingTwoFactor && (
            <button
              type="button"
              onClick={() => void resend()}
              disabled={loading || cooldown > 0}
              className="font-semibold text-ios-secondary underline transition hover:text-ios-label disabled:opacity-50"
            >
              {cooldown > 0
                ? `Надіслати ще раз через ${cooldown} с`
                : viaMiston ? 'Надіслати код у чат ще раз' : 'Надіслати email ще раз'}
            </button>
          )}
        </div>

        <p className="mt-6 flex items-start gap-2 border-t pt-4 text-xs leading-5 text-slate-400 dark:border-slate-800">
          <LockKeyhole size={14} className="mt-0.5 shrink-0" />
          Код діє 10 хвилин. Якщо ви не намагалися увійти, негайно змініть пароль.
        </p>
      </div>
    </main>
  );
}
