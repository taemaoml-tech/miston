import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, MessageCircle, Moon, ShieldAlert, ShieldCheck, Sun, Users, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { SESSION_NOTICE_KEY, useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { infoHref } from '../../router/infoRoute';
import { errorMessage } from '../../utils/format';
import { INFO_LINKS } from '../info/infoLinks';
import { Logo } from '../common/Logo';
import { Spinner } from '../common/Spinner';

export function AuthPage() {
  const { login, register } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const value = sessionStorage.getItem(SESSION_NOTICE_KEY);
    if (!value) return;
    sessionStorage.removeItem(SESSION_NOTICE_KEY);
    setNotice(value);
  }, []);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ identifier: '', email: '', username: '', displayName: '', password: '', confirm: '' });

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const switchMode = (next: 'login' | 'register') => { setMode(next); setError(''); };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (mode === 'register' && form.password !== form.confirm) { setError('Паролі не збігаються.'); return; }
    if (form.password.length < 8) { setError('Пароль має містити щонайменше 8 символів.'); return; }
    setLoading(true);
    try {
      if (mode === 'login') await login(form.identifier.trim(), form.password);
      else await register(form.email.trim(), form.username.trim(), form.displayName.trim(), form.password);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-full overflow-hidden bg-slate-50 dark:bg-slate-950">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-violet-400/20 blur-3xl" />
      <button type="button" onClick={toggleTheme} className="icon-btn absolute right-5 top-5 z-10 bg-white/70 shadow-sm dark:bg-slate-900/70" aria-label={`Перемкнути на ${theme === 'dark' ? 'світлу' : 'темну'} тему`}>
        {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
      </button>
      <div className="relative mx-auto grid min-h-screen max-w-6xl lg:grid-cols-[1.05fr_.95fr]">
        <section className="hidden flex-col justify-between p-12 lg:flex xl:p-16">
          <Logo size={40} />
          <div className="max-w-lg">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent-100 bg-white/70 px-3 py-1.5 text-xs font-semibold text-accent-700 dark:border-accent-500/20 dark:bg-slate-900/60 dark:text-accent-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Спілкування завжди в синхроні
            </div>
            <h1 className="text-5xl font-bold leading-[1.08] tracking-tight text-slate-900 dark:text-white xl:text-6xl">Miston —<br /><span className="bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent">твій сучасний месенджер.</span></h1>
            <p className="mt-6 max-w-md text-lg leading-8 text-slate-600 dark:text-slate-400">Продумані повідомлення для друзів, згуртованих команд і спільнот будь-якого розміру.</p>
            <div className="mt-9 flex flex-wrap gap-x-7 gap-y-3 text-sm text-slate-600 dark:text-slate-300">
              <span className="flex items-center gap-2"><ShieldCheck size={18} className="text-accent-500" /> Безпечні сесії</span>
              <span className="flex items-center gap-2"><MessageCircle size={18} className="text-accent-500" /> Миттєво в реальному часі</span>
              <span className="flex items-center gap-2"><Video size={18} className="text-accent-500" /> Дзвінки й демонстрація екрана</span>
              <span className="flex items-center gap-2"><Users size={18} className="text-accent-500" /> Групи та канали</span>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {INFO_LINKS.map((link) => (
                <a key={link.route} href={infoHref(link.route)} className="flex items-center gap-1.5 text-slate-500 transition hover:text-accent-600 dark:text-slate-400 dark:hover:text-accent-400">
                  <link.icon size={15} /> {link.label}
                </a>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-400">Просто, спокійно й створено для єднання.</p>
        </section>

        <section className="flex items-center justify-center p-5 sm:p-8 lg:p-12">
          <div className="w-full max-w-md rounded-3xl border border-white/80 bg-white/90 p-6 shadow-soft backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-8">
            <div className="mb-8 lg:hidden"><Logo /></div>
            <div className="mb-7">
              <h2 className="text-2xl font-bold tracking-tight">{mode === 'login' ? 'З поверненням' : 'Створіть акаунт'}</h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{mode === 'login' ? 'Продовжте з того місця, де зупинилися.' : 'Ваша наступна розмова починається тут.'}</p>
            </div>
            {notice && (
              <div role="status" className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                <span className="flex min-w-0 items-start gap-2"><ShieldAlert size={16} className="mt-0.5 shrink-0" /><span>{notice}</span></span>
                <button type="button" onClick={() => setNotice('')} className="shrink-0 font-semibold underline">Зрозуміло</button>
              </div>
            )}
            <div className="mb-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="tablist" aria-label="Режим автентифікації">
              {(['login', 'register'] as const).map((item) => (
                <button key={item} type="button" role="tab" aria-selected={mode === item} onClick={() => switchMode(item)} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${mode === item ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>{item === 'login' ? 'Увійти' : 'Реєстрація'}</button>
              ))}
            </div>
            <form onSubmit={submit} className="space-y-4">
              {mode === 'login' ? (
                <label className="block"><span className="field-label">Електронна пошта або ім'я користувача</span><input className="text-input" autoComplete="username" required autoFocus value={form.identifier} onChange={(e) => update('identifier', e.target.value)} placeholder="you@example.com" /></label>
              ) : (
                <>
                  <label className="block"><span className="field-label">Показуване ім'я</span><input className="text-input" autoComplete="name" required maxLength={60} value={form.displayName} onChange={(e) => update('displayName', e.target.value)} placeholder="Олена Коваль" /></label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block"><span className="field-label">Ім'я користувача</span><input className="text-input" autoComplete="username" required minLength={3} pattern="[a-zA-Z0-9_]+" value={form.username} onChange={(e) => update('username', e.target.value)} placeholder="olena" /></label>
                    <label className="block"><span className="field-label">Електронна пошта</span><input className="text-input" type="email" autoComplete="email" required value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="olena@mail.com" /></label>
                  </div>
                </>
              )}
              <label className="block"><span className="field-label">Пароль</span><span className="relative block"><input className="text-input pr-11" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} value={form.password} onChange={(e) => update('password', e.target.value)} placeholder="Щонайменше 8 символів" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" aria-label={showPassword ? 'Приховати пароль' : 'Показати пароль'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
              {mode === 'register' && <label className="block"><span className="field-label">Підтвердіть пароль</span><span className="relative block"><input className="text-input pr-10" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={form.confirm} onChange={(e) => update('confirm', e.target.value)} placeholder="Повторіть пароль" />{form.confirm && form.confirm === form.password && <Check size={17} className="absolute right-3 top-3 text-emerald-500" />}</span></label>}
              {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">{error}</div>}
              <button type="submit" className="primary-btn mt-2 w-full py-3" disabled={loading}>{loading ? <Spinner label={mode === 'login' ? 'Вхід…' : 'Створення акаунта…'} className="text-white" /> : <>{mode === 'login' ? 'Увійти до Miston' : 'Створити акаунт'}<ArrowRight size={17} /></>}</button>
            </form>
            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400"><LockKeyhole size={13} /> Ваша сесія безпечно зберігається на цьому пристрої</div>
            <nav className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 border-t pt-5 text-xs dark:border-slate-800" aria-label="Сторінки проєкту">
              {INFO_LINKS.map((link) => (
                <a key={link.route} href={infoHref(link.route)} className="flex items-center gap-1.5 text-slate-500 transition hover:text-accent-600 dark:text-slate-400 dark:hover:text-accent-400">
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
