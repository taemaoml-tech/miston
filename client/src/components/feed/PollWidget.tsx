import { BarChart3 } from 'lucide-react';
import { useState } from 'react';
import type { FeedPoll } from '../../types/feed';

export function PollWidget({ poll, onVote }: { poll: FeedPoll; onVote: (index: number) => Promise<void> }) {
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [error, setError] = useState('');
  const voted = poll.myVote !== null;

  async function vote(index: number) {
    if (busyIndex !== null) return;
    setBusyIndex(index);
    setError('');
    try { await onVote(index); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не вдалося зберегти голос.'); }
    finally { setBusyIndex(null); }
  }

  return (
    <div className="mt-3 rounded-2xl border border-ios-separator/10 bg-ios-fill/[0.06] p-3.5" role="group" aria-label={`Опитування: ${poll.question}`}>
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><BarChart3 size={15} className="text-ios-blue" /> {poll.question}</p>
      <div className="space-y-2">
        {poll.options.map((option) => {
          const percent = poll.totalVotes > 0 ? Math.round((option.votes / poll.totalVotes) * 100) : 0;
          const mine = poll.myVote === option.index;
          return (
            <button
              type="button"
              key={option.index}
              onClick={() => void vote(option.index)}
              disabled={busyIndex !== null}
              aria-pressed={mine}
              className={`relative block w-full overflow-hidden rounded-xl border px-3 py-2.5 text-left text-sm transition disabled:opacity-70 ${mine ? 'border-ios-blue bg-ios-blue/10 font-semibold text-ios-blue' : 'border-ios-separator/12 bg-ios-bg/70 hover:border-ios-blue/40'}`}
            >
              {voted && <span className="feed-poll-track absolute inset-x-0 bottom-0 h-1" aria-hidden="true"><span className="feed-poll-fill" style={{ width: `${percent}%`, backgroundColor: mine ? 'rgb(var(--ios-blue))' : 'rgb(var(--accent-400))' }} /></span>}
              <span className="relative flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">{option.label}</span>
                {voted && <span className="shrink-0 text-xs font-semibold text-ios-secondary">{percent}%</span>}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2.5 text-[11px] text-ios-secondary">
        {poll.totalVotes} {poll.totalVotes === 1 ? 'голос' : 'голосів'} · {voted ? 'торкніться, щоб змінити голос' : 'оберіть варіант'}
      </p>
      {error && <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
