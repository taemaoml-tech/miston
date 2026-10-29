import { Hash, Search, UserPlus } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMessenger } from '../../contexts/MessengerContext';
import { useUserSearch } from '../../hooks/useUserSearch';
import { errorMessage } from '../../utils/format';
import { Avatar } from '../common/Avatar';
import { Modal } from '../common/Modal';
import { Spinner } from '../common/Spinner';

export function CreateServerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createServer } = useMessenger();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await createServer(name.trim()); setName(''); onClose(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  return <Modal open={open} onClose={onClose} title="Створити сервер" description="Спільний простір із каналами для вашої спільноти"><form onSubmit={submit}><label className="block"><span className="field-label">Назва сервера</span><input autoFocus required maxLength={80} className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Дизайн-колектив" /></label>{error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}<div className="mt-6 flex justify-end gap-2"><button type="button" className="secondary-btn" onClick={onClose}>Скасувати</button><button className="primary-btn" disabled={busy || !name.trim()}>{busy ? 'Створення…' : 'Створити сервер'}</button></div></form></Modal>;
}

export function CreateChannelModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createChannel, activeServer } = useMessenger();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await createChannel(name.trim().toLowerCase().replace(/\s+/g, '-')); setName(''); onClose(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  return <Modal open={open} onClose={onClose} title="Створити канал" description={`Додайте новий простір до ${activeServer?.name || 'цього сервера'}`}><form onSubmit={submit}><label className="block"><span className="field-label">Назва каналу</span><div className="relative"><Hash size={17} className="absolute left-3.5 top-3 text-slate-400" /><input autoFocus required maxLength={60} pattern="[a-zA-Z0-9_- ]+" className="text-input pl-10" value={name} onChange={(event) => setName(event.target.value)} placeholder="general" /></div><p className="mt-2 text-xs text-slate-400">Літери, цифри, пробіли, дефіси й підкреслення.</p></label>{error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}<div className="mt-6 flex justify-end gap-2"><button type="button" className="secondary-btn" onClick={onClose}>Скасувати</button><button className="primary-btn" disabled={busy || !name.trim()}>{busy ? 'Створення…' : 'Створити канал'}</button></div></form></Modal>;
}

export function AddMemberModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addServerMember, activeServer } = useMessenger();
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  const { users, loading, error: searchError } = useUserSearch(query, open);
  const existing = new Set(activeServer?.members.map((member) => member.id));
  async function add(userId: string) {
    setBusyId(userId); setError('');
    try { await addServerMember(userId); setAdded((current) => [...current, userId]); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusyId(''); }
  }
  return <Modal open={open} onClose={onClose} title="Запросити учасників" description={`Додайте людей до ${activeServer?.name || 'вашого сервера'}`}><label className="relative block"><Search size={17} className="absolute left-3.5 top-3 text-slate-400" /><input autoFocus className="text-input pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Пошук людей" /></label><div className="mt-4 min-h-48">{loading ? <Spinner label="Пошук…" className="py-12" /> : query.trim().length < 2 ? <p className="py-12 text-center text-sm text-slate-400">Знайдіть людину за іменем або ніком.</p> : users.length === 0 ? <p className="py-12 text-center text-sm text-slate-500">Нікого не знайдено.</p> : <ul className="space-y-1">{users.map((user) => { const member = existing.has(user.id) || added.includes(user.id); return <li key={user.id} className="flex items-center gap-3 rounded-xl p-2"><Avatar name={user.displayName} src={user.avatarUrl} online={user.online} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{user.displayName}</p><p className="truncate text-xs text-slate-500">@{user.username}</p></div><button type="button" className="secondary-btn min-h-9 px-3 py-1.5 text-xs" disabled={member || busyId === user.id} onClick={() => void add(user.id)}>{busyId === user.id ? 'Додавання…' : member ? 'Учасник' : <><UserPlus size={14} /> Додати</>}</button></li>; })}</ul>}</div>{(error || searchError) && <p role="alert" className="mt-3 text-sm text-rose-600">{error || searchError}</p>}</Modal>;
}
