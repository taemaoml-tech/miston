import { LifeBuoy, MessageCircle, Moon, Plus, ShieldCheck, Star, Sun } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useMessenger } from '../../contexts/MessengerContext';
import { useStar } from '../../contexts/StarContext';
import { useTheme } from '../../contexts/ThemeContext';
import { openInfo } from '../../router/infoRoute';
import { Avatar } from '../common/Avatar';
import { isStaffRole } from '../../utils/moderation';

interface ServerRailProps {
  onCreateServer: () => void;
  onProfile: () => void;
  onAdmin: () => void;
  onStar: () => void;
}

const starNumber = new Intl.NumberFormat('uk-UA');

export function ServerRail({ onCreateServer, onProfile, onAdmin, onStar }: ServerRailProps) {
  const { user } = useAuth();
  const { overview } = useStar();
  const { servers, activeServerId, selectHome, selectServer } = useMessenger();
  const { theme, toggleTheme } = useTheme();
  if (!user) return null;
  return (
    <nav className="flex h-full w-16 shrink-0 flex-col items-center gap-2 border-r border-ios-separator/10 bg-ios-glass/70 py-3 text-ios-secondary backdrop-blur-xl sm:w-[72px]" aria-label="Простори">
      <div className="group relative"><button type="button" onClick={selectHome} className={`flex h-11 w-11 items-center justify-center rounded-full transition-all hover:bg-ios-blue hover:text-white ${!activeServerId ? 'bg-ios-blue text-white shadow-glow' : 'bg-ios-fill/10 text-ios-label'}`} aria-label="Особисті повідомлення" aria-pressed={!activeServerId}><MessageCircle size={21} /></button><RailLabel>Повідомлення</RailLabel></div>
      <div className="my-1 h-px w-8 bg-ios-separator/15" />
      <div className="subtle-scrollbar flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-y-auto px-2">
        {servers.map((server) => <div className="group relative" key={server.id}><button type="button" onClick={() => selectServer(server.id)} className={`block rounded-full transition-all hover:opacity-80 ${activeServerId === server.id ? 'ring-2 ring-ios-blue ring-offset-2 ring-offset-ios-bg' : ''}`} aria-label={server.name} aria-pressed={activeServerId === server.id}><Avatar name={server.name} src={server.iconUrl} square /></button>{server.channels.some((channel) => channel.unreadCount) && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-ios-bg bg-ios-blue" />}<RailLabel>{server.name}</RailLabel></div>)}
        <div className="group relative"><button type="button" onClick={onCreateServer} className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-ios-separator/25 text-ios-secondary transition hover:border-ios-blue hover:bg-ios-blue/10 hover:text-ios-blue" aria-label="Створити сервер"><Plus size={21} /></button><RailLabel>Створити сервер</RailLabel></div>
      </div>
      <div className="my-1 h-px w-8 bg-ios-separator/15" />
      <div className="group relative">
        <button type="button" onClick={onStar} className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-amber-400/15 to-orange-500/10 text-amber-500 ring-1 ring-inset ring-amber-400/30 transition hover:from-amber-400/25 hover:to-orange-500/20" aria-label={`Магазин зірок. Баланс: ${overview?.wallet.balance ?? 0}`}>
          <Star size={20} fill="currentColor" />
          <span className="absolute -bottom-1 -right-1 min-w-[20px] rounded-full bg-amber-400 px-1 text-[9px] font-bold leading-4 text-white shadow">{overview ? starNumber.format(overview.wallet.balance) : '…'}</span>
        </button>
        <RailLabel>Магазин Star</RailLabel>
      </div>
      <div className="group relative"><button type="button" onClick={() => openInfo('support')} className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-ios-fill/10 hover:text-ios-label" aria-label="Підтримка та сторінки проєкту"><LifeBuoy size={20} /></button><RailLabel>Підтримка та меню Miston</RailLabel></div>
      {isStaffRole(user.role) && <div className="group relative"><button type="button" onClick={onAdmin} className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-ios-fill/10 hover:text-ios-label" aria-label="Адміністративна панель"><ShieldCheck size={20} /></button><RailLabel>{user.role === 'owner' ? 'Адмінпанель' : 'Модерація'}</RailLabel></div>}
      <div className="group relative"><button type="button" onClick={toggleTheme} className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-ios-fill/10 hover:text-ios-label" aria-label={`Увімкнути ${theme === 'dark' ? 'світлу' : 'темну'} тему`}>{theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}</button><RailLabel>{theme === 'dark' ? 'Світла тема' : 'Темна тема'}</RailLabel></div>
      <div className="group relative"><button type="button" onClick={onProfile} className="block rounded-full transition hover:ring-2 hover:ring-ios-blue hover:ring-offset-2 hover:ring-offset-ios-bg" aria-label="Редагувати профіль"><Avatar name={user.displayName} src={user.avatarUrl} online /></button><RailLabel>Ваш профіль</RailLabel></div>
    </nav>
  );
}

function RailLabel({ children }: { children: string }) {
  return <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-ios-surface/95 px-2.5 py-1.5 text-xs font-medium text-ios-label opacity-0 shadow-soft ring-1 ring-ios-separator/10 transition group-hover:opacity-100 group-focus-within:opacity-100 lg:block">{children}</span>;
}
