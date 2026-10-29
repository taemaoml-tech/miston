import {
  Coins, Flag, LayoutGrid, LifeBuoy, Lock, Megaphone, ScrollText, ShieldCheck, Users, UsersRound,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import type { AdminCapability, AdminOverview } from '../../types/models';
import { errorMessage } from '../../utils/format';
import { Modal } from '../common/Modal';
import { Spinner } from '../common/Spinner';
import { AdminNotice } from './parts';
import { AuditSection } from './AuditSection';
import { ComplaintsSection } from './ComplaintsSection';
import { NotificationsSection } from './NotificationsSection';
import { StaffSection } from './StaffSection';
import { SupportSection } from './SupportSection';
import { StarSection } from './StarSection';
import { UsersSection } from './UsersSection';

type SectionId = 'users' | 'complaints' | 'support' | 'verification' | 'star' | 'blocks' | 'audit' | 'staff' | 'notifications';

interface SectionDef {
  id: SectionId;
  label: string;
  icon: typeof Users;
  capability: AdminCapability;
}

const SECTIONS: SectionDef[] = [
  { id: 'users', label: 'Користувачі', icon: UsersRound, capability: 'user.view' },
  { id: 'complaints', label: 'Скарги', icon: Flag, capability: 'complaint.view' },
  { id: 'support', label: 'Підтримка', icon: LifeBuoy, capability: 'complaint.view' },
  { id: 'verification', label: 'Верифікація', icon: ShieldCheck, capability: 'user.verify' },
  { id: 'star', label: 'Star', icon: Coins, capability: 'star.manage' },
  { id: 'blocks', label: 'Блокування', icon: Lock, capability: 'user.block' },
  { id: 'audit', label: 'Журнал дій', icon: ScrollText, capability: 'audit.view' },
  { id: 'staff', label: 'Персонал', icon: Users, capability: 'staff.manage' },
  { id: 'notifications', label: 'Сповіщення', icon: Megaphone, capability: 'notification.send' },
];

export function AdminPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [section, setSection] = useState<SectionId>('users');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setOverview(await api.admin.overview());
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setSection('users');
    void load();
  }, [open, load]);

  const capabilities = overview?.capabilities ?? [];
  const visible = SECTIONS.filter((item) => capabilities.includes(item.capability));
  const active = visible.some((item) => item.id === section) ? section : visible[0]?.id ?? 'users';
  const me = { id: user?.id ?? '', role: overview?.role ?? user?.role ?? 'user' };

  return (
    <Modal open={open} onClose={onClose} full title="Адміністративна панель" description={overview ? `${overview.roleLabel} · керування спільнотою` : 'Розділи залежать від ваших прав'}>
      {error && <AdminNotice message={error} onRetry={() => void load()} />}
      {!overview && !error ? <Spinner label="Завантаження панелі…" className="py-20" /> : overview && (
        <div className="flex flex-col gap-5 lg:flex-row">
          <aside className="lg:w-52 lg:shrink-0">
            <div className="subtle-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
              {visible.map((item) => (
                <button key={item.id} type="button" onClick={() => setSection(item.id)} aria-current={active === item.id ? 'page' : undefined}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition lg:w-full ${active === item.id ? 'bg-accent-50 text-accent-700 dark:bg-accent-500/10 dark:text-accent-300' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}>
                  <item.icon size={16} />{item.label}
                </button>
              ))}
            </div>
            <div className="mt-5 hidden rounded-2xl border p-3 lg:block">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"><LayoutGrid size={13} /> Огляд</p>
              <dl className="space-y-1.5 text-xs">
                <Stat label="Користувачів" value={overview.stats.users.total} />
                <Stat label="Онлайн" value={overview.stats.users.online} />
                <Stat label="Заблоковано" value={overview.stats.users.blocked} />
                <Stat label="Верифіковано" value={overview.stats.users.verified} />
                <Stat label="Модераторів" value={overview.stats.users.moderators} />
                <Stat label="Скарги нові" value={overview.stats.moderation.complaintsNew} />
                <Stat label="Скарги в роботі" value={overview.stats.moderation.complaintsInProgress} />
                <Stat label="Дій за добу" value={overview.stats.moderation.actionsLast24h} />
                <Stat label="Повідомлень" value={overview.stats.content.messages} />
                <Stat label="Star в обігу" value={overview.stats.economy.starsInCirculation} />
              </dl>
            </div>
          </aside>
          <div className="min-w-0 flex-1">
            {active === 'users' && <UsersSection view="all" me={me} capabilities={capabilities} onChanged={() => void load()} />}
            {active === 'complaints' && <ComplaintsSection capabilities={capabilities} onChanged={() => void load()} />}
            {active === 'support' && <SupportSection capabilities={capabilities} onChanged={() => void load()} />}
            {active === 'verification' && <UsersSection view="verified" me={me} capabilities={capabilities} onChanged={() => void load()} />}
            {active === 'star' && <StarSection onBalancesChanged={() => void load()} />}
            {active === 'blocks' && <UsersSection view="blocked" me={me} capabilities={capabilities} onChanged={() => void load()} />}
            {active === 'audit' && <AuditSection />}
            {active === 'staff' && <StaffSection me={me} onChanged={() => void load()} />}
            {active === 'notifications' && <NotificationsSection onChanged={() => void load()} />}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="flex items-baseline justify-between gap-2"><dt className="text-slate-400">{label}</dt><dd className="font-semibold tabular-nums">{value.toLocaleString('uk-UA')}</dd></div>;
}
