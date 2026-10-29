import { Search, UserRound, Users, X } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useMessenger } from '../../contexts/MessengerContext';
import { useUserSearch } from '../../hooks/useUserSearch';
import { errorMessage } from '../../utils/format';
import { Avatar } from '../common/Avatar';
import { Modal } from '../common/Modal';
import { Spinner } from '../common/Spinner';

export function NewChatModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createDirect, createGroup } = useMessenger();
  const { user: currentUser } = useAuth();
  const [tab, setTab] = useState<'direct' | 'group'>('direct');
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { users: searchResults, loading, error: searchError } = useUserSearch(query, open);
  const users = searchResults.filter((candidate) => candidate.id !== currentUser?.id);

  const toggleSelected = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const close = () => { setQuery(''); setSelected([]); setTitle(''); setError(''); onClose(); };

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true); setError('');
    try {
      if (tab === 'group') await createGroup(title.trim(), selected);
      close();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  async function direct(userId: string) {
    setBusy(true); setError('');
    try { await createDirect(userId); close(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={close} title="Нова розмова" description="Знайдіть людей або зберіть групу">
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'direct'} onClick={() => setTab('direct')} className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold ${tab === 'direct' ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-500'}`}><UserRound size={16} /> Особиста</button>
        <button type="button" role="tab" aria-selected={tab === 'group'} onClick={() => setTab('group')} className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold ${tab === 'group' ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-500'}`}><Users size={16} /> Група</button>
      </div>
      <form onSubmit={submit}>
        {tab === 'group' && <label className="mb-4 block"><span className="field-label">Назва групи</span><input required={tab === 'group'} maxLength={80} className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Плани на вихідні" /></label>}
        <label className="relative block"><Search size={17} className="absolute left-3.5 top-3 text-slate-400" /><input className="text-input pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Пошук за іменем або ніком" aria-label="Пошук користувачів" /></label>
        {tab === 'group' && selected.length > 0 && <p className="mt-3 text-xs font-medium text-accent-600 dark:text-accent-400">Вибрано: {selected.length}</p>}
        <div className="mt-4 min-h-44">
          {loading ? <Spinner label="Пошук людей…" className="py-12" /> : query.trim().length < 2 ? (
            <div className="flex flex-col items-center py-10 text-center text-slate-400"><Search size={28} className="mb-3 opacity-50" /><p className="text-sm">Введіть щонайменше 2 символи, щоб знайти людей.</p></div>
          ) : users.length === 0 ? <p className="py-12 text-center text-sm text-slate-500">Нікого не знайдено за «{query}».</p> : (
            <ul className="space-y-1">
              {users.map((user) => {
                const isSelected = selected.includes(user.id);
                return <li key={user.id}><button type={tab === 'direct' ? 'button' : 'button'} disabled={busy} onClick={() => tab === 'direct' ? void direct(user.id) : toggleSelected(user.id)} className={`flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800 ${isSelected ? 'bg-accent-50 dark:bg-accent-500/10' : ''}`}><Avatar name={user.displayName} src={user.avatarUrl} online={user.online} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{user.displayName}</span><span className="block truncate text-xs text-slate-500">@{user.username}</span></span>{tab === 'group' && <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${isSelected ? 'border-accent-600 bg-accent-600 text-white' : 'border-slate-300'}`}>{isSelected && <span className="text-xs">✓</span>}</span>}</button></li>;
              })}
            </ul>
          )}
        </div>
        {(error || searchError) && <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error || searchError}</p>}
        {tab === 'group' && <div className="mt-5 flex justify-end gap-2 border-t pt-4"><button type="button" className="secondary-btn" onClick={close}><X size={16} /> Скасувати</button><button type="submit" className="primary-btn" disabled={busy || selected.length === 0 || !title.trim()}>{busy ? 'Створення…' : 'Створити групу'}</button></div>}
      </form>
    </Modal>
  );
}
