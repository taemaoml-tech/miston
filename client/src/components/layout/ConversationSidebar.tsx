import { Bell, Bookmark, Check, Eraser, Flag, Folder, LayoutGrid, LoaderCircle, LogOut, Menu, MessageSquarePlus, MoreVertical, Search, Trash2, Users, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useFriends } from '../../contexts/FriendsContext';
import { useFolders } from '../../contexts/FoldersContext';
import { useMessenger } from '../../contexts/MessengerContext';
import type { Conversation } from '../../types/models';
import { formatConversationTime } from '../../utils/format';
import { useAndroidBack } from '../../utils/androidBack';
import { Avatar } from '../common/Avatar';
import { EmptyState } from '../common/EmptyState';
import { Logo } from '../common/Logo';
import { Spinner } from '../common/Spinner';
import { FriendsPanel } from '../friends/FriendsPanel';
import type { ConversationAction } from '../chat/ConversationActionModal';
import { SystemInboxPanel } from '../moderation/SystemInboxPanel';
import { StarDisplayName } from '../star/StarDisplayName';

const kindLabels: Record<string, string> = { image: 'Фото', video: 'Відео', video_note: 'Відеокружечок', document: 'Документ', voice: 'Голосове повідомлення', sticker: 'Стікер' };

const FEED_URL = 'https://taemaoml-tech.github.io/miston-feed/';

const MENU_WIDTH = 224;
const MENU_HEIGHT = 208;
const FOLDER_COLORS: Record<string, string> = {
  blue: '#007AFF', green: '#34C759', purple: '#AF52DE',
  amber: '#FF9F0A', rose: '#FF2D55', cyan: '#32ADE6',
};

interface RowMenu {
  conversation: Conversation;
  x: number;
  y: number;
}

