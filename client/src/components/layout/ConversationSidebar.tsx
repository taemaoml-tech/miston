import { Bell, Eraser, Flag, LogOut, MessageSquarePlus, MoreVertical, Search, Trash2, Users, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useFriends } from '../../contexts/FriendsContext';
import { useMessenger } from '../../contexts/MessengerContext';
import type { Conversation } from '../../types/models';
import { formatConversationTime } from '../../utils/format';
import { Avatar } from '../common/Avatar';
import { EmptyState } from '../common/EmptyState';
import { Logo } from '../common/Logo';
import { Spinner } from '../common/Spinner';
import { FriendsPanel } from '../friends/FriendsPanel';
import type { ConversationAction } from '../chat/ConversationActionModal';
import { SystemInboxPanel } from '../moderation/SystemInboxPanel';
import { StarDisplayName } from '../star/StarDisplayName';

const kindLabels: Record<string, string> = { image: 'Фото', video: 'Відео', video_note: 'Відеокружечок', document: 'Документ', voice: 'Голосове повідомлення', sticker: 'Стікер' };

const MENU_WIDTH = 224;
const MENU_HEIGHT = 172;

interface RowMenu {
  conversation: Conversation;
  x: number;
  y: number;
}

export function ConversationSidebar({ onNewChat, onProfile, onOpenUser, onAction, onReportUser }: {
  onNewChat: () => void;
  onProfile: () => void;
  onOpenUser: (id: string) => void;
  onAction: (conversation: Conversation, action: ConversationAction) => void;
  onReportUser: (userId: string) => void;
}) {
  const { user } = useAuth();
  const { conversations, activeConversation, selectConversation, loading, error, reload, presence, systemUnread } = useMessenger();
  const { incomingCount } = useFriends();
  const [tab, setTab] = useState<'chats' | 'friends'>('chats');
  const [inboxOpen, setInboxOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<RowMenu | null>(null);

  function openMenu(conversation: Conversation, x: number, y: number) {
    setMenu({ conversation, x: Math.max(8, Math.min(x, window.innerWidth - MENU_WIDTH - 8)), y: Math.max(8, Math.min(y, window.innerHeight - MENU_HEIGHT - 8)) });
  }

  function closeMenu() {
    setMenu(null);
  }
  const directConversations = useMemo(
    () => conversations.filter((conversation) => conversation.kind !== 'channel'),
    [conversations],
  );
  const filtered = useMemo(() => directConversations.filter((conversation) => `${conversation.title} ${conversation.lastMessage?.content || ''}`.toLowerCase().includes(query.toLowerCase())), [directConversations, query]);

  return (
    <aside className="surface relative flex h-full min-w-0 flex-1 flex-col border-r md:w-80 md:flex-none lg:w-[340px]" aria-label="Розмови та друзі">
      <div className="flex h-16 shrink-0 items-center justify-between px-4"><Logo /><div className="flex items-center gap-1">
        <button type="button" className="icon-btn relative bg-slate-100 text-slate-600 hover:bg-accent-50 hover:text-accent-600 dark:bg-slate-800 dark:text-slate-300" onClick={() => setInboxOpen((value) => !value)} aria-label="Системні сповіщення" aria-expanded={inboxOpen}>
          <Bell size={18} />
          {systemUnread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-600 px-1 text-[9px] font-bold text-white">{systemUnread > 9 ? '9+' : systemUnread}</span>}
        </button>
        <button type="button" className="icon-btn bg-slate-100 text-accent-600 hover:bg-accent-50 dark:bg-slate-800 dark:text-accent-400" onClick={onNewChat} aria-label="Нова розмова"><MessageSquarePlus size={20} /></button>
      </div></div>
      {inboxOpen && <SystemInboxPanel onClose={() => setInboxOpen(false)} />}
      <div className="px-3 pb-2">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="tablist" aria-label="Розділи">
          <button type="button" role="tab" aria-selected={tab === 'chats'} onClick={() => setTab('chats')} className={`rounded-lg py-1.5 text-xs font-semibold transition ${tab === 'chats' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>Повідомлення</button>
          <button type="button" role="tab" aria-selected={tab === 'friends'} onClick={() => setTab('friends')} className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold transition ${tab === 'friends' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
            Друзі
            {incomingCount > 0 && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-600 px-1 text-[9px] font-bold text-white">{incomingCount > 9 ? '9+' : incomingCount}</span>}
          </button>
        </div>
      </div>

      {tab === 'chats' ? (
        <>
          <div className="px-3 pb-3"><label className="relative block"><Search size={16} className="absolute left-3.5 top-3 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="text-input border-transparent bg-slate-100 py-2.5 pl-10 pr-9 focus:border-accent-500 dark:bg-slate-800" placeholder="Пошук розмов" aria-label="Пошук розмов" />{query && <button type="button" className="absolute right-2 top-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700" onClick={() => setQuery('')} aria-label="Очистити пошук"><X size={15} /></button>}</label></div>
          <div className="flex items-center justify-between px-4 pb-2"><h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Повідомлення</h2><span className="text-xs text-slate-400">{directConversations.length}</span></div>
          <div className="subtle-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {loading ? <Spinner label="Завантаження розмов…" className="py-12" /> : error ? <EmptyState icon={Users} title="Не вдалося підключитися" description={error} action={<button type="button" className="secondary-btn" onClick={() => void reload()}>Спробувати ще раз</button>} /> : filtered.length === 0 ? <EmptyState icon={MessageSquarePlus} title={query ? 'Немає збігів' : 'Розмов ще немає'} description={query ? 'Спробуйте інше ім\'я або ключове слово.' : 'Знайдіть знайому людину й почніть нову розмову.'} action={!query ? <button type="button" className="primary-btn" onClick={onNewChat}>Почати чат</button> : undefined} /> : <ul className="space-y-0.5">{filtered.map((conversation) => {
              const active = activeConversation?.id === conversation.id;
              const other = conversation.kind === 'direct' ? conversation.members.find((member) => member.id !== user?.id) : undefined;
              const last = conversation.lastMessage;
              const preview = last ? `${last.senderId === user?.id ? 'Ви: ' : conversation.kind !== 'direct' ? `${last.sender?.displayName?.split(' ')[0] || 'Учасник'}: ` : ''}${last.content || (last.kind === 'text' ? 'Повідомлення' : kindLabels[last.kind] || 'Вкладення')}` : 'Повідомлень ще немає';
              return <li key={conversation.id} className="group relative" onContextMenu={(event) => { event.preventDefault(); openMenu(conversation, event.clientX, event.clientY); }}>
                <button type="button" onClick={() => selectConversation(conversation.id)} className={`flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition ${active ? 'bg-accent-50 dark:bg-accent-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'}`} aria-current={active ? 'page' : undefined}>
                  <Avatar name={conversation.title} src={conversation.avatarUrl} online={other ? presence[other.id] ?? other.online : undefined} square={conversation.kind !== 'direct'} cosmetics={other?.cosmetics} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 pr-7"><span className={`min-w-0 flex-1 truncate text-sm ${conversation.unreadCount ? 'font-bold' : 'font-semibold'}`}>{conversation.kind === 'direct' ? <StarDisplayName name={conversation.title} cosmetics={other?.cosmetics} verified={other?.isVerified} /> : conversation.title}</span><time className={`shrink-0 text-[11px] ${conversation.unreadCount ? 'font-semibold text-accent-600 dark:text-accent-400' : 'text-slate-400'}`} dateTime={last?.createdAt}>{formatConversationTime(last?.createdAt || conversation.updatedAt)}</time></span>
                    <span className="mt-1 flex items-center gap-2"><span className={`min-w-0 flex-1 truncate text-xs ${conversation.unreadCount ? 'font-medium text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>{preview}</span>{conversation.unreadCount > 0 && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent-600 px-1.5 text-[10px] font-bold text-white">{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}</span>}</span>
                  </span>
                </button>
                <button type="button" onClick={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); openMenu(conversation, bounds.right - MENU_WIDTH, bounds.bottom + 4); }} className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 opacity-100 transition hover:bg-slate-200/80 hover:text-slate-700 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 dark:hover:bg-slate-700 dark:hover:text-slate-200" aria-label={`Дії з розмовою «${conversation.title}»`}><MoreVertical size={15} /></button>
              </li>;
            })}</ul>}
          </div>
        </>
      ) : (
        <FriendsPanel onOpenUser={onOpenUser} onChatStarted={() => setTab('chats')} />
      )}

      {menu && (() => {
        const role = menu.conversation.members.find((member) => member.id === user?.id)?.role;
        const isGroup = menu.conversation.kind === 'group';
        const canDeleteForAll = isGroup && (role === 'owner' || role === 'admin');
        const otherMember = menu.conversation.kind === 'direct' ? menu.conversation.members.find((member) => member.id !== user?.id) : undefined;
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={closeMenu} onContextMenu={(event) => { event.preventDefault(); closeMenu(); }} aria-hidden="true" />
            <div className="fixed z-50 w-56 overflow-hidden rounded-2xl border bg-white p-1 shadow-xl animate-fade-in dark:border-slate-700 dark:bg-slate-800" style={{ left: menu.x, top: menu.y }} role="menu" aria-label={`Дії з розмовою «${menu.conversation.title}»`}>
              <Menuitem icon={Eraser} label="Очистити історію" onSelect={() => { closeMenu(); onAction(menu.conversation, 'clear'); }} />
              <Menuitem icon={isGroup && !canDeleteForAll ? LogOut : Trash2} label={isGroup ? (canDeleteForAll ? 'Видалити гру' : 'Покинути гру') : 'Видалити чат'} danger onSelect={() => { closeMenu(); onAction(menu.conversation, 'delete'); }} />
              {otherMember && <Menuitem icon={Flag} label="Скаржитися на співрозмовника" onSelect={() => { closeMenu(); onReportUser(otherMember.id); }} />}
            </div>
          </>
        );
      })()}

      <UserFooter onProfile={onProfile} />
    </aside>
  );
}

function Menuitem({ icon: Icon, label, danger = false, onSelect }: { icon: LucideIcon; label: string; danger?: boolean; onSelect: () => void }) {
  return <button type="button" role="menuitem" onClick={onSelect} className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-slate-100 dark:hover:bg-slate-700 ${danger ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'}`}><Icon size={15} className="shrink-0" />{label}</button>;
}

function UserFooter({ onProfile }: { onProfile: () => void }) {
  const { user } = useAuth();
  if (!user) return null;
  return <div className="border-t p-3"><button type="button" onClick={onProfile} className="flex w-full items-center gap-3 rounded-xl p-1.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800"><Avatar name={user.displayName} src={user.avatarUrl} size="sm" online cosmetics={user.cosmetics} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold"><StarDisplayName name={user.displayName} cosmetics={user.cosmetics} verified={user.isVerified} /></span><span className="block truncate text-xs text-slate-400">@{user.username}</span></span><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">Онлайн</span></button></div>;
}
