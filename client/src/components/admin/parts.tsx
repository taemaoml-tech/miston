import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

export function AdminNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
      <span className="flex min-w-0 items-center gap-2"><AlertCircle size={16} className="shrink-0" /><span className="truncate">{message}</span></span>
      {onRetry && <button type="button" onClick={onRetry} className="shrink-0 font-semibold underline">Повторити</button>}
    </div>
  );
}

export function AdminEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-slate-400">
      <Inbox size={22} />
      <p>{children}</p>
    </div>
  );
}

export function AdminSectionTitle({ title, hint, actions }: { title: string; hint?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h3 className="text-base font-semibold">{title}</h3>
        {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function AdminRefreshButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="icon-btn border" onClick={onClick} disabled={disabled} aria-label="Оновити розділ">
      <RefreshCw size={16} />
    </button>
  );
}

export function AdminPager({ total, limit, offset, onPage }: { total: number; limit: number; offset: number; onPage: (offset: number) => void }) {
  const lastPage = Math.max(0, Math.ceil(total / limit) - 1);
  const page = Math.min(lastPage, Math.floor(offset / limit));
  if (total <= limit) return <p className="mt-3 text-xs text-slate-400">Усього записів: {total}</p>;
  return (
    <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
      <span>Сторінка {page + 1} з {lastPage + 1} · усього {total}</span>
      <span className="flex gap-2">
        <button type="button" className="secondary-btn px-3 py-1.5 text-xs" disabled={page === 0} onClick={() => onPage(Math.max(0, (page - 1) * limit))}>Назад</button>
        <button type="button" className="secondary-btn px-3 py-1.5 text-xs" disabled={page >= lastPage} onClick={() => onPage((page + 1) * limit)}>Далі</button>
      </span>
    </div>
  );
}

export function AdminChip({ tone, children }: { tone: 'neutral' | 'green' | 'red' | 'blue' | 'amber'; children: ReactNode }) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
    red: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300',
    blue: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}
