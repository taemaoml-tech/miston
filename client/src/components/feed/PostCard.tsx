import { Crown, MessageCircle, MoreHorizontal, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { assetUrl } from '../../api/client';
import type { FeedPost } from '../../types/feed';
import { formatConversationTime } from '../../utils/format';
import { Avatar } from '../common/Avatar';
import { PollWidget } from './PollWidget';

const categoryLabels: Record<FeedPost['category'], string> = {
  projects: 'Ігри та проєкти',
  polls: 'Опитування',
  subscriptions: 'Підписки',
};

const reactions = ['❤️', '🔥', '👏', '😂', '💡', '✨'];

interface PostCardProps {
  post: FeedPost;
  currentUserId: string;
  onReact: (postId: string, emoji: string) => Promise<void>;
  onVote: (postId: string, optionIndex: number) => Promise<void>;
  onComments: (post: FeedPost) => void;
  onChat: (userId: string) => void;
  onRemove?: (postId: string) => void;
}

export function PostCard({ post, currentUserId, onReact, onVote, onComments, onChat, onRemove }: PostCardProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const isMine = post.author.id === currentUserId;
  const liked = post.reactions.some((reaction) => reaction.emoji === '❤️' && reaction.mine);
  const image = assetUrl(post.imageUrl);

  async function react(emoji: string) {
    if (busy) return;
    setBusy(true);
    try { await onReact(post.id, emoji); }
    finally { setBusy(false); }
  }

  return (
    <article className="feed-card feed-post-enter rounded-3xl border p-4 sm:p-5" aria-label={`Пост від ${post.author.displayName}`}>
      <header className="flex items-start gap-3">
        <Avatar name={post.author.displayName} src={post.author.avatarUrl} cosmetics={post.author.cosmetics} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-bold">{post.author.displayName}</span>
            {post.author.isPremium ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-100 to-yellow-200 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:from-amber-500/25 dark:to-yellow-500/20 dark:text-amber-200">
                <Crown size={11} /> Преміум
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                <span aria-hidden="true">💛</span> Крута людина
              </span>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-ios-secondary">
            <span>@{post.author.username}</span><span aria-hidden="true">·</span>
            <time dateTime={post.createdAt}>{formatConversationTime(post.createdAt)}</time>
            <span aria-hidden="true">·</span><span>{categoryLabels[post.category]}</span>
          </p>
        </div>
        {isMine && onRemove && (
          <div className="relative shrink-0">
            <button type="button" className="icon-btn h-8 w-8" onClick={() => setMenuOpen((value) => !value)} aria-label="Дії з постом" aria-expanded={menuOpen}><MoreHorizontal size={18} /></button>
            {menuOpen && (
              <>
                <button type="button" className="fixed inset-0 z-10 cursor-default" aria-label="Закрити меню" onClick={() => setMenuOpen(false)} />
                <button type="button" className="absolute right-0 top-9 z-20 flex items-center gap-2 rounded-xl border bg-ios-bg px-3 py-2 text-xs font-medium text-rose-600 shadow-lg" onClick={() => { setMenuOpen(false); onRemove(post.id); }}>
                  <Trash2 size={14} /> Видалити пост
                </button>
              </>
            )}
          </div>
        )}
      </header>

      {post.text && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-ios-label">{post.text}</p>}
      {image && <img src={image} alt={post.text ? 'Зображення до поста' : 'Зображення в пості'} className="feed-image mt-3" loading="lazy" />}
      {post.poll && <PollWidget poll={post.poll} onVote={(index) => onVote(post.id, index)} />}

      <footer className="mt-4 flex flex-wrap items-center gap-2 border-t border-ios-separator/10 pt-3">
        <button
          type="button"
          onClick={() => void react('❤️')}
          disabled={busy}
          aria-label={liked ? 'Прибрати лайк' : 'Поставити лайк'}
          aria-pressed={liked}
          className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 text-sm transition active:scale-95 disabled:opacity-60 ${liked ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300' : 'bg-ios-fill/10 text-ios-secondary hover:bg-ios-fill/20'}`}
        >
          <span aria-hidden="true">❤️</span>
          {post.reactions.reduce((sum, reaction) => sum + reaction.count, 0) > 0 && <span className="text-xs font-semibold">{post.reactions.reduce((sum, reaction) => sum + reaction.count, 0)}</span>}
        </button>

        <div className="relative">
          <button type="button" className="flex h-8 items-center gap-1 rounded-full bg-ios-fill/10 px-2.5 text-xs font-medium text-ios-secondary transition hover:bg-ios-fill/20" onClick={() => setPickerOpen((value) => !value)} aria-label="Додати реакцію" aria-expanded={pickerOpen}>
            <span aria-hidden="true">☺</span> Реакції
          </button>
          {pickerOpen && (
            <>
              <button type="button" className="fixed inset-0 z-10 cursor-default" aria-label="Закрити реакції" onClick={() => setPickerOpen(false)} />
              <div className="absolute bottom-10 left-0 z-20 flex gap-1 rounded-2xl border bg-ios-bg p-1.5 shadow-xl animate-fade-in">
                {reactions.map((emoji) => (
                  <button type="button" key={emoji} disabled={busy} onClick={() => { setPickerOpen(false); void react(emoji); }} className="flex h-8 w-8 items-center justify-center rounded-xl text-lg transition hover:scale-110 hover:bg-ios-fill/10" aria-label={`Реакція ${emoji}`}>{emoji}</button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="hidden flex-wrap items-center gap-1 sm:flex">
          {post.reactions.filter((reaction) => reaction.emoji !== '❤️').slice(0, 4).map((reaction) => (
            <button type="button" key={reaction.emoji} disabled={busy} onClick={() => void react(reaction.emoji)} aria-pressed={reaction.mine} className={`flex h-8 items-center gap-1 rounded-full px-2 text-xs transition ${reaction.mine ? 'bg-ios-blue/12 text-ios-blue' : 'bg-ios-fill/10 text-ios-secondary'}`}>
              <span aria-hidden="true">{reaction.emoji}</span>{reaction.count}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => onComments(post)} className="flex h-8 items-center gap-1.5 rounded-full bg-ios-fill/10 px-2.5 text-xs font-medium text-ios-secondary transition hover:bg-ios-fill/20" aria-label={`Відкрити коментарі: ${post.commentCount}`}>
            <MessageCircle size={15} /> {post.commentCount}
          </button>
          {!isMine && (
            <button type="button" onClick={() => onChat(post.author.id)} className="flex h-8 items-center gap-1.5 rounded-full bg-ios-blue/10 px-3 text-xs font-semibold text-ios-blue transition hover:bg-ios-blue/20" aria-label={`Написати в чат: ${post.author.displayName}`}>
              <Send size={14} /> <span className="hidden sm:inline">Написати в чат</span><span className="sm:hidden">Чат</span>
            </button>
          )}
        </div>
      </footer>
    </article>
  );
}
