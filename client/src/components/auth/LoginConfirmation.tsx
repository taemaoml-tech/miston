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
    <main className="relative flex min-h-full items-center justify-center overflow-hidden bg-slate-50 p-5 dark:bg-slate-950">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-violet-400/20 blur-3xl" />

      <div className="relative w-full max-w-md rounded-3xl border border-white/80 bg-white/95 p-6 shadow-soft backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/95 sm:p-8">
        <div className="mb-6 flex items-center justify-between">
          <Logo />
          <button
            type="button"
            onClick={cancelLogin}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 transition hover:text-accent-600"
          >
            <ArrowLeft size={14} /> Інший акаунт
          </button>
        </div>

        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-50 text-accent-600 dark:bg-accent-500/10 dark:text-accent-400">
          {viaMiston ? <MessageSquareText size={22} /> : <Smartphone size={22} />}
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Підтвердіть вхід</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          {viaMiston
            ? 'Ми надіслали 8-значний код у Miston — у чат із ботом Miston. Відкрийте застосунок на іншому пристрої, щоб побачити його.'
            : viaEmail
              ? `Ми надіслали 8-значний код на email ${pendingLogin.emailHint ?? ''}.`
              : `Ми надіслали 8-значний код SMS на номер ${pendingLogin.emailHint ?? 'телефону'}.`}
        </p>

        {pendingLogin.deliveryError && (
          <div role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
            {pendingLogin.deliveryError}
            {viaMiston ? ' Код також є в чаті Miston.' : ''}
          </div>
        )}

        {pendingTwoFactor ? (
          <form onSubmit={submit2fa} className="mt-6 space-y-4">
            <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
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
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
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
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                Тестовий код: <span className="font-mono text-base font-bold tracking-widest">{pendingLogin.smsDebugCode}</span>
              </div>
            )}
            {notice && (
              <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                {notice}
              </div>
            )}
            {error && (
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
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
              className="font-semibold text-accent-600 transition hover:text-accent-500 disabled:text-slate-400 dark:text-accent-400"
            >
              Немає доступу до Miston? Надіслати код на email
            </button>
          )}
          {!pendingTwoFactor && (
            <button
              type="button"
              onClick={() => void resend()}
              disabled={loading || cooldown > 0}
              className="font-semibold text-slate-500 underline transition hover:text-slate-800 disabled:text-slate-400 dark:hover:text-slate-200"
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
