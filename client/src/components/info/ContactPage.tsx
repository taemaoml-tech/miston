import { CheckCircle2, Flag, Mail, Send, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { api } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import type { SupportTopic } from '../../types/models';
import { errorMessage } from '../../utils/format';
import { SUPPORT_TOPIC_LABELS } from '../../utils/moderation';
import { Spinner } from '../common/Spinner';
import { InfoHeading, InfoShell } from './InfoShell';
import { infoHref } from '../../router/infoRoute';

const TOPICS = Object.keys(SUPPORT_TOPIC_LABELS) as SupportTopic[];

export function ContactPage({ variant }: { variant: 'public' | 'overlay' }) {
  const { user } = useAuth();
  const [topic, setTopic] = useState<SupportTopic>('technical');
  const [message, setMessage] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [ticket, setTicket] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (message.trim().length < 10) {
      setError('Опишіть звернення щонайменше 10 символів — так ми швидше зрозуміємо ситуацію.');
      return;
    }
    setSending(true);
    try {
      const result = await api.support.create({
        topic,
        message: message.trim(),
        ...(contactEmail.trim() && !user ? { contactEmail: contactEmail.trim() } : {}),
      });
      setTicket(result.request.id);
      setMessage('');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSending(false);
    }
  }

  return (
    <InfoShell route="contact" variant={variant}>
      <InfoHeading
        eyebrow="Зв’язатися з адміністрацією"
        title="Напишіть нам — звернення читають модератори та власник"
        lead="Кожне звернення потрапляє в чергу підтримки зі статусом «Нова», «В роботі» чи «Закрита». Зміст і відповідь зберігаються в історії, а дії адміністрації записуються у журнал."
      />

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <section className="page-section rounded-3xl border border-slate-200 bg-white p-6 shadow-soft dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          {ticket ? (
            <div className="flex h-full flex-col items-start justify-center gap-4">
              <CheckCircle2 size={40} className="text-emerald-500" />
              <div>
                <h2 className="text-xl font-bold">Звернення надіслано</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                  Номер звернення: <span className="font-semibold text-slate-900 dark:text-white">#{ticket}</span>.
                  {user
                    ? 'Статус і відповідь адміністрації видно в розділі «Підтримка» — у списку «Мої звернення».'
                    : contactEmail ? `Ми відповімо на ${contactEmail.trim()}.` : 'Статус бачите лише в акаунті, тому вказуйте пошту.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" className="secondary-btn px-4 py-2.5 text-sm" onClick={() => setTicket(null)}>Написати ще</button>
                {user && <a href={infoHref('support')} className="primary-btn px-4 py-2.5 text-sm">Мої звернення</a>}
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div>
                <label className="field-label" htmlFor="support-topic">Тема звернення</label>
                <select id="support-topic" className="text-input" value={topic} onChange={(event) => setTopic(event.target.value as SupportTopic)}>
                  {TOPICS.map((value) => <option key={value} value={value}>{SUPPORT_TOPIC_LABELS[value]}</option>)}
                </select>
              </div>

              <div>
                <label className="field-label" htmlFor="support-message">Що сталося?</label>
                <textarea
                  id="support-message"
                  className="text-input min-h-40 resize-y leading-6"
                  required
                  minLength={10}
                  maxLength={2000}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Опишіть ситуацію, коли вона почалася, пристрій і браузер, ім’я користувача, якщо мова про акаунт."
                />
                <p className="mt-1.5 text-xs text-slate-400">{message.trim().length} / 2000</p>
              </div>

              {!user && (
                <div>
                  <label className="field-label" htmlFor="support-email">Ваша електронна пошта</label>
                  <span className="relative block">
                    <Mail size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
                    <input id="support-email" className="text-input pl-10" type="email" required maxLength={254} autoComplete="email"
                      value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder="you@example.com" />
                  </span>
                  <p className="mt-1.5 text-xs text-slate-400">Гостям пошта обов’язкова — інакше ми не зможемо відповісти.</p>
                </div>
              )}

              {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">{error}</div>}

              <button type="submit" className="primary-btn w-full py-3" disabled={sending}>
                {sending ? <Spinner label="Надсилання…" className="text-white" /> : <><Send size={17} /> Надіслати звернення</>}
              </button>
              <p className="text-xs leading-5 text-slate-400">
                Надсилаючи форму, ви погоджуєтесь, що адміністрація може зберігати текст звернення та відповіді для опрацювання. Докладніше — у <a className="underline" href={infoHref('privacy')}>Політиці конфіденційності</a>.
              </p>
            </form>
          )}
        </section>

        <div className="space-y-4">
          <SideCard title="Швидше, якщо…">
            <ul className="space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              <li>Позначте, чи проблема в акаунті, чаті, дзвінку, Star чи модерації.</li>
              <li>Додайте час, пристрій і браузер — це допомагає знайти причину.</li>
              <li>Не вставляйте пароль чи код підтвердження в текст звернення.</li>
            </ul>
          </SideCard>

          <SideCard title="Скарга на людину або повідомлення">
            <div className="flex items-start gap-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              <Flag size={18} className="mt-0.5 shrink-0 text-rose-500" />
              <p>
                Для реакції на порушення правил швидше скористатися скаргою з чату: меню повідомлення або профілю людини → «Скаржитися». Скаргу бачить модерація, а ви стежите за статусом у своєму профілі.
              </p>
            </div>
            {!user && <p className="mt-3 text-xs text-slate-400">Гостям потрібно створити акаунт, щоб подати скаргу на учасника розмови.</p>}
          </SideCard>

          <SideCard title="Що далі">
            <div className="flex items-start gap-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              <ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-500" />
              <p>Відповідь адміністрації з’явиться у списку «Мої звернення» в розділі «Підтримка». Статус «Закрита» означає, що рішення ухвалено — його можна оскаржити новим зверненням.</p>
            </div>
          </SideCard>
        </div>
      </div>
    </InfoShell>
  );
}

function SideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
