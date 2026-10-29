import { Hash, Plus, Settings2, UserPlus, Users, Volume2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useMessenger } from '../../contexts/MessengerContext';
import { Avatar } from '../common/Avatar';
import { StarDisplayName } from '../star/StarDisplayName';
import { EmptyState } from '../common/EmptyState';

export function ChannelSidebar({ onCreateChannel, onAddMember, onProfile }: { onCreateChannel: () => void; onAddMember: () => void; onProfile: () => void }) {
  const { user } = useAuth();
  const { activeServer, activeConversation, selectChannel } = useMessenger();
  if (!activeServer || !user) return null;
  return (
    <aside className="surface flex h-full min-w-0 flex-1 flex-col border-r md:w-72 md:flex-none lg:w-80" aria-label={`Канали ${activeServer.name}`}>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4"><Avatar name={activeServer.name} src={activeServer.avatarUrl} size="sm" square /><div className="min-w-0 flex-1"><h1 className="truncate text-sm font-bold">{activeServer.name}</h1><p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400"><Users size={11} /> {activeServer.memberCount} учасників</p></div><button type="button" className="icon-btn h-9 w-9" onClick={onAddMember} aria-label="Запросити учасників"><UserPlus size={18} /></button></header>
      <div className="subtle-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mb-2 flex items-center justify-between px-1"><h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Текстові канали</h2><button type="button" onClick={onCreateChannel} className="icon-btn h-7 w-7" aria-label="Створити канал"><Plus size={17} /></button></div>
        {activeServer.channels.length ? <ul className="space-y-1">{activeServer.channels.map((channel) => { const active = activeConversation?.id === channel.id; return <li key={channel.id}><button type="button" onClick={() => selectChannel(activeServer.id, channel)} className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition ${active ? 'bg-accent-50 font-semibold text-accent-700 dark:bg-accent-500/10 dark:text-accent-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`} aria-current={active ? 'page' : undefined}><Hash size={18} className="shrink-0 text-slate-400" /><span className="min-w-0 flex-1 truncate">{channel.title}</span>{Boolean(channel.unreadCount) && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-600 px-1 text-[10px] font-bold text-white">{channel.unreadCount}</span>}</button></li>; })}</ul> : <EmptyState icon={Volume2} title="Каналів ще немає" description="Створіть перший канал і дайте спільноті місце для розмов." action={<button type="button" className="primary-btn" onClick={onCreateChannel}><Plus size={16} /> Створити канал</button>} />}
        <div className="mt-6 rounded-2xl bg-gradient-to-br from-accent-50 to-violet-50 p-4 dark:from-accent-500/10 dark:to-violet-500/10"><Settings2 size={19} className="text-accent-500" /><h3 className="mt-2 text-sm font-semibold">Розвивайте свій простір</h3><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Запросіть людей долучитися до розмов у кожному каналі.</p><button type="button" onClick={onAddMember} className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-accent-600 hover:text-accent-700 dark:text-accent-400"><UserPlus size={14} /> Запросити учасників</button></div>
      </div>
      <div className="border-t p-3"><button type="button" onClick={onProfile} className="flex w-full items-center gap-3 rounded-xl p-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"><Avatar name={user.displayName} src={user.avatarUrl} size="sm" online cosmetics={user.cosmetics} /><div className="min-w-0"><p className="truncate text-sm font-semibold"><StarDisplayName name={user.displayName} cosmetics={user.cosmetics} verified={user.isVerified} /></p><p className="truncate text-xs text-slate-400">@{user.username}</p></div></button></div>
    </aside>
  );
}
