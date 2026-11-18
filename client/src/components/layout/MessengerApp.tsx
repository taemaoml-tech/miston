import { lazy, Suspense, useState } from 'react';
import type { Conversation } from '../../types/models';
import { CallProvider } from '../../contexts/CallContext';
import { GameProvider } from '../../contexts/GameContext';
import { FriendsProvider } from '../../contexts/FriendsContext';
import { useGame } from '../../contexts/GameContext';
import { MessengerProvider, useMessenger } from '../../contexts/MessengerContext';
import { useAndroidBack } from '../../utils/androidBack';
import { StarProvider } from '../../contexts/StarContext';
import { CallOverlay } from '../call/CallOverlay';
import { ChatPlaceholder } from '../chat/ChatPlaceholder';
import { ChatWindow } from '../chat/ChatWindow';
import { GameModal } from '../games/GameModal';
import { GameHistoryModal } from '../games/GameHistoryModal';
import type { ConversationAction, ConversationTarget } from '../chat/ConversationActionModal';
import { ConversationActionModal } from '../chat/ConversationActionModal';
import { NewChatModal } from '../chat/NewChatModal';
import { Spinner } from '../common/Spinner';
import { ToastStack } from '../common/ToastStack';
import { ReportModal } from '../moderation/ReportModal';
import type { ReportTarget } from '../moderation/ReportModal';
import { ProfileModal } from '../profile/ProfileModal';
import { UserProfileModal } from '../profile/UserProfileModal';
import { AddMemberModal, CreateChannelModal, CreateServerModal } from '../servers/ServerDialogs';
import { ChannelSidebar } from '../servers/ChannelSidebar';
import { ConversationSidebar } from './ConversationSidebar';
import { MobileMenuDrawer } from './MobileMenuDrawer';
import { ServerRail } from './ServerRail';

// Адмін-панель — найбільший бандл, який потрібен не всім і не відразу,
// тому вантажиться окремим чанком після першого відкриття.
const AdminPanel = lazy(() => import('../admin/AdminPanel').then((m) => ({ default: m.AdminPanel })));

type ModalName = 'profile' | 'newChat' | 'server' | 'channel' | 'member' | 'admin' | null;

function MessengerLayout() {
  const [modal, setModal] = useState<ModalName>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [previewUserId, setPreviewUserId] = useState<string | null>(null);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [chatAction, setChatAction] = useState<ConversationTarget | null>(null);
  const { activeServer, activeConversation, mobileChatOpen, selectHome, notifications, dismissNotification, openNotification } = useMessenger();
  const close = () => setModal(null);
  const openUser = (id: string) => setPreviewUserId(id);
  const openChatAction = (conversation: Conversation, action: ConversationAction) => setChatAction({ conversation, action });

  // Пріоритети: спочатку закриваємо модалки, потім повертаємося з чату/сервера
  // на головне меню. Порожній headroom означає, що ми вже на головній.
  const { activeGame, historyOpen, closeGame, setHistoryOpen } = useGame();
  useAndroidBack(() => {
    if (historyOpen) { setHistoryOpen(false); return true; }
    if (activeGame) { closeGame(); return true; }
    return false;
  }, 200);
  useAndroidBack(() => {
    if (chatAction) { setChatAction(null); return true; }
    if (report) { setReport(null); return true; }
    if (previewUserId) { setPreviewUserId(null); return true; }
    if (modal) { close(); return true; }
    return false;
  }, 150);
  useAndroidBack(() => {
    if (!menuOpen) return false;
    setMenuOpen(false);
    return true;
  }, 120);
  useAndroidBack(() => {
    if (!activeConversation && !activeServer && !mobileChatOpen) return false;
    selectHome();
    return true;
  }, 0);

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-ios-bg text-ios-label">
      <div className="hidden h-full md:flex"><ServerRail onCreateServer={() => setModal('server')} onProfile={() => setModal('profile')} onAdmin={() => setModal('admin')} /></div>
      <div className={`${mobileChatOpen ? 'hidden md:flex' : 'flex'} min-w-0 flex-1 md:flex-none`}>
        {activeServer ? <ChannelSidebar onCreateChannel={() => setModal('channel')} onAddMember={() => setModal('member')} onProfile={() => setModal('profile')} /> : <ConversationSidebar onNewChat={() => setModal('newChat')} onProfile={() => setModal('profile')} onOpenMenu={() => setMenuOpen(true)} onOpenUser={openUser} onAction={openChatAction} onReportUser={(userId) => setReport({ userId })} />}
      </div>
      <main className={`${mobileChatOpen ? 'flex' : 'hidden md:flex'} min-w-0 flex-1`}>
        {activeConversation ? <ChatWindow onOpenUser={openUser} onReport={setReport} onAction={openChatAction} /> : <ChatPlaceholder onNewChat={() => setModal('newChat')} onCreateChannel={() => setModal('channel')} />}
      </main>
      <MobileMenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onCreateServer={() => setModal('server')}
        onProfile={() => setModal('profile')}
        onAdmin={() => setModal('admin')}
      />
      {chatAction && <ConversationActionModal target={chatAction} onClose={() => setChatAction(null)} />}
      <ProfileModal open={modal === 'profile'} onClose={close} />
      <UserProfileModal userId={previewUserId} onClose={() => setPreviewUserId(null)} onReport={setReport} />
      <ReportModal target={report} onClose={() => setReport(null)} />
      <NewChatModal open={modal === 'newChat'} onClose={close} />
      <CreateServerModal open={modal === 'server'} onClose={close} />
      <CreateChannelModal open={modal === 'channel'} onClose={close} />
      <AddMemberModal open={modal === 'member'} onClose={close} />
      {/* Монтуємо лише на відкриття, інакше лінивий чанк завантажувався б одразу. */}
      {modal === 'admin' && (
        <Suspense fallback={<Spinner label="Завантаження розділу…" className="fixed inset-x-0 bottom-6 z-[65]" />}>
          <AdminPanel open onClose={close} />
        </Suspense>
      )}
      <ToastStack notifications={notifications} onDismiss={dismissNotification} onOpen={openNotification} />
      <GameModal />
      <GameHistoryModal />
      <CallOverlay />
    </div>
  );
}

export function MessengerApp() {
  return (
    <StarProvider>
      <MessengerProvider>
        <FriendsProvider>
          <CallProvider>
            <GameProvider>
              <MessengerLayout />
            </GameProvider>
          </CallProvider>
        </FriendsProvider>
      </MessengerProvider>
    </StarProvider>
  );
}
