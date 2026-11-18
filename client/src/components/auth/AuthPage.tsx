import { ArrowRight, Check, Copy, Eye, EyeOff, LockKeyhole, Mail, MessageCircle, Moon, QrCode, RefreshCw, ShieldAlert, ShieldCheck, Sun, Users, Video } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../../api';
import { SESSION_NOTICE_KEY, useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { infoHref } from '../../router/infoRoute';
import { errorMessage } from '../../utils/format';
import { INFO_LINKS } from '../info/infoLinks';
import { AppDownload } from '../common/AppDownload';
import { Logo, Mark } from '../common/Logo';
import { Spinner } from '../common/Spinner';

type AuthMode = 'login' | 'register' | 'qr';

interface QrSession {
  token: string;
  expiresAt: string;
  dataUrl: string;
}

export function AuthPage() {
  const { login, loginWithQr, applySession, register } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mode, setMode] = useState<AuthMode>('login');
  const [notice, setNotice] = useState('');
  const [savedAccount, setSavedAccount] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [qrInput, setQrInput] = useState('');
  const [qrSession, setQrSession] = useState<QrSession | null>(null);
  const [qrStatus, setQrStatus] = useState<'idle' | 'pending' | 'approved'>('idle');
  const [qrError, setQrError] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [qrCopied, setQrCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [form, setForm] = useState({ identifier: '', email: '', username: '', displayName: '', phone: '', password: '', confirm: '' });

  useEffect(() => {
    const value = sessionStorage.getItem(SESSION_NOTICE_KEY);
    if (value) {
      sessionStorage.removeItem(SESSION_NOTICE_KEY);
      setNotice(value);
    }
    try {
      const last = localStorage.getItem('relay.lastMistId');
      if (last) {
        setSavedAccount(last);
      } else {
        // Міграція зі старого ключа: звичайний логін перетворюємо на Mist ID.
        const previous = localStorage.getItem('relay.lastUsername');
        if (previous && !previous.includes('@')) setSavedAccount(`${previous}@mist.id`);
      }
    } catch { /* ignore */ }
  }, []);

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError('');
    setQrError('');
    if (next !== 'qr') {
      setQrSession(null);
      setQrStatus('idle');
    }
  };

  async function createQrSession() {
    setQrLoading(true);
    setQrError('');
    setQrCopied(false);
    try {
      const result = await api.mistQr.createLoginSession();
      const dataUrl = await QRCode.toDataURL(result.token, {
        width: 240,
        margin: 2,
        color: { dark: '#111827', light: '#ffffff' },
      });
      setQrSession({ ...result, dataUrl });
      setQrStatus('pending');
      setNow(Date.now());
    } catch (cause) {
      setQrError(errorMessage(cause));
      setQrStatus('idle');
    } finally {
      setQrLoading(false);
    }
  }

  useEffect(() => {
    if (mode !== 'qr' || qrSession) return;
    void createQrSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (qrStatus !== 'pending' || !qrSession) return;
    let active = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const result = await api.mistQr.loginSessionStatus(qrSession.token);
        if (!active) return;
        if (result.status === 'approved' && result.auth) {
          setQrStatus('approved');
          applySession(result.auth);
          return;
        }
      } catch (cause) {
        if (!active) return;
        setQrError(errorMessage(cause));
        return;
      }
      if (active) timer = window.setTimeout(() => void poll(), 2000);
    };
    timer = window.setTimeout(() => void poll(), 1000);
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, [qrSession, qrStatus, applySession]);

  useEffect(() => {
    if (qrStatus !== 'pending') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [qrStatus]);

  useEffect(() => {
    if (!qrCopied) return;
    const timer = window.setTimeout(() => setQrCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [qrCopied]);

  const qrRemaining = qrSession ? Math.max(0, Math.ceil((new Date(qrSession.expiresAt).getTime() - now) / 1000)) : 0;

  async function copyQrToken() {
    if (!qrSession) return;
    try {
      await navigator.clipboard.writeText(qrSession.token);
      setQrCopied(true);
    } catch {
      setQrError('Не вдалося скопіювати код.');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (mode === 'register' && form.password !== form.confirm) { setError('Паролі не збігаються.'); return; }
    if (form.password.length < 8) { setError('Пароль має містити щонайменше 8 символів.'); return; }
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.identifier.trim(), form.password);
      } else {
        await register(form.email.trim(), form.username.trim(), form.displayName.trim(), form.password, form.phone.trim());
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  async function submitQr(event: FormEvent) {
    event.preventDefault();
    const token = qrInput.trim();
    if (!token) return;
    setError('');
    setLoading(true);
    try {
      await loginWithQr(token);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  const title = mode === 'qr' ? 'Увійти за QR-кодом' : mode === 'login' ? 'Увійти з Mist ID' : 'Створіть Mist ID';
  const subtitle = mode === 'qr'
    ? 'Покажіть цей код на телефоні у Miston — вхід відбудеться без пароля.'
    : mode === 'login'
      ? 'Ваш Mist ID — це адреса для входу та пошти в Miston.'
      : 'Одна адреса для чатів, друзів і пошти Mist ID.';
  const errorBlock = error ? (
    <div role="alert" className="ios-glass rounded-2xl border border-rose-500/25 px-3.5 py-3 text-sm text-rose-600 dark:text-rose-300">{error}</div>
  ) : null;

  return (
    <main className="auth-viewport subtle-scrollbar relative overflow-y-auto bg-ios-bg">
      <div className="pointer-events-none absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-ios-blue/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-ios-blue/[.07] blur-3xl" />
      <button type="button" onClick={toggleTheme} className="icon-btn ios-glass absolute right-5 top-5 z-10 border shadow-sm" aria-label={`Перемкнути на ${theme === 'dark' ? 'світлу' : 'темну'} тему`}>
        {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
      </button>
      <div className="relative mx-auto grid min-h-full max-w-6xl lg:grid-cols-[1.05fr_.95fr]">
        <section className="hidden flex-col justify-between p-12 lg:flex xl:p-16">
          <Logo size={40} />
          <div className="max-w-lg">
            <div className="ios-glass mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold text-ios-blue">
              <span className="h-1.5 w-1.5 rounded-full bg-[#34C759]" /> Спілкування завжди в синхроні
            </div>
            <h1 className="text-5xl font-bold leading-[1.08] tracking-tight text-ios-label xl:text-6xl">Miston —<br /><span className="bg-gradient-to-r from-[#4A97FF] to-[#007AFF] bg-clip-text text-transparent">твій сучасний месенджер.</span></h1>
            <p className="mt-6 max-w-md text-lg leading-8 text-ios-secondary">Продумані повідомлення для друзів, згуртованих команд і спільнот будь-якого розміру.</p>
            <div className="mt-9 flex flex-wrap gap-x-7 gap-y-3 text-sm text-ios-label">
              <span className="flex items-center gap-2"><ShieldCheck size={18} className="text-ios-blue" /> Безпечні сесії</span>
              <span className="flex items-center gap-2"><MessageCircle size={18} className="text-ios-blue" /> Миттєво в реальному часі</span>
              <span className="flex items-center gap-2"><Video size={18} className="text-ios-blue" /> Дзвінки й демонстрація екрана</span>
              <span className="flex items-center gap-2"><Users size={18} className="text-ios-blue" /> Групи та канали</span>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {INFO_LINKS.map((link) => (
                <a key={link.route} href={infoHref(link.route)} className="flex items-center gap-1.5 text-ios-secondary transition hover:text-ios-blue">
                  <link.icon size={15} /> {link.label}
                </a>
              ))}
            </div>
          </div>
          <p className="text-xs text-ios-secondary">Просто, спокійно й створено для єднання.</p>
        </section>

        <section className="flex items-center justify-center p-5 sm:p-8 lg:p-12">
          <div className="w-full max-w-md rounded-[32px] border border-ios-separator/10 bg-ios-glass/80 p-6 shadow-soft backdrop-blur-2xl sm:p-8">
            <div className="mb-6 flex items-center justify-between lg:hidden"><Logo /><span className="text-[11px] font-semibold text-ios-secondary">Mist ID</span></div>
            <div className="mb-7 text-center">
              <div className="mx-auto mb-4"><Mark size={56} className="rounded-[18px] shadow-glow" /></div>
              <h2 className="text-[28px] font-bold tracking-tight">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-ios-secondary">{subtitle}</p>
            </div>
            {savedAccount && mode === 'login' && (
              <div className="ios-glass mb-5 flex items-center gap-3 rounded-[22px] border p-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ios-blue text-lg font-bold text-white">{savedAccount.charAt(0).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ios-secondary">Останній акаунт</p>
                  <p className="truncate text-sm font-semibold">{savedAccount}</p>
                </div>
                <button type="button" className="primary-btn px-4 py-2" onClick={() => { setForm((f) => ({ ...f, identifier: savedAccount })); }}>
                  Увійти
                </button>
              </div>
            )}
            {notice && (
              <div role="status" className="ios-glass mb-5 flex items-start justify-between gap-3 rounded-2xl border border-amber-500/25 px-3.5 py-3 text-sm text-amber-700 dark:text-amber-300">
                <span className="flex min-w-0 items-start gap-2"><ShieldAlert size={16} className="mt-0.5 shrink-0" /><span>{notice}</span></span>
                <button type="button" onClick={() => setNotice('')} className="shrink-0 font-semibold underline">Зрозуміло</button>
              </div>
            )}
            <div className="mb-6 grid grid-cols-3 rounded-full bg-ios-fill/10 p-1" role="tablist" aria-label="Режим автентифікації">
              {([
                { key: 'login' as const, label: 'Увійти' },
                { key: 'register' as const, label: 'Реєстрація' },
                { key: 'qr' as const, label: 'QR-код' },
              ]).map((item) => (
                <button key={item.key} type="button" role="tab" aria-selected={mode === item.key} onClick={() => switchMode(item.key)} className={`rounded-full px-2 py-1.5 text-sm font-semibold transition ${mode === item.key ? 'bg-ios-bg text-ios-label shadow-sm' : 'text-ios-secondary hover:text-ios-label'}`}>{item.label}</button>
              ))}
            </div>

            {mode === 'qr' ? (
              <div className="space-y-4">
                <div className="ios-glass flex items-start gap-3 rounded-[20px] border p-4 text-sm text-ios-secondary">
                  <QrCode size={20} className="mt-0.5 shrink-0 text-ios-blue" />
                  <p>Відкрийте <b>Налаштування → Вхід через QR-код</b> у Miston на телефоні, де ви вже увійшли, і відскануйте цей код. Пароль і підтвердження не потрібні.</p>
                </div>

                <div className="flex flex-col items-center rounded-[24px] border border-ios-separator/10 bg-ios-bg/60 p-5">
                  {qrLoading && !qrSession ? (
                    <Spinner label="Створення коду…" className="py-10" />
                  ) : qrSession?.dataUrl ? (
                    <img src={qrSession.dataUrl} alt="QR-код для входу в Miston" className="h-48 w-48 rounded-2xl bg-white p-2 shadow-sm" />
                  ) : (
                    <div className="flex h-48 w-48 items-center justify-center rounded-2xl bg-ios-fill/10 text-ios-secondary"><QrCode size={48} /></div>
                  )}

                  <p className="mt-3 text-xs font-semibold text-ios-secondary" role="status">
                    {qrStatus === 'approved' ? 'Готово — виконуємо вхід…'
                      : qrStatus === 'pending' ? `Код дійсний ще ${qrRemaining} с`
                        : 'Не вдалося створити код'}
                  </p>
                  <div className="mt-2 h-1 w-40 overflow-hidden rounded-full bg-ios-fill/15">
                    <span className="block h-full rounded-full bg-ios-blue transition-all" style={{ width: `${qrRemaining > 0 ? Math.min(100, (qrRemaining / 300) * 100) : 0}%` }} />
                  </div>
                  {qrSession && (
                    <>
                      <p className="mt-4 text-[11px] text-ios-secondary">Або скопіюйте код і введіть його на телефоні вручну</p>
                      <code className="mt-1.5 max-w-full break-all rounded-lg bg-ios-fill/10 px-2 py-1 text-[10px] text-ios-secondary">{qrSession.token}</code>
                      <div className="mt-3 grid w-full grid-cols-2 gap-2">
                        <button type="button" className="secondary-btn text-xs" onClick={() => void copyQrToken()}>
                          {qrCopied ? <Check size={15} /> : <Copy size={15} />} {qrCopied ? 'Скопійовано' : 'Копіювати'}
                        </button>
                        <button type="button" className="secondary-btn text-xs" onClick={() => void createQrSession()} disabled={qrLoading}>
                          <RefreshCw size={15} /> Новий код
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {qrError && <div role="alert" className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-3.5 py-3 text-sm text-rose-600 dark:text-rose-300">{qrError}</div>}
                {errorBlock}

                <details className="ios-glass rounded-[20px] border px-4 py-3 text-sm">
                  <summary className="cursor-pointer font-medium text-ios-secondary">Ввести код вручну</summary>
                  <form onSubmit={submitQr} className="mt-3 space-y-3">
                    <label className="block"><span className="field-label">Код входу Mist ID</span><input className="text-input" autoComplete="off" required minLength={10} maxLength={96} value={qrInput} onChange={(e) => setQrInput(e.target.value)} placeholder="mistlogin:… або 48 символів" /></label>
                    <button type="submit" className="primary-btn w-full py-2.5" disabled={loading}>
                      {loading ? <Spinner label="Вхід…" className="text-white" /> : <>Увійти за кодом<ArrowRight size={17} /></>}
                    </button>
                  </form>
                </details>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                {mode === 'login' ? (
                  <label className="block"><span className="field-label">Mist ID, логін або email</span><input className="text-input" autoComplete="username" required autoFocus value={form.identifier} onChange={(e) => update('identifier', e.target.value)} placeholder="username@mist.id" /></label>
                ) : (
                  <>
                    <label className="block"><span className="field-label">Показуване ім'я</span><input className="text-input" autoComplete="name" required maxLength={60} value={form.displayName} onChange={(e) => update('displayName', e.target.value)} placeholder="Олена Коваль" /></label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block"><span className="field-label">Ім'я користувача</span><input className="text-input" autoComplete="username" required minLength={3} pattern="[a-zA-Z0-9_]+" value={form.username} onChange={(e) => update('username', e.target.value)} placeholder="olena" /><span className="mt-1 block text-[11px] text-ios-secondary">Ваш Mist ID: <b className="text-ios-blue">{form.username || 'username'}@mist.id</b></span></label>
                      <label className="block"><span className="field-label">Електронна пошта</span><input className="text-input" type="email" autoComplete="email" required value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="olena@mail.com" /></label>
                    </div>
                    <label className="block"><span className="field-label">Номер телефону</span><input className="text-input" type="tel" autoComplete="tel" required minLength={8} maxLength={30} value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="+380 50 123 45 67" /><span className="mt-1 block text-[11px] text-ios-secondary">Надішлемо 8-значний код підтвердження через SMS.</span></label>
                  </>
                )}
                <label className="block"><span className="field-label">Пароль</span><span className="relative block"><input className="text-input pr-11" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} value={form.password} onChange={(e) => update('password', e.target.value)} placeholder="Щонайменше 8 символів" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" aria-label={showPassword ? 'Приховати пароль' : 'Показати пароль'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
                {mode === 'register' && <label className="block"><span className="field-label">Підтвердіть пароль</span><span className="relative block"><input className="text-input pr-10" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={form.confirm} onChange={(e) => update('confirm', e.target.value)} placeholder="Повторіть пароль" />{form.confirm && form.confirm === form.password && <Check size={17} className="absolute right-3 top-3 text-emerald-500" />}</span></label>}
                {errorBlock}
                <button type="submit" className="primary-btn mt-2 w-full py-3" disabled={loading}>
                  {loading ? <Spinner label={mode === 'login' ? 'Вхід…' : 'Створення акаунта…'} className="text-white" /> : <>{mode === 'login' ? 'Увійти до Miston' : 'Створити Mist ID'}<ArrowRight size={17} /></>}
                </button>
              </form>
            )}
            <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-ios-secondary"><Mail size={13} /> Пошта Mist ID доступна у профілі після входу.</p>
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-ios-secondary"><LockKeyhole size={13} /> Ваша сесія безпечно зберігається на цьому пристрої</div>
            <AppDownload />
            <nav className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs" aria-label="Сторінки проєкту">
              {INFO_LINKS.map((link) => (
                <a key={link.route} href={infoHref(link.route)} className="flex items-center gap-1.5 text-ios-secondary transition hover:text-ios-blue">
                  <link.icon size={13} /> {link.label}
                </a>
              ))}
            </nav>
          </div>
        </section>
      </div>
      <div className="pointer-events-none absolute bottom-8 left-8 hidden opacity-30 xl:block"><Users size={180} strokeWidth={.5} /></div>
    </main>
  );
}
