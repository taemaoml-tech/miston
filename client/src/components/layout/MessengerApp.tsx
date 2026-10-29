import { lazy, Suspense, useState } from 'react';
import type { Conversation } from '../../types/models';
import { CallProvider } from '../../contexts/CallContext';
import { FriendsProvider } from '../../contexts/FriendsContext';
import { MessengerProvider, useMessenger } from '../../contexts/MessengerContext';
import { StarProvider } from '../../contexts/StarContext';
import { CallOverlay } from '../call/CallOverlay';
import { ChatPlaceholder } from '../chat/ChatPlaceholder';
import { ChatWindow } from '../chat/ChatWindow';
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
import { ServerRail } from './ServerRail';

// Адмін-панель і магазин Star — найбільші бандли, які потрібні не всім і не відразу,
// тому вантажаться окремим чанком після першого відкриття.
const AdminPanel = lazy(() => import('../admin/AdminPanel').then((m) => ({ default: m.AdminPanel })));
const StarShop = lazy(() => import('../star/StarShop').then((m) => ({ default: m.StarShop })));

type ModalName = 'profile' | 'newChat' | 'server' | 'channel' | 'member' | 'admin' | 'star' | null;

function MessengerLayout() {
  const [modal, setModal] = useState<ModalName>(null);
  const [previewUserId, setPreviewUserId] = useState<string | null>(null);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [chatAction, setChatAction] = useState<ConversationTarget | null>(null);
  const { activeServer, activeConversation, mobileChatOpen, notifications, dismissNotification, openNotification } = useMessenger();
  const close = () => setModal(null);
  const openUser = (id: string) => setPreviewUserId(id);
  const openChatAction = (conversation: Conversation, action: ConversationAction) => setChatAction({ conversation, action });
  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-white dark:bg-slate-900">
      <div className={`${mobileChatOpen ? 'hidden md:flex' : 'flex'} h-full`}><ServerRail onCreateServer={() => setModal('server')} onProfile={() => setModal('profile')} onAdmin={() => setModal('admin')} onStar={() => setModal('star')} /></div>
      <div className={`${mobileChatOpen ? 'hidden md:flex' : 'flex'} min-w-0 flex-1 md:flex-none`}>
        {activeServer ? <ChannelSidebar onCreateChannel={() => setModal('channel')} onAddMember={() => setModal('member')} onProfile={() => setModal('profile')} /> : <ConversationSidebar onNewChat={() => setModal('newChat')} onProfile={() => setModal('profile')} onOpenUser={openUser} onAction={openChatAction} onReportUser={(userId) => setReport({ userId })} />}
      </div>
      <main className={`${mobileChatOpen ? 'flex' : 'hidden md:flex'} min-w-0 flex-1`}>
        {activeConversation ? <ChatWindow onOpenUser={openUser} onReport={setReport} onAction={openChatAction} /> : <ChatPlaceholder onNewChat={() => setModal('newChat')} onCreateChannel={() => setModal('channel')} />}
      </main>
      {chatAction && <ConversationActionModal target={chatAction} onClose={() => setChatAction(null)} />}
      <ProfileModal open={modal === 'profile'} onClose={close} />
      <UserProfileModal userId={previewUserId} onClose={() => setPreviewUserId(null)} onReport={setReport} />
      <ReportModal target={report} onClose={() => setReport(null)} />
      <NewChatModal open={modal === 'newChat'} onClose={close} />
      <CreateServerModal open={modal === 'server'} onClose={close} />
      <CreateChannelModal open={modal === 'channel'} onClose={close} />
      <AddMemberModal open={modal === 'member'} onClose={close} />
      {/* Монтуємо лише на відкриття, інакше лінивий чанк завантажувався б одразу. */}
      {(modal === 'admin' || modal === 'star') && (
        <Suspense fallback={<Spinner label="Завантаження розділу…" className="fixed inset-x-0 bottom-6 z-[65]" />}>
          {modal === 'admin' && <AdminPanel open onClose={close} />}
          {modal === 'star' && <StarShop open onClose={close} />}
        </Suspense>
      )}
      <ToastStack notifications={notifications} onDismiss={dismissNotification} onOpen={openNotification} />
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
            <MessengerLayout />
          </CallProvider>
        </FriendsProvider>
      </MessengerProvider>
    </StarProvider>
  );
}
