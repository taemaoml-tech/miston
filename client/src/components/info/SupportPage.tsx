import { CircleHelp, LifeBuoy, MessagesSquare, ShieldAlert, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import type { SupportRequest } from '../../types/models';
import { errorMessage, formatDateTime } from '../../utils/format';
import { COMPLAINT_STATUS_LABELS, SUPPORT_TOPIC_LABELS } from '../../utils/moderation';
import { Spinner } from '../common/Spinner';
import { InfoHeading, InfoSection, InfoShell } from './InfoShell';
import { infoHref } from '../../router/infoRoute';

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Як скинути пароль, якщо немає доступу до пошти?',
    a: 'Зараз автовідновлення за поштою не підключене. Напишіть адміністрації через форму звернень: вкажіть ім’я користувача, пошту акаунта та контекст. Після підтвердження особи пароль скинуть вручну.',
  },
  {
    q: 'Повідомлення не надсилаються або чат «завис»',
    a: 'Переврте з’єднання та оновіть сторінку — клієнт перемикається на нове з’єднання автоматично. Якщо проблема залишилась, опишіть у зверненні пристрій, браузер і час, коли це почалося.',
  },
  {
    q: 'Не працює камера, мікрофон чи дзвінок',
    a: 'Дозвольте доступ до пристроїв у налаштуваннях сайті браузера та закрийте вкладки, які вже використовують камеру. Для відеодзвінків потрібне безпечне HTTPS-з’єднання.',
  },
  {
    q: 'Хтось погрожує, поширює спам або видає себе за мене',
    a: 'Скористайтеся скаргою з чату: меню повідомлення або профілю людини → «Скаржитися». Скаразу подано, модератор бере її в роботу, а статус ви бачите у власному списку скарг.',
  },
  {
    q: 'Як видалити чат і старі повідомлення?',
    a: 'У меню розмови є «Очистити історію» та «Видалити чат». Очистення для всіх доступне у власних чатах і для керуючих груп; гру можна покинути, а власник — видалити повністю.',
  },
  {
    q: 'Що не так з Star, покупкою або косметикою?',
    a: 'Опишіть у зверненні назву товару, час покупки і поточний баланс. Нарахування та списання Star адміністрація робить лише з записом у журнал і історію балансу.',
  },
  {
    q: 'Мій акаунт заблоковано. Що робити?',
    a: 'У зверненні вкажіть ім’я користувача та пошту й поясніть ситуацію. Адміністрація перевіряє журнал дій і може зняти блокування, якщо рішення було помилковим.',
  },
];

export function SupportPage({ variant }: { variant: 'public' | 'overlay' }) {
  const { user } = useAuth();
  const [items, setItems] = useState<SupportRequest[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    let active = true;
    api.support.mine(10)
      .then((result) => { if (active) setItems(result.items); })
      .catch((cause) => { if (active) setError(errorMessage(cause)); });
    return () => { active = false; };
  }, [user]);

  return (
    <InfoShell route="support" variant={variant}>
      <InfoHeading
        eyebrow="Підтримка"
        title="Допомога по Miston"
        lead="Нижче — типові ситуації та рішення. Якщо потрібна саме ваша історія, напишіть адміністрації: звернення бачать модератори та власник і відповідають на вказану пошту."
      />

      <InfoSection delay={40}>
        <div className="flex flex-col items-start justify-between gap-4 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 p-6 text-white sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <LifeBuoy size={26} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-lg font-semibold">Не знайшли відповідь?</p>
              <p className="mt-1 text-sm text-indigo-100">Опишіть проблему у зверненні — адміністрація відповіде на пошту, яку ви вкажете.</p>
            </div>
          </div>
          <a href={infoHref('contact')} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-accent-700 transition hover:bg-indigo-50">
            <MessagesSquare size={17} /> Написати адміністрації
          </a>
        </div>
      </InfoSection>

      {user && (
        <InfoSection title="Мої звернення" delay={100}>
          {error && <p className="mb-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
          {!items ? <Spinner label="Завантаження звернень…" className="py-8" /> : items.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Ви ще не писали адміністрації. Перше звернення можна надіслати кнопкою вище.</p>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded-full px-2.5 py-1 font-semibold ${item.status === 'closed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : item.status === 'in_progress' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' : 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300'}`}>
                      {COMPLAINT_STATUS_LABELS[item.status]}
                    </span>
                    <span className="font-medium text-slate-500 dark:text-slate-400">{SUPPORT_TOPIC_LABELS[item.topic]}</span>
                    <span className="text-slate-400">{formatDateTime(item.createdAt)}</span>
                  </div>
                  <p className="mt-2.5 text-sm leading-6 text-slate-700 dark:text-slate-200">{item.message}</p>
                  {item.resolution && <p className="mt-2 border-l-2 border-accent-500 pl-3 text-sm text-slate-600 dark:text-slate-400">Відповідь: {item.resolution}</p>}
                </li>
              ))}
            </ul>
          )}
        </InfoSection>
      )}

      <InfoSection title="Часті запитання" delay={160}>
        <div className="space-y-2.5">
          {FAQ.map((entry) => (
            <details key={entry.q} className="group rounded-2xl border border-slate-200 px-4 py-3 open:bg-slate-50 dark:border-slate-800 dark:open:bg-slate-800/40">
              <summary className="flex cursor-pointer list-none items-center gap-2.5 text-sm font-semibold marker:hidden">
                <CircleHelp size={17} className="text-accent-500" />
                <span>{entry.q}</span>
              </summary>
              <p className="mt-2.5 pl-7 text-sm leading-6 text-slate-600 dark:text-slate-400">{entry.a}</p>
            </details>
          ))}
        </div>
      </InfoSection>

      <InfoSection title="Швидкі посилання" delay={220}>
        <div className="grid gap-3 sm:grid-cols-3">
          <a href={infoHref('rules')} className="rounded-2xl border border-slate-200 p-4 transition hover:border-accent-300 dark:border-slate-800">
            <ShieldAlert size={20} className="text-accent-600 dark:text-accent-400" />
            <p className="mt-2 text-sm font-semibold">Правила спільноти</p>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Що дозволено й за що блокують.</p>
          </a>
          <a href={infoHref('privacy')} className="rounded-2xl border border-slate-200 p-4 transition hover:border-accent-300 dark:border-slate-800">
            <Sparkles size={20} className="text-accent-600 dark:text-accent-400" />
            <p className="mt-2 text-sm font-semibold">Конфіденційність</p>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Які дані зберігаються і навіщо.</p>
          </a>
          <a href="#/" className="rounded-2xl border border-slate-200 p-4 transition hover:border-accent-300 dark:border-slate-800">
            <MessagesSquare size={20} className="text-accent-600 dark:text-accent-400" />
            <p className="mt-2 text-sm font-semibold">{user ? 'Повернутися до чатів' : 'Увійти в Miston'}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{user ? 'Скаргу можна подати просто з розмови.' : 'Створіть акаунт і почніть розмову.'}</p>
          </a>
        </div>
      </InfoSection>
    </InfoShell>
  );
}
