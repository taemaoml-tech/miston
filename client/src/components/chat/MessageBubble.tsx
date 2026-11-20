import { Check, CheckCheck, Download, FileText, Flag, Forward, Mic, MoreHorizontal, Pencil, Pin, PinOff, Reply, Sticker, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { assetUrl } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import type { Message } from '../../types/models';
import { formatBytes, formatDuration, formatTime } from '../../utils/format';
import { REACTION_EMOJIS, REACTION_LABELS } from '../../utils/reactions';
import { Avatar } from '../common/Avatar';
import { StarDisplayName } from '../star/StarDisplayName';
import { VideoNote } from './VideoNote';
import { GameCard } from './GameCard';

interface MessageBubbleProps {
  message: Message;
  showSender: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canPin: boolean;
  highlight?: boolean;
  mentionedUsernames?: string[];
  onReact: (emoji: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onReply: () => void;
  onForward: () => void;
  onReport?: () => void;
  onJumpTo?: (messageId: string) => void;
}

export function MessageBubble({
  message,
  showSender,
  canEdit,
  canDelete,
  canPin,
  highlight = false,
  mentionedUsernames = [],
  onReact,
  onEdit,
  onDelete,
  onTogglePin,
  onReply,
  onForward,
  onReport,
  onJumpTo,
}: MessageBubbleProps) {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const own = message.senderId === user?.id;
  const sender = own ? user : message.sender;
  const cosmetics = own ? user?.cosmetics : message.sender?.cosmetics;
  const file = message.attachments?.[0];
  const fileUrl = assetUrl(file?.url);
  const fileName = file?.originalName;
  const fileSize = file?.sizeBytes;
  const isRead = Boolean(message.readBy?.some((id) => id !== user?.id));
  const reactions = message.reactions ?? [];
  const pinned = Boolean(message.pinnedAt);
  const isVideoNote = message.kind === 'video_note';

  const closeMenu = () => setMenuOpen(false);
  const react = (emoji: string) => { onReact(emoji); closeMenu(); };

  const attachment = () => {
    if (!fileUrl) return null;
    if (message.kind === 'image') return <a href={fileUrl} target="_blank" rel="noreferrer" className="media-frame mb-1 block overflow-hidden rounded-xl" aria-label="Відкрити зображення в новій вкладці"><img src={fileUrl} alt={fileName || 'Вкладення-зображення'} className="max-h-80 max-w-full object-cover" loading="lazy" /></a>;
    if (message.kind === 'video') return <video src={fileUrl} controls preload="metadata" className="media-frame mb-2 max-h-80 rounded-xl" aria-label={fileName || 'Вкладення-відео'} />;
    if (message.kind === 'voice') return <div className={`mb-1 flex min-w-56 items-center gap-2 ${own ? 'text-white' : ''}`}><Mic size={18} className="shrink-0 opacity-75" /><audio src={fileUrl} controls preload="metadata" className="h-9 max-w-64 flex-1" /><span className="text-[11px] opacity-70">{formatDuration(message.durationSeconds || 0)}</span></div>;
    if (message.kind === 'document') return <a href={fileUrl} target="_blank" rel="noreferrer" download={fileName || undefined} className={`mb-2 flex min-w-52 items-center gap-3 rounded-xl p-2.5 transition ${own ? 'bg-white/10 hover:bg-white/15' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/70 dark:hover:bg-slate-700'}`}><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${own ? 'bg-white/15' : 'bg-white text-accent-600 dark:bg-slate-600 dark:text-accent-400'}`}><FileText size={20} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{fileName || 'Документ'}</span><span className={`text-xs ${own ? 'text-white/65' : 'text-slate-500 dark:text-slate-400'}`}>{formatBytes(fileSize)}</span></span><Download size={17} className="shrink-0 opacity-60" /></a>;
    return null;
  };

  const mentionSet = new Set(mentionedUsernames.map((name) => name.toLocaleLowerCase('uk-UA')));
  const content: ReactNode = message.decryptionFailed
    ? <span className="italic opacity-75">🔒 Зашифроване повідомлення. Відновіть ключ у налаштуваннях E2EE.</span>
    : message.content
    ? message.content.split(/(@[a-zA-Z0-9_]{3,32})/g).map((part, index) => {
      if (!part.startsWith('@') || !mentionSet.has(part.slice(1).toLocaleLowerCase('uk-UA'))) return part;
      return (
        <span key={index} className={own ? 'rounded bg-white/25 px-0.5 font-semibold' : 'rounded bg-ios-blue/10 px-0.5 font-semibold text-ios-blue'}>
          {part}
        </span>
      );
    })
    : null;
  const forwardLabel = message.forwardedFrom ? (
    <p className={`mb-1 flex items-center gap-1.5 text-[11px] font-semibold ${own ? 'text-white/85' : 'text-ios-blue'}`}>
      <Forward size={12} className="shrink-0" aria-hidden />
      <span className="truncate">
        Переслано від {message.forwardedFrom.displayName}
        {message.forwardedFrom.conversationTitle ? ` · ${message.forwardedFrom.conversationTitle}` : ''}
      </span>
    </p>
  ) : null;
  const replyQuote = message.replyTo ? (
    <button
      type="button"
      onClick={() => { if (message.replyTo) onJumpTo?.(message.replyTo.id); }}
      title="Перейти до повідомлення"
      className={`mb-1.5 block w-full rounded-lg border-l-2 px-2 py-1 text-left text-xs transition ${own ? 'border-white/70 bg-white/10 hover:bg-white/15' : 'border-ios-blue/50 bg-ios-fill/10 hover:bg-ios-fill/20'}`}
    >
      <span className={`block truncate font-semibold ${own ? 'text-white' : 'text-ios-blue'}`}>{message.replyTo.senderName}</span>
      <span className={`block truncate ${own ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>
        {message.replyTo.deleted ? 'Повідомлення видалено' : message.replyTo.encrypted && !message.replyTo.content ? 'Зашифроване повідомлення' : message.replyTo.content || 'Вкладення'}
      </span>
    </button>
  ) : null;

  return (
    <div data-message-id={message.id} className={`group flex items-end gap-2 px-3 py-0.5 sm:px-6 ${own ? 'flex-row-reverse' : ''}`}>
      {!own && showSender ? <Avatar name={sender?.displayName || 'Учасник'} src={sender?.avatarUrl} size="sm" cosmetics={cosmetics} /> : !own ? <div className="w-8 shrink-0" /> : null}
      <div className={`min-w-0 max-w-[82%] sm:max-w-[70%] lg:max-w-[62%] ${own ? 'items-end' : ''}`}>
        {!own && showSender && <p className="mb-1 ml-1 text-xs font-semibold text-ios-blue"><StarDisplayName name={sender?.displayName || 'Учасник'} cosmetics={cosmetics} verified={sender?.isVerified} /></p>}
        <div className="relative flex flex-col">
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-label="Дії з повідомленням"
            aria-expanded={menuOpen}
            className={`ios-glass absolute -top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full shadow-sm transition hover:text-ios-blue focus:opacity-100 ${own ? 'right-1' : 'left-1'} ${menuOpen ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'}`}
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <>
              <button type="button" className="fixed inset-0 z-20 cursor-default" tabIndex={-1} aria-label="Закрити меню дій" onClick={closeMenu} />
              <div className={`ios-glass absolute top-full z-30 mt-1 w-64 rounded-[20px] p-1.5 shadow-soft animate-slide-up ${own ? 'right-0' : 'left-0'}`}>
                <div className="flex items-center justify-between gap-0.5">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button key={emoji} type="button" onClick={() => react(emoji)} title={REACTION_LABELS[emoji]} aria-label={REACTION_LABELS[emoji]} className="flex h-8 w-8 items-center justify-center rounded-lg text-lg transition hover:bg-slate-100 dark:hover:bg-slate-700">{emoji}</button>
                  ))}
                </div>
                <div className="my-1 h-px bg-slate-100 dark:bg-slate-700" />
                <button type="button" onClick={() => { onReply(); closeMenu(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"><Reply size={16} /> Відповісти</button>
                <button type="button" onClick={() => { onForward(); closeMenu(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"><Forward size={16} /> Переслати</button>
                {(canEdit || canPin || canDelete) && <div className="my-1 h-px bg-slate-100 dark:bg-slate-700" />}
                {canEdit && <button type="button" onClick={() => { onEdit(); closeMenu(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"><Pencil size={16} /> Редагувати</button>}
                {canPin && <button type="button" onClick={() => { onTogglePin(); closeMenu(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700">{pinned ? <PinOff size={16} /> : <Pin size={16} />}{pinned ? 'Зняти закріплення' : 'Закріпити'}</button>}
                {canDelete && <button type="button" onClick={() => { onDelete(); closeMenu(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"><Trash2 size={16} /> Видалити</button>}
                {!own && onReport && (
                  <>
                    <div className="my-1 h-px bg-slate-100 dark:bg-slate-700" />
                    <button type="button" onClick={() => { onReport(); closeMenu(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"><Flag size={16} /> Скаржитися</button>
                  </>
                )}
              </div>
            </>
          )}
          {message.kind === 'game' && message.gameId ? (
            <div className={`flex flex-col ${own ? 'items-end' : 'items-start'} ${highlight ? 'rounded-3xl ring-2 ring-amber-400 ring-offset-4 ring-offset-white dark:ring-offset-slate-900' : ''}`}>
              {(replyQuote || forwardLabel) && <div className="mb-1 w-64 max-w-full">{replyQuote}{forwardLabel}</div>}
              <GameCard message={message} />
              <div className="mt-1 flex items-center gap-1 px-1 text-[10px] text-slate-400 dark:text-slate-500">
                {pinned && <Pin size={11} aria-label="Закріплено" />}
                <time className="message-time" dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
                {own && <span className="inline-flex items-center gap-1" title={isRead ? 'Прочитано' : 'Доставлено'}>{isRead ? <CheckCheck size={13} aria-label="Прочитано" /> : <Check size={13} aria-label="Доставлено" />}<span>{isRead ? 'Прочитано' : 'Доставлено'}</span></span>}
              </div>
            </div>
          ) : message.kind === 'sticker' ? (
            <div className={`flex flex-col ${own ? 'items-end' : 'items-start'} ${highlight ? 'rounded-3xl ring-2 ring-amber-400 ring-offset-4 ring-offset-white dark:ring-offset-slate-900' : ''}`}>
              {(replyQuote || forwardLabel) && <div className="mb-1 w-64 max-w-full">{replyQuote}{forwardLabel}</div>}
              {message.sticker ? (
                <img
                  src={assetUrl(message.sticker.asset)}
                  alt={message.sticker.label}
                  title={`${message.sticker.label} — набір «${message.sticker.packName}»`}
                  loading="lazy"
                  className="h-28 w-28 object-contain drop-shadow-sm sm:h-32 sm:w-32"
                />
              ) : (
                <div className="flex h-28 w-28 flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-300 px-2 text-center text-[10px] leading-tight text-slate-400 dark:border-slate-600 dark:text-slate-500">
                  <Sticker size={22} aria-hidden />
                  <span>Стікер «{message.content || 'без назви'}» більше недоступний</span>
                </div>
              )}
              <div className="mt-1 flex items-center gap-1 px-1 text-[10px] text-slate-400 dark:text-slate-500">
                {pinned && <Pin size={11} aria-label="Закріплено" />}
                <time className="message-time" dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
                {own && <span className="inline-flex items-center gap-1" title={isRead ? 'Прочитано' : 'Доставлено'}>{isRead ? <CheckCheck size={13} aria-label="Прочитано" /> : <Check size={13} aria-label="Доставлено" />}<span>{isRead ? 'Прочитано' : 'Доставлено'}</span></span>}
              </div>
            </div>
          ) : isVideoNote && fileUrl ? (
            <div className={`flex flex-col ${own ? 'items-end' : 'items-start'} ${highlight ? 'rounded-3xl ring-2 ring-amber-400 ring-offset-4 ring-offset-white dark:ring-offset-slate-900' : ''}`}>
              {(replyQuote || forwardLabel) && <div className="mb-1 w-64 max-w-full">{replyQuote}{forwardLabel}</div>}
              <VideoNote src={fileUrl} durationSeconds={message.durationSeconds} label={own ? 'ваш' : sender?.displayName || 'співрозмовника'} />
              <div className="mt-1 flex items-center gap-1 px-1 text-[10px] text-slate-400 dark:text-slate-500">
                {pinned && <Pin size={11} aria-label="Закріплено" />}
                {message.editedAt && <span className="italic">змінено</span>}
                <time className="message-time" dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
                {own && <span className="inline-flex items-center gap-1" title={isRead ? 'Прочитано' : 'Доставлено'}>{isRead ? <CheckCheck size={13} aria-label="Прочитано" /> : <Check size={13} aria-label="Доставлено" />}<span>{isRead ? 'Прочитано' : 'Доставлено'}</span></span>}
              </div>
            </div>
          ) : (
            <div className={`message-bubble relative rounded-[18px] px-3.5 py-2 text-[15px] leading-5 shadow-sm after:pointer-events-none after:absolute after:-bottom-0.5 after:h-3 after:w-3 after:content-[''] ${own ? 'rounded-br-[6px] bg-ios-blue text-white after:right-[-5px] after:rounded-br-[11px] after:bg-ios-blue' : 'rounded-bl-[6px] bg-ios-incoming text-ios-label after:left-[-5px] after:rounded-bl-[11px] after:bg-ios-incoming'} ${highlight ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-ios-bg' : ''}`}>
              {replyQuote}
              {forwardLabel}
              {attachment()}
              {content && <p className="message-content whitespace-pre-wrap break-words text-sm leading-5">{content}</p>}
              <div className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${own ? 'text-white/65' : 'text-slate-400 dark:text-slate-500'}`}>
                {pinned && <Pin size={11} aria-label="Закріплено" />}
                {message.editedAt && <span className="italic">змінено</span>}
                <time className="message-time" dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
                {own && <span className="inline-flex items-center gap-1" title={isRead ? 'Прочитано' : 'Доставлено'}>{isRead ? <CheckCheck size={13} aria-label="Прочитано" /> : <Check size={13} aria-label="Доставлено" />}<span>{isRead ? 'Прочитано' : 'Доставлено'}</span></span>}
              </div>
            </div>
          )}
          {reactions.length > 0 && (
            <div className={`mt-1 flex flex-wrap gap-1 ${own ? 'justify-end' : ''}`}>
              {reactions.map((reaction) => {
                const mine = Boolean(user?.id && reaction.userIds.includes(user.id));
                return (
                  <button
                    key={reaction.emoji}
                    type="button"
                    onClick={() => onReact(reaction.emoji)}
                    aria-pressed={mine}
                    aria-label={`${REACTION_LABELS[reaction.emoji] ?? reaction.emoji}: ${reaction.userIds.length}`}
                    className={`ios-glass flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition ${mine ? 'text-ios-blue ring-1 ring-ios-blue/30' : 'text-ios-secondary hover:text-ios-label'}`}
                  >
                    <span>{reaction.emoji}</span>
                    <span className="tabular-nums">{reaction.userIds.length}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
