import { LayoutGrid, LifeBuoy, MessageCircle, Moon, Plus, ShieldCheck, Sun, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useMessenger } from '../../contexts/MessengerContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useAndroidBack } from '../../utils/androidBack';
import { isStaffRole } from '../../utils/moderation';
import { openInfo } from '../../router/infoRoute';
import { Avatar } from '../common/Avatar';
import { Logo } from '../common/Logo';

interface MobileMenuDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreateServer: () => void;
  onProfile: () => void;
  onAdmin: () => void;
}

export function MobileMenuDrawer({ open, onClose, onCreateServer, onProfile, onAdmin }: MobileMenuDrawerProps) {
  const { user } = useAuth();
  const { servers, activeServerId, view, selectHome, selectFeed, selectServer } = useMessenger();
  const { theme, toggleTheme } = useTheme();

  useAndroidBack(() => {
    if (!open) return false;
    onClose();
    return true;
  }, 130);

  if (!open || !user) return null;

  const safeStyle = {
    paddingTop: 'calc(var(--miston-safe-top-adjusted) + 12px)',
    paddingBottom: 'calc(var(--miston-safe-bottom-adjusted) + 12px)',
  } as CSSProperties;

  const run = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <div className="fixed inset-0 z-[70] md:hidden" role="dialog" aria-modal="true" aria-label="Меню Miston">
      <button type="button" className="absolute inset-0 bg-black/45 animate-fade-in" onClick={onClose} aria-label="Закрити меню" />
      <nav className="ios-glass absolute inset-y-0 left-0 flex w-[86%] max-w-xs flex-col overflow-hidden border-r shadow-2xl animate-fade-in" style={safeStyle}>
        <div className="flex items-center justify-between px-3 pb-3">
          <Logo size={32} />
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрити меню"><X size={20} /></button>
        </div>

        <div className="px-2">
          <DrawerRow icon={MessageCircle} label="Повідомлення" active={view === 'chats' && !activeServerId} onClick={() => run(selectHome)} />
          <DrawerRow icon={LayoutGrid} label="Стрічка" active={view === 'feed'} onClick={() => run(selectFeed)} />
        </div>

        <div className="subtle-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          <DrawerSection title="Простори" />
          {servers.map((server) => (
            <DrawerRow
              key={server.id}
              label={server.name}
              active={activeServerId === server.id}
              onClick={() => run(() => selectServer(server.id))}
              avatar={{ name: server.name, src: server.iconUrl, square: true }}
            />
          ))}
          <DrawerRow icon={Plus} label="Створити сервер" onClick={() => run(onCreateServer)} />
        </div>

        <div className="border-t px-2 pt-2">
          <DrawerRow icon={LifeBuoy} label="Підтримка" onClick={() => run(() => openInfo('support'))} />
          {isStaffRole(user.role) && <DrawerRow icon={ShieldCheck} label={user.role === 'owner' ? 'Адмінпанель' : 'Модерація'} onClick={() => run(onAdmin)} />}
          <DrawerRow icon={theme === 'dark' ? Sun : Moon} label={theme === 'dark' ? 'Світла тема' : 'Темна тема'} onClick={toggleTheme} />
        </div>

        <div className="mt-2 border-t px-2 pt-2">
          <button type="button" onClick={() => run(onProfile)} className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-ios-fill/10">
            <Avatar name={user.displayName} src={user.avatarUrl} size="sm" online cosmetics={user.cosmetics} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{user.displayName}</span>
              <span className="block truncate text-xs text-ios-secondary">@{user.username}</span>
            </span>
          </button>
        </div>
      </nav>
    </div>
  );
}

function DrawerSection({ title }: { title: string }) {
  return <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-ios-secondary">{title}</p>;
}

function DrawerRow({ icon: Icon, label, active = false, onClick, avatar }: {
  icon?: LucideIcon;
  label: string;
  active?: boolean;
  onClick: () => void;
  avatar?: { name: string; src?: string | null; square?: boolean };
}) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 rounded-2xl p-2.5 text-left text-sm transition ${active ? 'bg-ios-blue/10 text-ios-blue' : 'hover:bg-ios-fill/10 text-ios-label'}`} aria-current={active ? 'page' : undefined}>
      {avatar
        ? <Avatar name={avatar.name} src={avatar.src} square={avatar.square} />
        : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ios-fill/10">{Icon && <Icon size={19} />}</span>}
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
    </button>
  );
}
