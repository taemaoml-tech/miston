import { ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import type { ModerationUser, UserRole } from '../../types/models';
import { errorMessage, formatDateTime } from '../../utils/format';
import { ROLE_LABELS } from '../../utils/moderation';
import { Avatar } from '../common/Avatar';
import { Spinner } from '../common/Spinner';
import { AdminChip, AdminEmpty, AdminNotice, AdminRefreshButton, AdminSectionTitle } from './parts';

const emptyForm = { email: '', username: '', displayName: '', password: '' };

export function StaffSection({ me, onChanged }: { me: { id: string; role: UserRole }; onChanged: () => void }) {
  const [staff, setStaff] = useState<ModerationUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [moderators, owners] = await Promise.all([
        api.admin.users({ role: 'moderator', limit: 100 }),
        api.admin.users({ role: 'owner', limit: 100 }),
      ]);
      setStaff([...owners.users, ...moderators.users]);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    setError('');
    try {
      await action();
      await load();
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId('');
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError('');
    setNotice('');
    try {
      const result = await api.admin.createStaff({ ...form, password: form.password });
      setNotice(`Створено модератора @${result.user.username}.`);
      setForm(emptyForm);
      await load();
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <AdminSectionTitle
        title="Персонал"
        hint="Модераторів створює лише власник. Жоден модератор не може видати роль власника."
        actions={<AdminRefreshButton onClick={() => void load()} disabled={loading} />}
      />
      {error && <AdminNotice message={error} onRetry={() => void load()} />}
      {notice && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{notice}</p>}

      {loading ? <Spinner label="Завантаження персоналу…" className="py-16" /> : (
        <ul className="mb-6 space-y-2">
          {staff.map((member) => (
            <li key={member.id} className="flex flex-wrap items-center gap-3 rounded-2xl border p-3">
              <Avatar name={member.displayName} src={member.avatarUrl} size="sm" online={member.online} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate font-medium">{member.displayName}<AdminChip tone={member.role === 'owner' ? 'blue' : 'neutral'}>{ROLE_LABELS[member.role]}</AdminChip>{member.id === me.id && <span className="text-[10px] text-slate-400">це ви</span>}</p>
                <p className="truncate text-xs text-slate-400">@{member.username} · з {formatDateTime(member.createdAt)}</p>
              </div>
              {member.blockedAt && <AdminChip tone="red">заблоковано</AdminChip>}
              {member.role === 'moderator' && member.id !== me.id && (
                <div className="flex gap-1.5">
                  <button type="button" className="secondary-btn px-3 py-1.5 text-xs" disabled={busyId === member.id} onClick={() => void run(member.id, () => api.admin.setRole(member.id, 'user'))}>Зняти модератора</button>
                  {me.role === 'owner' && <button type="button" className="icon-btn border text-rose-600" title="Видалити акаунт" aria-label={`Видалити ${member.displayName}`} disabled={busyId === member.id} onClick={() => { if (window.confirm(`Видалити акаунт модератора @${member.username}?`)) void run(member.id, () => api.admin.removeUser(member.id)); }}><Trash2 size={15} /></button>}
                </div>
              )}
            </li>
          ))}
          {!staff.length && <AdminEmpty>Персоналу ще немає.</AdminEmpty>}
        </ul>
      )}

      {me.role === 'owner' && (
        <form onSubmit={(event) => void create(event)} className="rounded-2xl border p-4">
          <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={16} className="text-accent-600" /> Новий модератор</h4>
          <p className="mb-4 text-xs text-slate-400">Акаунт створюється одразу з роллю «Модератор» — підвищити когось до власника неможливо.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="field-label">Пошта</span><input className="text-input" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
            <label className="block"><span className="field-label">Username</span><input className="text-input" required pattern="[A-Za-z0-9_]{3,30}" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label>
            <label className="block"><span className="field-label">Відображаване імʼя</span><input className="text-input" required value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label>
            <label className="block"><span className="field-label">Пароль</span><input className="text-input" type="password" required minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
          </div>
          <button type="submit" className="primary-btn mt-4" disabled={creating}><UserPlus size={16} />Створити модератора</button>
        </form>
      )}
    </div>
  );
}
