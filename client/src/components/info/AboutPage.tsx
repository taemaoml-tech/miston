import { BadgeCheck, Coins, LockKeyhole, MessageCircle, Mic, Sticker, Users, Video, Waypoints } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { infoHref } from '../../router/infoRoute';
import { SLOGAN } from '../common/Splash';
import { InfoList, InfoSection, InfoShell } from './InfoShell';
import type { InfoRoute } from '../../router/infoRoute';

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: MessageCircle, title: 'Розмови в реальному часі', text: 'Миттєві повідомлення, реакції, відповіді, пересилання, згадки, закріплені дошки та редагування текстів.' },
  { icon: Users, title: 'Групи й канали', text: 'Спільні чати з правами учасників, сервери з каналами для тем і сповіщенням про нове.' },
  { icon: Video, title: 'Дзвінки й демонстрація екрана', text: 'Аудіо- та відеодзвінки на WebRTC з перемиканням камеры та показом вікна.' },
  { icon: Mic, title: 'Відеокружечки', text: 'Короткі відеоповідомлення-«кружечки», як у Telegram: запис у один дотик.' },
  { icon: Sticker, title: 'Стікери та емодзі', text: 'Каталог стікерів за категоріями, власні набори, улюблені та панель емодзі.' },
  { icon: Coins, title: 'Магазин Star', text: 'Внутрішня валюта, косметика для профілю та чатів, щоденні нагороди та досягнення.' },
  { icon: BadgeCheck, title: 'Прозорі ролі', text: 'USER, MODERATOR і OWNER із чіткою матрицею прав, верифікованими акаунтами та журналом дій.' },
  { icon: LockKeyhole, title: 'Безпека акаунта', text: 'Сесії з короткоживучими токенами, блокування акаунтів, скарги та опрацювання звернень.' },
];

const PRINCIPLES: string[] = [
  'Miston будується як відкритий простір для спілкування: без прихованих механік і темних патернів.',
  'Усі дії адміністрації записуються у журнал, який бачить власник проєкту, а рішення можна оскаржити.',
  'Користувач керує своїми даними: історію чату можна очистити для себе або для всіх учасників.',
  'Розробка рухается по фазах, і кожна нова можливість проходить перевірку перед публічним запуском.',
];

export function AboutPage({ variant }: { variant: 'public' | 'overlay' }) {
  return (
    <InfoShell route="about" variant={variant}>
      <div className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-gradient-to-br from-indigo-50 via-white to-violet-100 p-8 dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 sm:p-12">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent-400/25 blur-3xl" />
        <p className="relative text-xs font-semibold uppercase tracking-[.18em] text-accent-700 dark:text-accent-300">Ласкаво просимо</p>
        <h1 className="relative mt-3 max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">{SLOGAN}</h1>
        <p className="relative mt-5 max-w-2xl text-lg leading-8 text-slate-600 dark:text-slate-300">
          Місце, де друзі, команди та спільноти говорять без зайвого: чисті чати, дзвінки, групи, канали, стікери та гнучка система прав.
        </p>
        <div className="relative mt-8 flex flex-wrap gap-3">
          {([
            { route: 'rules', label: 'Правила спільноти' },
            { route: 'privacy', label: 'Конфіденційність' },
            { route: 'support', label: 'Підтримка' },
          ] as { route: InfoRoute; label: string }[]).map((item) => (
            <a key={item.route} href={infoHref(item.route)} className="secondary-btn px-4 py-2.5 text-sm">{item.label}</a>
          ))}
        </div>
      </div>

      <InfoSection title="Що вміє Miston" delay={60}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 transition hover:border-accent-300 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-accent-500/50">
              <feature.icon size={22} className="text-accent-600 dark:text-accent-400" />
              <h3 className="mt-3 text-base font-semibold">{feature.title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-slate-600 dark:text-slate-400">{feature.text}</p>
            </article>
          ))}
        </div>
      </InfoSection>

      <InfoSection title="Як ми ставимося до спільноти" delay={120}>
        <InfoList items={PRINCIPLES} />
      </InfoSection>

      <InfoSection title="Технології" delay={180}>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          {[
            ['Клієнт', 'React 19, TypeScript, Vite, Tailwind CSS'],
            ['Реальний час', 'Socket.io, WebRTC, MediaRecorder'],
            ['Сервер', 'Node.js, Express, Zod, JWT'],
            ['Дані', 'PostgreSQL з міграціями та журналом дій'],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
              <span className="font-medium">{value}</span>
            </div>
          ))}
        </div>
        <p className="mt-6 flex items-start gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Waypoints size={17} className="mt-0.5 shrink-0 text-accent-500" />
          Наступні кроки: двофакторна автентифікація, встановлення як додатка, боти та наскрізне шифрування.
        </p>
      </InfoSection>

      <InfoSection delay={240}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-lg font-semibold">Готові до розмови?</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Створіть акаунт — і перший чат зачекає на вас. Питання щодо спільноти завжди можна спрямувати в <a className="underline" href={infoHref('contact')}>підтримку адміністрації</a>.</p>
          </div>
          <a href="#/" className="primary-btn px-5 py-2.5 text-sm">Увійти чи зареєструватися</a>
        </div>
      </InfoSection>
    </InfoShell>
  );
}
