import { Sparkles, Users } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { FeedTheme } from '../../types/feed';
import { MistonMascot } from './MistonMascot';

export function ThemeCard({ theme, onAnswer }: { theme: FeedTheme; onAnswer: (answer: string) => Promise<void> }) {
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = answer.trim();
    if (!value || busy) return;
    setBusy(true);
    setError('');
    try {
      await onAnswer(value);
      setAnswer('');
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не вдалося зберегти відповідь.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="feed-card feed-card--theme rounded-3xl border p-4 sm:p-5" aria-labelledby="feed-theme-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-100 text-accent-700 dark:bg-accent-950/60 dark:text-accent-300"><Sparkles size={15} /></span>
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent-700 dark:text-accent-300">Тема дня</span>
          </div>
          <h2 id="feed-theme-title" className="text-base font-bold leading-snug sm:text-lg">{theme.question}</h2>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ios-secondary"><Users size={13} /> {theme.participants} {theme.participants === 1 ? 'людина вже відповіла' : 'людей уже відповіли'}</p>
        </div>
        <MistonMascot hint={theme.hint} />
      </div>

      {theme.answer && !editing ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-ios-fill/10 px-3.5 py-3">
          <p className="min-w-0 flex-1 text-sm"><span className="mr-1.5 text-accent-600 dark:text-accent-400">✦</span>{theme.answer}</p>
          <button type="button" className="text-xs font-semibold text-ios-blue hover:underline" onClick={() => { setAnswer(theme.answer ?? ''); setEditing(true); }}>Змінити</button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            className="text-input min-w-0 flex-1"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            maxLength={280}
            placeholder="Ваша коротка відповідь…"
            aria-label="Відповідь на тему дня"
          />
          <button type="submit" className="primary-btn shrink-0" disabled={busy || !answer.trim()}>{busy ? 'Зберігаємо…' : 'Відповісти'}</button>
          {editing && <button type="button" className="secondary-btn shrink-0" onClick={() => { setEditing(false); setAnswer(''); }}>Скасувати</button>}
        </form>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </section>
  );
}