export function ConversationSidebar({ onNewChat, onProfile, onOpenMenu, onOpenUser, onAction, onReportUser }: {
  onNewChat: () => void;
  onProfile: () => void;
  onOpenMenu: () => void;
  onOpenUser: (id: string) => void;
  onAction: (conversation: Conversation, action: ConversationAction) => void;
  onReportUser: (userId: string) => void;
}) {
  const { user } = useAuth();
  const { conversations, activeConversation, selectConversation, loading, error, reload, presence, systemUnread, savedNotes, openSavedNotes } = useMessenger();
  const { incomingCount } = useFriends();
  const { folders, activeFolderId, setActiveFolderId, addConversation, removeConversation } = useFolders();
  const [tab, setTab] = useState<'chats' | 'friends'>('chats');
  const [inboxOpen, setInboxOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<RowMenu | null>(null);
  const [folderMenu, setFolderMenu] = useState<RowMenu | null>(null);
  const [openingNotes, setOpeningNotes] = useState(false);

  useAndroidBack(() => {
    if (folderMenu) { setFolderMenu(null); return true; }
    if (menu) { setMenu(null); return true; }
    if (inboxOpen) { setInboxOpen(false); return true; }
    if (tab === 'friends') { setTab('chats'); return true; }
    return false;
  }, 110);

  async function openNotes() {
    if (savedNotes) { selectConversation(savedNotes.id); return; }
    setOpeningNotes(true);
    try { await openSavedNotes(); } finally { setOpeningNotes(false); }
  }

  function openMenu(conversation: Conversation, x: number, y: number) {
    setMenu({ conversation, x: Math.max(8, Math.min(x, window.innerWidth - MENU_WIDTH - 8)), y: Math.max(8, Math.min(y, window.innerHeight - MENU_HEIGHT - 8)) });
  }

  function closeMenu() {
    setMenu(null);
  }

  function openFolderMenu(conversation: Conversation, x: number, y: number) {
    setFolderMenu({ conversation, x: Math.max(8, Math.min(x, window.innerWidth - MENU_WIDTH - 8)), y: Math.max(8, Math.min(y, window.innerHeight - 180)) });
  }

  // Нотатки живуть окремим закріпленим рядком угорі, а не в спільному списку.
  const directConversations = useMemo(
    () => conversations.filter((conversation) => conversation.kind !== 'channel' && conversation.kind !== 'saved'),
    [conversations],
  );
  const folderConversations = useMemo(() => {
    if (!activeFolderId) return directConversations;
    const folder = folders.find((item) => item.id === activeFolderId);
    if (!folder) return directConversations;
    return directConversations.filter((conversation) => folder.conversationIds.includes(conversation.id));
  }, [directConversations, activeFolderId, folders]);
  const filtered = useMemo(() => folderConversations.filter((conversation) => `${conversation.title} ${conversation.lastMessage?.encrypted ? '' : conversation.lastMessage?.content || ''}`.toLowerCase().includes(query.toLowerCase())), [folderConversations, query]);

  return (
    <aside className="relative flex h-full min-w-0 flex-1 flex-col border-r border-ios-separator/10 bg-ios-glass/80 backdrop-blur-xl md:w-80 md:flex-none lg:w-[340px]" aria-label="Розмови та друзі">
      <div className="flex h-14 shrink-0 items-center justify-between gap-1 px-2 sm:px-3">
        <div className="flex min-w-0 items-center gap-1">
          <button type="button" className="icon-btn md:hidden" onClick={onOpenMenu} aria-label="Відкрити меню"><Menu size={20} /></button>
          <span className="sm:hidden"><Logo compact size={30} /></span>
          <span className="hidden sm:block"><Logo size={32} /></span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <a href={FEED_URL} target="_blank" rel="noreferrer" className="icon-btn relative" aria-label="Стрічка (окремий сайт)" title="Стрічка">
            <LayoutGrid size={20} />
          </a>
          <button type="button" className={`icon-btn relative ${tab === 'friends' ? 'bg-ios-blue/10 text-ios-blue' : ''}`} onClick={() => setTab((current) => current === 'friends' ? 'chats' : 'friends')} aria-label="Друзі" aria-pressed={tab === 'friends'}>
            <Users size={20} />
            {incomingCount > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ios-blue px-1 text-[9px] font-bold text-white">{incomingCount > 9 ? '9+' : incomingCount}</span>}
          </button>
          <button type="button" className="icon-btn relative" onClick={() => setInboxOpen((value) => !value)} aria-label="Системні сповіщення" aria-expanded={inboxOpen}>
            <Bell size={20} />
            {systemUnread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ios-blue px-1 text-[9px] font-bold text-white">{systemUnread > 9 ? '9+' : systemUnread}</span>}
          </button>
          <button type="button" className="icon-btn text-ios-blue hover:bg-ios-blue hover:text-white" onClick={onNewChat} aria-label="Нова розмова"><MessageSquarePlus size={20} /></button>
        </div>
      </div>
      {inboxOpen && <SystemInboxPanel onClose={() => setInboxOpen(false)} />}
      {tab === 'chats' ? (
        <>
          <div className="px-3 pb-2 pt-0.5"><label className="relative block"><Search size={17} className="absolute left-3.5 top-2.5 text-ios-secondary" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="text-input rounded-full border-transparent bg-ios-fill/10 py-2 pl-10 pr-9 placeholder:text-ios-secondary focus:border-ios-blue focus:bg-ios-bg" placeholder="Пошук" aria-label="Пошук розмов" />{query && <button type="button" className="absolute right-2 top-1.5 flex h-8 w-8 items-center justify-center rounded-full text-ios-secondary hover:text-ios-label" onClick={() => setQuery('')} aria-label="Очистити пошук"><X size={15} /></button>}</label></div>
          {folders.length > 0 && (
            <div className="subtle-scrollbar flex shrink-0 items-center gap-1.5 overflow-x-auto px-3 pb-2" aria-label="Папки чатів">
              <button type="button" onClick={() => setActiveFolderId(null)} className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${activeFolderId ? 'bg-ios-fill/10 text-ios-secondary hover:bg-ios-fill/20' : 'bg-ios-blue text-white'}`}>Усі чати</button>
              {folders.map((folder) => (
                <button type="button" key={folder.id} onClick={() => setActiveFolderId(activeFolderId === folder.id ? null : folder.id)} className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${activeFolderId === folder.id ? 'bg-ios-blue text-white' : 'bg-ios-fill/10 text-ios-secondary hover:bg-ios-fill/20'}`}>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: FOLDER_COLORS[folder.color] || FOLDER_COLORS.blue }} />
                  <span className="max-w-[110px] truncate">{folder.name}</span>
                  <span className="opacity-60">{folder.conversationIds.length}</span>
                </button>
              ))}
            </div>
          )}
          <div className="group relative px-2 pb-1">
            <button type="button" onClick={() => void openNotes()} disabled={openingNotes} className={`flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition disabled:opacity-70 ${savedNotes && activeConversation?.id === savedNotes.id ? 'bg-ios-blue/10' : 'hover:bg-ios-fill/10'}`} aria-current={savedNotes && activeConversation?.id === savedNotes.id ? 'page' : undefined}>
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ios-blue/10 text-ios-blue">{openingNotes ? <LoaderCircle size={20} className="animate-spin" /> : <Bookmark size={22} />}</span>
              <span className="min-w-0 flex-1 pr-5">
                <span className="block truncate text-sm font-semibold">Збережені нотатки</span>
                <span className="block truncate text-xs text-ios-secondary">{savedNotes?.lastMessage
                  ? savedNotes.lastMessage.encrypted ? '🔒 Шифроване повідомлення' : savedNotes.lastMessage.content || kindLabels[savedNotes.lastMessage.kind] || 'Повідомлення'
                  : 'Тут лишається лише ваше — ніхто не побачить'}</span>
              </span>
            </button>
            {savedNotes && <button type="button" onClick={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); openMenu(savedNotes, bounds.right - MENU_WIDTH, bounds.bottom + 4); }} className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full text-ios-secondary opacity-100 transition hover:bg-ios-fill/10 hover:text-ios-label md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100" aria-label="Дії з нотатками"><MoreVertical size={15} /></button>}
          </div>
          <div className="subtle-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
            {loading ? <Spinner label="Завантаження розмов…" className="py-12" /> : error ? <EmptyState icon={Users} title="Не вдалося підключитися" description={error} action={<button type="button" className="secondary-btn" onClick={() => void reload()}>Спробувати ще раз</button>} /> : filtered.length === 0 ? <EmptyState icon={MessageSquarePlus} title={query ? 'Немає збігів' : 'Розмов ще немає'} description={query ? 'Спробуйте інше ім\'я або ключове слово.' : 'Знайдіть знайому людину й почніть нову розмову.'} action={!query ? <button type="button" className="primary-btn" onClick={onNewChat}>Почати чат</button> : undefined} /> : <ul className="space-y-0.5">{filtered.map((conversation) => {
              const active = activeConversation?.id === conversation.id;
              const other = conversation.kind === 'direct' ? conversation.members.find((member) => member.id !== user?.id) : undefined;
              const last = conversation.lastMessage;
              const preview = last ? `${last.senderId === user?.id ? 'Ви: ' : conversation.kind !== 'direct' ? `${last.sender?.displayName?.split(' ')[0] || 'Учасник'}: ` : ''}${last.encrypted && !last.decrypted ? '🔒 Шифроване повідомлення' : last.content || (last.kind === 'text' ? 'Повідомлення' : kindLabels[last.kind] || 'Вкладення')}` : 'Повідомлень ще немає';
              return <li key={conversation.id} className="group relative" onContextMenu={(event) => { event.preventDefault(); openMenu(conversation, event.clientX, event.clientY); }}>
                <button type="button" onClick={() => selectConversation(conversation.id)} className={`flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition ${active ? 'bg-ios-blue/10' : 'hover:bg-ios-fill/10'}`} aria-current={active ? 'page' : undefined}>
                  <Avatar name={conversation.title} src={conversation.avatarUrl} online={other ? presence[other.id] ?? other.online : undefined} cosmetics={other?.cosmetics} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 pr-7"><span className={`min-w-0 flex-1 truncate text-sm ${conversation.unreadCount ? 'font-bold' : 'font-semibold'}`}>{conversation.kind === 'direct' ? <StarDisplayName name={conversation.title} cosmetics={other?.cosmetics} verified={other?.isVerified} /> : conversation.title}</span><time className={`shrink-0 text-[11px] ${conversation.unreadCount ? 'font-semibold text-ios-blue' : 'text-ios-secondary'}`} dateTime={last?.createdAt}>{formatConversationTime(last?.createdAt || conversation.updatedAt)}</time></span>
                    <span className="mt-1 flex items-center gap-2"><span className={`min-w-0 flex-1 truncate text-xs ${conversation.unreadCount ? 'font-medium text-ios-label' : 'text-ios-secondary'}`}>{preview}</span>{conversation.unreadCount > 0 && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-ios-blue px-1.5 text-[10px] font-bold text-white">{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}</span>}</span>
                  </span>
                </button>
                <button type="button" onClick={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); openMenu(conversation, bounds.right - MENU_WIDTH, bounds.bottom + 4); }} className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full text-ios-secondary opacity-100 transition hover:bg-ios-fill/10 hover:text-ios-label md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100" aria-label={`Дії з розмовою «${conversation.title}»`}><MoreVertical size={15} /></button>
              </li>;
            })}</ul>}
          </div>
        </>
      ) : (
        <FriendsPanel onOpenUser={onOpenUser} onChatStarted={() => setTab('chats')} />
      )}

      {folderMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setFolderMenu(null)} onContextMenu={(event) => { event.preventDefault(); setFolderMenu(null); }} aria-hidden="true" />
          <div className="fixed z-50 w-56 overflow-hidden rounded-2xl border bg-white p-1 shadow-xl animate-fade-in dark:border-slate-700 dark:bg-slate-800" style={{ left: folderMenu.x, top: folderMenu.y }} role="menu" aria-label="Папки для чату">
            <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ios-secondary">Папки</p>
            {folders.length === 0 && <p className="px-3 py-2 text-xs text-ios-secondary">Спочатку створіть папку в Налаштуваннях.</p>}
            {folders.map((folder) => {
              const assigned = folder.conversationIds.includes(folderMenu.conversation.id);
              return (
                <button type="button" role="menuitem" key={folder.id} onClick={() => {
                  void (assigned ? removeConversation(folder.id, folderMenu.conversation.id) : addConversation(folder.id, folderMenu.conversation.id));
                  setFolderMenu(null);
                }} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: FOLDER_COLORS[folder.color] || FOLDER_COLORS.blue }} />
                  <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                  {assigned && <Check size={14} className="shrink-0 text-ios-blue" />}
                </button>
              );
            })}
          </div>
        </>
      )}

      {menu && (() => {
        const role = menu.conversation.members.find((member) => member.id === user?.id)?.role;
        const isGroup = menu.conversation.kind === 'group';
        const isSaved = menu.conversation.kind === 'saved';
        const canDeleteForAll = isGroup && (role === 'owner' || role === 'admin');
        const otherMember = menu.conversation.kind === 'direct' ? menu.conversation.members.find((member) => member.id !== user?.id) : undefined;
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={closeMenu} onContextMenu={(event) => { event.preventDefault(); closeMenu(); }} aria-hidden="true" />
            <div className="fixed z-50 w-56 overflow-hidden rounded-2xl border bg-white p-1 shadow-xl animate-fade-in dark:border-slate-700 dark:bg-slate-800" style={{ left: menu.x, top: menu.y }} role="menu" aria-label={`Дії з розмовою «${menu.conversation.title}»`}>
              <Menuitem icon={Folder} label="Додати до папки" onSelect={() => { const bounds = { right: menu.x + MENU_WIDTH, bottom: menu.y + 88 }; setMenu(null); openFolderMenu(menu.conversation, bounds.right - MENU_WIDTH, bounds.bottom); }} />
              <Menuitem icon={Eraser} label={isSaved ? 'Очистити нотатки' : 'Очистити історію'} onSelect={() => { closeMenu(); onAction(menu.conversation, 'clear'); }} />
              <Menuitem icon={isGroup && !canDeleteForAll ? LogOut : Trash2} label={isGroup ? (canDeleteForAll ? 'Видалити гру' : 'Покинути гру') : isSaved ? 'Видалити нотатки' : 'Видалити чат'} danger onSelect={() => { closeMenu(); onAction(menu.conversation, 'delete'); }} />
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
