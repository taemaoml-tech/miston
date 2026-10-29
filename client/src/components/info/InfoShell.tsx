import { ArrowLeft, Menu, Moon, Sun, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { goHome, INFO_ROUTES, infoHref, openInfo } from '../../router/infoRoute';
import type { InfoRoute } from '../../router/infoRoute';
import { Mark } from '../common/Logo';
import { SLOGAN } from '../common/Splash';

export const INFO_TITLES: Record<InfoRoute, string> = {
  about: 'Про Miston',
  rules: 'Правила',
  privacy: 'Політика конфіденційності',
  support: 'Підтримка',
  contact: 'Зв’язатися з адміністрацією',
};

interface InfoShellProps {
  route: InfoRoute;
  /** 'public' — сторінка для гостя, 'overlay' — шар над відкритим месенджером, щоб не втрачати його стан. */
  variant: 'public' | 'overlay';
  children: ReactNode;
}

export function InfoShell({ route, variant, children }: InfoShellProps) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
    document.title = `${INFO_TITLES[route]} · Miston`;
    document.getElementById('info-scroll')?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
    return () => { document.title = 'Miston'; };
  }, [route]);

  useEffect(() => {
    if (variant !== 'overlay') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') goHome();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [variant]);

  const leave = () => goHome();

  return (
    <div id="info-scroll" className={`${variant === 'overlay' ? 'fixed inset-0 z-[60]' : 'min-h-full'} overflow-y-auto bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100`}>
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <button type="button" onClick={() => openInfo('about')} className="flex items-center gap-2.5 rounded-xl" aria-label="Miston — на головну сторінку">
            <Mark size={32} className="rounded-[10px] shadow-glow" />
            <span className="hidden text-lg font-bold tracking-tight sm:block">Miston</span>
          </button>

          <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Розділи сайту">
            {INFO_ROUTES.map((item) => (
              <a key={item} href={infoHref(item)} aria-current={item === route ? 'page' : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${item === route ? 'bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'}`}>
                {INFO_TITLES[item]}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={toggleTheme} className="icon-btn" aria-label={`Увімкнути ${theme === 'dark' ? 'світлу' : 'темну'} тему`}>
              {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button type="button" onClick={leave} className="secondary-btn gap-2 px-3.5 py-2 text-sm">
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">{user ? 'Назад до чатів' : 'Увійти чи зареєструватися'}</span>
              <span className="sm:hidden">{user ? 'Чати' : 'Увійти'}</span>
            </button>
            <button type="button" onClick={() => setMenuOpen((value) => !value)} className="icon-btn lg:hidden" aria-label="Меню розділів" aria-expanded={menuOpen}>
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="border-t border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-950 lg:hidden" aria-label="Розділи сайту">
            {INFO_ROUTES.map((item) => (
              <a key={item} href={infoHref(item)} aria-current={item === route ? 'page' : undefined}
                className={`block rounded-lg px-3 py-2.5 text-sm font-medium ${item === route ? 'bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300' : 'text-slate-600 dark:text-slate-300'}`}>
                {INFO_TITLES[item]}
              </a>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">{children}</main>

      <footer className="mt-6 border-t border-slate-200 bg-white py-10 dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5"><Mark size={30} className="rounded-[9px]" /><span className="text-lg font-bold">Miston</span></div>
            <p className="mt-3 max-w-xs text-sm text-slate-500 dark:text-slate-400">{SLOGAN}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Проєкт</p>
            <ul className="mt-3 space-y-2 text-sm">
              {(['about', 'rules', 'privacy'] as const).map((item) => <li key={item}><a className="text-slate-500 hover:text-accent-600 dark:text-slate-400 dark:hover:text-accent-400" href={infoHref(item)}>{INFO_TITLES[item]}</a></li>)}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Допомога</p>
            <ul className="mt-3 space-y-2 text-sm">
              {(['support', 'contact'] as const).map((item) => <li key={item}><a className="text-slate-500 hover:text-accent-600 dark:text-slate-400 dark:hover:text-accent-400" href={infoHref(item)}>{INFO_TITLES[item]}</a></li>)}
            </ul>
          </div>
        </div>
        <p className="mx-auto mt-8 max-w-6xl px-4 text-xs text-slate-400 sm:px-6">© {new Date().getFullYear()} Miston. Створено для єднання.</p>
      </footer>
    </div>
  );
}

export function InfoHeading({ eyebrow, title, lead }: { eyebrow?: string; title: string; lead?: string }) {
  return (
    <div className="page-section max-w-3xl">
      {eyebrow && <p className="text-xs font-semibold uppercase tracking-[.14em] text-accent-600 dark:text-accent-400">{eyebrow}</p>}
      <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{title}</h1>
      {lead && <p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-400">{lead}</p>}
    </div>
  );
}

export function InfoSection({ title, children, delay = 0 }: { title?: string; children: ReactNode; delay?: number }) {
  return (
    <section className="page-section mt-10 rounded-3xl border border-slate-200 bg-white p-6 shadow-soft dark:border-slate-800 dark:bg-slate-900 sm:p-8" style={{ '--rise-delay': `${delay}ms` } as CSSProperties}>
      {title && <h2 className="text-xl font-bold tracking-tight">{title}</h2>}
      <div className={title ? 'mt-4' : ''}>{children}</div>
    </section>
  );
}

export function InfoList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2.5 text-sm leading-7 text-slate-600 dark:text-slate-300">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2.5">
          <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
