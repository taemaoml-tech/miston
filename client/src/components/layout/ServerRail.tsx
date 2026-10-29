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
  const { servers, activeServerId, activeConversation, selectHome, selectServer } = useMessenger();
  const { theme, toggleTheme } = useTheme();
  if (!user) return null;
  return (
    <nav className="flex h-full w-16 shrink-0 flex-col items-center gap-2 border-r border-slate-800/80 bg-slate-950 py-3 text-slate-400 sm:w-[72px]" aria-label="Простори">
      <div className="group relative"><button type="button" onClick={selectHome} className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-all hover:rounded-xl hover:bg-accent-600 hover:text-white ${!activeServerId ? 'bg-accent-600 text-white shadow-glow' : 'bg-slate-800'}`} aria-label="Особисті повідомлення" aria-pressed={!activeServerId}><MessageCircle size={21} /></button><RailLabel>Повідомлення</RailLabel></div>
      <div className="my-1 h-px w-8 bg-slate-800" />
      <div className="subtle-scrollbar flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-y-auto px-2">
        {servers.map((server) => <div className="group relative" key={server.id}><button type="button" onClick={() => selectServer(server.id)} className={`block rounded-2xl transition-all hover:rounded-xl ${activeServerId === server.id ? 'ring-2 ring-accent-400 ring-offset-2 ring-offset-slate-950' : ''}`} aria-label={server.name} aria-pressed={activeServerId === server.id}><Avatar name={server.name} src={server.iconUrl} square /></button>{server.channels.some((channel) => channel.unreadCount) && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-slate-950 bg-accent-400" />}<RailLabel>{server.name}</RailLabel></div>)}
        <div className="group relative"><button type="button" onClick={onCreateServer} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-dashed border-slate-700 text-slate-400 transition hover:rounded-xl hover:border-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400" aria-label="Створити сервер"><Plus size={21} /></button><RailLabel>Створити сервер</RailLabel></div>
      </div>
      <div className="my-1 h-px w-8 bg-slate-800" />
      <div className="group relative">
        <button type="button" onClick={onStar} className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/15 to-orange-500/10 text-amber-300 ring-1 ring-inset ring-amber-400/30 transition hover:from-amber-400/25 hover:to-orange-500/20 hover:text-amber-200" aria-label={`Магазин зірок. Баланс: ${overview?.wallet.balance ?? 0}`}>
          <Star size={20} fill="currentColor" />
          <span className="absolute -bottom-1 -right-1 min-w-[20px] rounded-full bg-amber-400 px-1 text-[9px] font-bold leading-4 text-slate-950 shadow">{overview ? starNumber.format(overview.wallet.balance) : '…'}</span>
        </button>
        <RailLabel>Магазин Star</RailLabel>
      </div>
      <div className="group relative"><button type="button" onClick={() => openInfo('support')} className="flex h-10 w-10 items-center justify-center rounded-xl transition hover:bg-slate-800 hover:text-white" aria-label="Підтримка та сторінки проєкту"><LifeBuoy size={20} /></button><RailLabel>Підтримка та меню Miston</RailLabel></div>
      {isStaffRole(user.role) && <div className="group relative"><button type="button" onClick={onAdmin} className="flex h-10 w-10 items-center justify-center rounded-xl transition hover:bg-slate-800 hover:text-white" aria-label="Адміністративна панель"><ShieldCheck size={20} /></button><RailLabel>{user.role === 'owner' ? 'Адмінпанель' : 'Модерація'}</RailLabel></div>}
      <div className="group relative"><button type="button" onClick={toggleTheme} className="flex h-10 w-10 items-center justify-center rounded-xl transition hover:bg-slate-800 hover:text-white" aria-label={`Увімкнути ${theme === 'dark' ? 'світлу' : 'темну'} тему`}>{theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}</button><RailLabel>{theme === 'dark' ? 'Світла тема' : 'Темна тема'}</RailLabel></div>
      <div className="group relative"><button type="button" onClick={onProfile} className={`block rounded-full transition hover:ring-2 hover:ring-accent-400 hover:ring-offset-2 hover:ring-offset-slate-950 ${!activeConversation ? '' : ''}`} aria-label="Редагувати профіль"><Avatar name={user.displayName} src={user.avatarUrl} online /></button><RailLabel>Ваш профіль</RailLabel></div>
    </nav>
  );
}

function RailLabel({ children }: { children: string }) {
  return <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-within:opacity-100 lg:block">{children}</span>;
}
