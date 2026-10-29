import { ArrowLeft, ChevronDown, Flag, Hash, Info, LoaderCircle, MessageSquareText, Phone, Pin, PinOff, Users, Video, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { api } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { useCall } from '../../contexts/CallContext';
import { useMessenger } from '../../contexts/MessengerContext';
import { useSocket } from '../../contexts/SocketContext';
import { useStar } from '../../contexts/StarContext';
import type { Message, TypingEvent } from '../../types/models';
import type { Conversation } from '../../types/models';
import { errorMessage, formatDay, formatTime } from '../../utils/format';
import { configString } from '../../utils/star';
import { Avatar } from '../common/Avatar';
import { EmptyState } from '../common/EmptyState';
import { Modal } from '../common/Modal';
import { Spinner } from '../common/Spinner';
import type { ConversationAction } from './ConversationActionModal';
import { MessageEffectBurst } from '../star/MessageEffectBurst';
import { StarDisplayName } from '../star/StarDisplayName';
import { Composer } from './Composer';
import { MessageBubble } from './MessageBubble';

export function ChatWindow({ onOpenUser, onReport, onAction }: { onOpenUser: (id: string) => void; onReport: (target: { userId?: string; messageId?: string }) => void; onAction: (conversation: Conversation, action: ConversationAction) => void }) {
  const { user } = useAuth();
  const { activeConversation, closeMobileChat, markReadLocal, presence, activeServer, notify, conversations, reloadToken } = useMessenger();
  const { socket, connected } = useSocket();
  const { phase: callPhase, startCall } = useCall();
  const { overview, messageEffect } = useStar();
  const [messages, setMessages] = useState<Message[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState('');
  const [typing, setTyping] = useState<Record<string, string>>({});
  const [showInfo, setShowInfo] = useState(false);
  const [editing, setEditing] = useState<Message | null>(null);
  const [pins, setPins] = useState<Message[]>([]);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [pinsLoading, setPinsLoading] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [effectBurst, setEffectBurst] = useState(0);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [forwardingTo, setForwardingTo] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousId = useRef<string | null>(null);
  const lastReadId = useRef<string | null>(null);
  const id = activeConversation?.id;

  const appendMessage = useCallback((message: Message) => {
    setMessages((current) => current.some((item) => item.id === message.id) ? current.map((item) => item.id === message.id ? message : item) : [...current, message]);
  }, []);

  const applyMessage = useCallback((message: Message) => {
    setMessages((current) => current.map((item) => item.id === message.id ? message : item));
    setPins((current) => {
      const rest = current.filter((item) => item.id !== message.id);
      return message.pinnedAt
        ? [message, ...rest].sort((a, b) => new Date(b.pinnedAt || 0).getTime() - new Date(a.pinnedAt || 0).getTime())
        : rest;
    });
    setEditing((current) => current && current.id === message.id ? message : current);
  }, []);

  const removeLocalMessage = useCallback((messageId: string) => {
    setMessages((current) => current.filter((message) => message.id !== messageId));
    setPins((current) => current.filter((message) => message.id !== messageId));
    setEditing((current) => current && current.id === messageId ? null : current);
  }, []);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true); setError(''); setMessages([]); setTyping({}); setShowInfo(false); lastReadId.current = null;
    setEditing(null); setPins([]); setPinsOpen(false); setHighlightId(null); setPendingDelete(null);
    setReplyTo(null); setForwarding(null); setForwardingTo('');
    void api.conversations.messages(id).then((page) => {
      if (!active) return;
      setMessages(page.items); setCursor(page.nextCursor);
      previousId.current = id;
    }).catch((cause) => { if (active) setError(errorMessage(cause)); }).finally(() => { if (active) setLoading(false); });
    setPinsLoading(true);
    void api.conversations.pins(id).then((result) => {
      if (active) setPins(result.items);
    }).catch(() => undefined).finally(() => { if (active) setPinsLoading(false); });
    return () => { active = false; };
  }, [id, reloadToken]);

  useEffect(() => {
    if (!socket || !id) return;
    socket.emit('conversation:join', { conversationId: id });
    const onMessage = (payload: Message | { message: Message }) => {
      const message = 'message' in payload ? payload.message : payload;
      if (message.conversationId === id) appendMessage(message);
    };
    const onTyping = (event: TypingEvent) => {
      if (event.conversationId !== id || event.userId === user?.id) return;
      const name = event.user?.displayName || activeConversation?.members.find((member) => member.id === event.userId)?.displayName || 'Хтось';
      setTyping((current) => {
        const next = { ...current };
        if (event.isTyping) next[event.userId] = name; else delete next[event.userId];
        return next;
      });
      if (event.isTyping) window.setTimeout(() => setTyping((current) => { const next = { ...current }; delete next[event.userId]; return next; }), 3500);
    };
    const onRead = (event: { conversationId: string; messageId?: string; userId?: string }) => {
      if (event.conversationId !== id || !event.userId || event.userId === user?.id) return;
      const readBoundary = event.messageId ? BigInt(event.messageId) : null;
      setMessages((current) => current.map((message) => {
        if (message.senderId !== user?.id) return message;
        if (readBoundary !== null && BigInt(message.id) > readBoundary) return message;
        return { ...message, readBy: [...new Set([...(message.readBy || []), event.userId!])] };
      }));
    };
    const onUpdated = (payload: { message?: Message }) => {
      if (payload.message?.conversationId === id) applyMessage(payload.message);
    };
    const onReactions = (payload: { message?: Message }) => {
      if (payload.message?.conversationId === id) applyMessage(payload.message);
    };
    const onDeleted = (payload: { conversationId?: string; messageId?: string }) => {
      if (payload.conversationId === id && payload.messageId) removeLocalMessage(payload.messageId);
    };
    socket.on('message:new', onMessage); socket.on('typing', onTyping); socket.on('message:read', onRead);
    socket.on('message:updated', onUpdated); socket.on('message:reactions', onReactions); socket.on('message:deleted', onDeleted);
    return () => {
      socket.off('message:new', onMessage); socket.off('typing', onTyping); socket.off('message:read', onRead);
      socket.off('message:updated', onUpdated); socket.off('message:reactions', onReactions); socket.off('message:deleted', onDeleted);
    };
  }, [socket, id, user?.id, appendMessage, activeConversation?.members, applyMessage, removeLocalMessage]);

  useLayoutEffect(() => {
    if (!loading && previousId.current === id && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      previousId.current = null;
    }
  }, [loading, id]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !messages.length) return;
    const last = messages[messages.length - 1];
    if (element.scrollHeight - element.scrollTop - element.clientHeight < 180 || last.senderId === user?.id) element.scrollTo({ top: element.scrollHeight, behavior: previousId.current === null && messages.length > 1 ? 'smooth' : 'auto' });
  }, [messages, user?.id]);

  useEffect(() => {
    if (!id || document.hidden) return;
    const latestIncoming = [...messages].reverse().find((message) => message.senderId !== user?.id);
    if (!latestIncoming || latestIncoming.id === lastReadId.current) return;
    lastReadId.current = latestIncoming.id;
    markReadLocal(id);
    void api.conversations.read(id, latestIncoming.id).catch(() => { lastReadId.current = null; });
  }, [id, messages, user?.id, markReadLocal]);

  async function loadOlder() {
    if (!id || !cursor || loadingOlder) return;
    const element = scrollRef.current;
    const oldHeight = element?.scrollHeight || 0;
    setLoadingOlder(true);
    try {
      const page = await api.conversations.messages(id, cursor);
      setMessages((current) => [...page.items, ...current]); setCursor(page.nextCursor);
      requestAnimationFrame(() => { if (element) element.scrollTop = element.scrollHeight - oldHeight; });
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setLoadingOlder(false); }
  }

  useEffect(() => {
    if (!highlightId) return;
    const element = scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${highlightId}"]`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = window.setTimeout(() => setHighlightId(null), 2400);
    return () => window.clearTimeout(timer);
  }, [highlightId, messages.length]);

  async function reactTo(message: Message, emoji: string) {
    if (!id) return;
    try {
      const result = await api.conversations.toggleReaction(id, message.id, emoji);
      applyMessage(result.message);
    } catch (cause) { notify('Не вдалося поставити реакцію', errorMessage(cause)); }
  }

  async function togglePin(message: Message) {
    if (!id) return;
    try {
      const result = message.pinnedAt
        ? await api.conversations.unpin(id, message.id)
        : await api.conversations.pin(id, message.id);
      applyMessage(result.message);
    } catch (cause) { notify('Не вдалося змінити закріплення', errorMessage(cause)); }
  }

  function deleteMessage(message: Message) {
    if (!id) return;
    setPendingDelete(message);
  }

  async function confirmDelete() {
    if (!id || !pendingDelete) return;
    setDeleting(true);
    try {
      await api.conversations.deleteMessage(id, pendingDelete.id);
      removeLocalMessage(pendingDelete.id);
      setPendingDelete(null);
      notify('Повідомлення видалено');
    } catch (cause) { notify('Не вдалося видалити повідомлення', errorMessage(cause)); }
    finally { setDeleting(false); }
  }

  async function jumpToMessage(messageId: string) {
    if (!id) return;
    setPinsOpen(false);
    if (messages.some((message) => message.id === messageId)) { setHighlightId(messageId); return; }
    let accumulated = messages;
    let next = cursor;
    try {
      for (let attempt = 0; attempt < 8 && next; attempt += 1) {
        const page = await api.conversations.messages(id, next);
        accumulated = [...page.items, ...accumulated];
        next = page.nextCursor;
        if (accumulated.some((message) => message.id === messageId)) break;
      }
    } catch (cause) { notify('Не вдалося завантажити повідомлення', errorMessage(cause)); return; }
    setMessages(accumulated); setCursor(next);
    if (accumulated.some((message) => message.id === messageId)) setHighlightId(messageId);
    else notify('Повідомлення поза завантаженою історією', 'Прокрутіть історію вище, щоб знайти його.');
  }

  async function forwardMessage(targetId: string) {
    if (!id || !forwarding || forwardingTo) return;
    setForwardingTo(targetId);
    try {
      const result = await api.conversations.forward(id, forwarding.id, targetId);
      if (targetId === id) appendMessage(result.message);
      const target = conversations.find((conversation) => conversation.id === targetId);
      notify('Переслано', target ? `Повідомлення надіслано в «${target.title}»` : undefined);
      setForwarding(null);
    } catch (cause) { notify('Не вдалося переслати повідомлення', errorMessage(cause)); }
    finally { setForwardingTo(''); }
  }

  if (!activeConversation) return null;
  const other = activeConversation.kind === 'direct' ? activeConversation.members.find((member) => member.id !== user?.id) : undefined;
  const online = other ? (presence[other.id] ?? other.online) : undefined;
  const typingNames = Object.values(typing);
  const myRole = activeConversation.members.find((member) => member.id === user?.id)?.role;
  const isManager = activeConversation.kind !== 'direct' && (myRole === 'owner' || myRole === 'admin');
  const canPinHere = activeConversation.kind === 'direct' || isManager;
  const deleteLabel = activeConversation.kind === 'group' ? (isManager ? 'Видалити гру' : 'Покинути гру') : 'Видалити чат';
  const subtitle = typingNames.length ? `${typingNames.join(', ')} ${typingNames.length === 1 ? 'друкує' : 'друкують'}…` : activeConversation.kind === 'direct' ? (online ? 'Онлайн' : 'Офлайн') : `${activeConversation.members.length || activeServer?.memberCount || 0} учасників`;
  const chatBackground = overview?.equipped?.chat_background;
  const chatBackgroundStyle = chatBackground ? {
    '--chat-image-light': configString(chatBackground.config, 'light'),
    '--chat-image-dark': configString(chatBackground.config, 'dark'),
  } as CSSProperties : undefined;
  const directCosmetics = other?.cosmetics;

  return (
    <section className="relative flex h-full min-w-0 flex-1 flex-col" aria-label={`Розмова з ${activeConversation.title}`}>
      <header className="z-10 flex h-16 shrink-0 items-center gap-2 border-b bg-white/90 px-2 backdrop-blur-xl dark:bg-slate-900/90 sm:px-4">
        <button type="button" className="icon-btn md:hidden" onClick={closeMobileChat} aria-label="Назад до розмов"><ArrowLeft size={21} /></button>
        <Avatar name={activeConversation.title} src={activeConversation.avatarUrl} online={online} square={activeConversation.kind !== 'direct'} cosmetics={directCosmetics} />
        <button type="button" className="min-w-0 flex-1 rounded-lg py-1 text-left" onClick={() => setShowInfo((value) => !value)}>
          <h1 className="flex items-center gap-1.5 truncate text-sm font-semibold sm:text-[15px]">{activeConversation.kind === 'channel' && <Hash size={15} className="shrink-0 text-slate-400" />}{activeConversation.kind === 'direct' ? <StarDisplayName name={activeConversation.title} cosmetics={directCosmetics} verified={other?.isVerified} /> : activeConversation.title}</h1>
          <p className={`mt-0.5 truncate text-xs ${typingNames.length || online ? 'text-accent-600 dark:text-accent-400' : 'text-slate-400'}`}>{subtitle}</p>
        </button>
        {!connected && <span className="hidden rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 sm:block">Підключення…</span>}
        {activeConversation.kind !== 'channel' && (
          <>
            <button
              type="button"
              className="icon-btn"
              disabled={callPhase !== 'idle'}
              onClick={() => {
                if (activeConversation.kind === 'direct' && other && online === false) {
                  notify('Користувач не в мережі', 'Дзвінок можливий, коли співрозмовник онлайн.');
                  return;
                }
                void startCall(activeConversation.id, 'audio');
              }}
              aria-label="Аудіодзвінок"
              title={callPhase === 'idle' ? 'Аудіодзвінок' : 'Завершіть поточний дзвінок'}
            >
              <Phone size={19} />
            </button>
            <button
              type="button"
              className="icon-btn"
              disabled={callPhase !== 'idle'}
              onClick={() => {
                if (activeConversation.kind === 'direct' && other && online === false) {
                  notify('Користувач не в мережі', 'Дзвінок можливий, коли співрозмовник онлайн.');
                  return;
                }
                void startCall(activeConversation.id, 'video');
              }}
              aria-label="Відеодзвінок"
              title={callPhase === 'idle' ? 'Відеодзвінок' : 'Завершіть поточний дзвінок'}
            >
              <Video size={20} />
            </button>
          </>
        )}
        <button type="button" className="icon-btn relative" onClick={() => setPinsOpen(true)} aria-label={`Закріплені повідомлення${pins.length ? `: ${pins.length}` : ''}`}><Pin size={19} />{pins.length > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-accent-500 px-1 text-[9px] font-bold leading-4 text-white">{pins.length > 9 ? '9+' : pins.length}</span>}</button>
        <button type="button" className={`icon-btn ${showInfo ? 'bg-accent-50 text-accent-600 dark:bg-accent-500/10' : ''}`} onClick={() => setShowInfo((value) => !value)} aria-label="Деталі розмови" aria-expanded={showInfo}><Info size={20} /></button>
      </header>

      <div ref={scrollRef} className="chat-backdrop subtle-scrollbar relative min-h-0 flex-1 overflow-y-auto overscroll-contain py-3" style={chatBackgroundStyle}>
        <MessageEffectBurst effect={messageEffect} burst={effectBurst} />
        {loading ? <Spinner label="Завантаження повідомлень…" className="h-full" /> : error && !messages.length ? <EmptyState icon={MessageSquareText} title="Повідомлення недоступні" description={error} action={<button type="button" className="secondary-btn" onClick={() => window.location.reload()}>Спробувати ще раз</button>} /> : (
          <div className="mx-auto max-w-5xl">
            {cursor && <div className="pb-4 text-center"><button type="button" onClick={() => void loadOlder()} disabled={loadingOlder} className="secondary-btn min-h-8 px-3 py-1.5 text-xs">{loadingOlder ? <LoaderCircle size={14} className="animate-spin" /> : <ChevronDown size={14} className="rotate-180" />} Завантажити попередні</button></div>}
            {!messages.length ? <EmptyState icon={MessageSquareText} title="Почніть розмову" description={`Надішліть повідомлення в ${activeConversation.title}. Повідомлення та вкладення з'являться тут у реальному часі.`} /> : messages.map((message, index) => {
              const previous = messages[index - 1];
              const newDay = !previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString();
              const showSender = activeConversation.kind !== 'direct' && (!previous || previous.senderId !== message.senderId || newDay);
              return <div key={message.id}>{newDay && <div className="sticky top-1 z-[5] my-3 flex justify-center"><span className="rounded-full bg-slate-200/90 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur dark:bg-slate-800/90 dark:text-slate-300">{formatDay(message.createdAt)}</span></div>}<MessageBubble
                message={message}
                showSender={showSender}
                canEdit={message.senderId === user?.id && message.kind !== 'voice' && message.kind !== 'video_note' && message.kind !== 'sticker'}
                canDelete={message.senderId === user?.id || isManager}
                canPin={canPinHere}
                highlight={highlightId === message.id}
                mentionedUsernames={(message.mentions ?? []).map((memberId) => activeConversation.members.find((member) => member.id === memberId)?.username).filter((name): name is string => Boolean(name))}
                onReact={(emoji) => void reactTo(message, emoji)}
                onEdit={() => setEditing(message)}
                onDelete={() => void deleteMessage(message)}
                onTogglePin={() => void togglePin(message)}
                onReply={() => { setEditing(null); setReplyTo(message); }}
                onForward={() => setForwarding(message)}
                onReport={message.senderId !== user?.id ? () => onReport({ messageId: message.id, userId: message.senderId ?? undefined }) : undefined}
                onJumpTo={(messageId) => void jumpToMessage(messageId)}
              /></div>;
            })}
            {typingNames.length > 0 && <div className="flex items-center gap-2 px-6 py-3 text-xs text-slate-500"><span className="flex gap-1">{[0, 1, 2].map((dot) => <span key={dot} className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-400" style={{ animationDelay: `${dot * 120}ms` }} />)}</span>{typingNames.join(', ')} {typingNames.length === 1 ? 'друкує' : 'друкують'}</div>}
          </div>
        )}
      </div>
      <Composer conversationId={activeConversation.id} onSent={(message) => { appendMessage(message); if (message.senderId === user?.id) setEffectBurst((value) => value + 1); }} editing={editing} onCancelEdit={() => setEditing(null)} onEdited={applyMessage} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} members={activeConversation.members} />

      {showInfo && <aside className="absolute bottom-0 right-0 top-16 z-20 w-80 max-w-[90%] overflow-y-auto border-l bg-white p-5 shadow-soft animate-fade-in dark:bg-slate-900"><div className="flex items-center justify-between"><h2 className="font-semibold">Деталі розмови</h2><button type="button" className="icon-btn h-8 w-8" onClick={() => setShowInfo(false)} aria-label="Закрити деталі"><X size={18} /></button></div><div className="flex flex-col items-center border-b py-6 text-center"><Avatar name={activeConversation.title} src={activeConversation.avatarUrl} size="xl" online={online} square={activeConversation.kind !== 'direct'} cosmetics={directCosmetics} /><h3 className="mt-3 font-semibold">{activeConversation.kind === 'direct' ? <StarDisplayName name={activeConversation.title} cosmetics={directCosmetics} verified={other?.isVerified} /> : activeConversation.title}</h3><p className="mt-1 text-sm text-slate-500">{subtitle}</p>{other?.bio && <p className="mt-3 text-sm leading-6 text-slate-500">{other.bio}</p>}{other && <button type="button" className="secondary-btn mt-4" onClick={() => { setShowInfo(false); onOpenUser(other.id); }}>Переглянути профіль</button>}<div className="mt-4 grid w-full gap-2"><button type="button" className="secondary-btn" onClick={() => onAction(activeConversation, 'clear')}>Очистити історію</button>{activeConversation.kind !== 'channel' && <button type="button" className="secondary-btn text-rose-600 hover:text-rose-700 dark:text-rose-400" onClick={() => onAction(activeConversation, 'delete')}>{deleteLabel}</button>}{other && <button type="button" className="secondary-btn flex items-center justify-center gap-2" onClick={() => { setShowInfo(false); onReport({ userId: other.id }); }}><Flag size={15} /> Скаржитися на співрозмовника</button>}</div></div>{activeConversation.kind !== 'direct' && <div className="pt-5"><h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400"><Users size={14} /> Учасники</h3>{activeConversation.members.length ? <ul className="space-y-1">{activeConversation.members.map((member) => <li key={member.id}><button type="button" disabled={member.id === user?.id} onClick={() => { setShowInfo(false); onOpenUser(member.id); }} className="flex w-full items-center gap-3 rounded-xl p-1 text-left transition hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-transparent dark:hover:bg-slate-800"><Avatar name={member.displayName} src={member.avatarUrl} size="sm" online={presence[member.id] ?? member.online} cosmetics={member.cosmetics} /><div className="min-w-0"><p className="truncate text-sm font-medium"><StarDisplayName name={member.displayName} cosmetics={member.cosmetics} verified={member.isVerified} /></p><p className="truncate text-xs text-slate-400">@{member.username}</p></div></button></li>)}</ul> : <p className="text-sm text-slate-400">Деталі учасників недоступні.</p>}</div>}</aside>}

      <Modal open={pinsOpen} onClose={() => setPinsOpen(false)} title="Закріплені повідомлення" description={pins.length ? `У цій розмові закріплено: ${pins.length}` : 'Тут зберігаються важливі повідомлення розмови.'} wide>
        {pinsLoading ? <Spinner label="Завантаження закріплених…" /> : pins.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">Ще немає закріплених повідомлень.</p>
        ) : (
          <ul className="space-y-2">
            {pins.map((pin) => (
              <li key={pin.id} className="rounded-2xl border p-3 dark:border-slate-700">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span className="font-semibold text-slate-600 dark:text-slate-300"><StarDisplayName name={pin.sender?.displayName || 'Учасник'} cosmetics={pin.sender?.cosmetics} verified={pin.sender?.isVerified} /></span>
                      <time dateTime={pin.createdAt}>{formatTime(pin.createdAt)}</time>
                      {pin.pinnedAt && <span className="flex items-center gap-1"><Pin size={11} /> закріплено</span>}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-200">{pin.content || (pin.kind === 'image' ? 'Фото' : pin.kind === 'video' ? 'Відео' : pin.kind === 'video_note' ? 'Відеокружечок' : pin.kind === 'voice' ? 'Голосове повідомлення' : pin.kind === 'sticker' ? 'Стікер' : 'Документ')}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" className="secondary-btn min-h-8 px-2.5 py-1 text-xs" onClick={() => void jumpToMessage(pin.id)}>Перейти</button>
                    {canPinHere && <button type="button" className="icon-btn h-8 w-8" onClick={() => void togglePin(pin)} aria-label="Зняти закріплення"><PinOff size={15} /></button>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal open={Boolean(forwarding)} onClose={() => { if (!forwardingTo) setForwarding(null); }} title="Переслати повідомлення" description={forwarding ? `Оберіть розмову для «${forwarding.content || 'вкладення'}»` : undefined} wide>
        {conversations.filter((conversation) => conversation.kind !== 'channel').length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">Немає розмов для пересилання.</p>
        ) : (
          <ul className="space-y-1">
            {conversations.filter((conversation) => conversation.kind !== 'channel').map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  disabled={Boolean(forwardingTo)}
                  onClick={() => void forwardMessage(conversation.id)}
                  className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-slate-50 disabled:opacity-60 dark:hover:bg-slate-800"
                >
                  <Avatar name={conversation.title} src={conversation.avatarUrl} size="sm" square={conversation.kind !== 'direct'} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{conversation.title}</span>
                    <span className="block text-xs text-slate-400">{conversation.kind === 'group' ? 'Група' : 'Особиста розмова'}</span>
                  </span>
                  {forwardingTo === conversation.id && <LoaderCircle size={16} className="animate-spin text-accent-500" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal open={Boolean(pendingDelete)} onClose={() => { if (!deleting) setPendingDelete(null); }} title="Видалити повідомлення?" description="Повідомлення зникне для всіх учасників. Дію не можна скасувати.">
        {pendingDelete?.content && <p className="mb-4 whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">{pendingDelete.content}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="secondary-btn" onClick={() => setPendingDelete(null)} disabled={deleting}>Скасувати</button>
          <button type="button" className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-60" onClick={() => void confirmDelete()} disabled={deleting}>{deleting ? 'Видалення…' : 'Видалити'}</button>
        </div>
      </Modal>
    </section>
  );
}
