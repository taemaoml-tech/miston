import { MessageCircle, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../../api';
import type { FeedAuthor, FeedComment, FeedPost } from '../../types/feed';
import { errorMessage, formatConversationTime } from '../../utils/format';
import { Avatar } from '../common/Avatar';
import { Modal } from '../common/Modal';
import { Spinner } from '../common/Spinner';

export function CommentsModal({ post, currentUser, onClose, onCountChange, onOpenUser }: {
  post: FeedPost | null;
  currentUser: FeedAuthor;
  onClose: () => void;
  onCountChange: (postId: string, count: number) => void;
  onOpenUser: (userId: string) => void;
}) {
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!post) return;
    let alive = true;
    setComments([]);
    setText('');
    setError('');
    setLoading(true);
    api.feed.comments(post.id)
      .then((result) => { if (alive) setComments(result.comments); })
      .catch((cause) => { if (alive) setError(errorMessage(cause)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [post]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!post || !text.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.feed.addComment(post.id, text.trim());
      setComments((current) => [...current, {
        id: result.commentId,
        postId: post.id,
        author: currentUser,
        text: text.trim(),
        createdAt: new Date().toISOString(),
      }]);
      onCountChange(post.id, result.commentCount);
      setText('');
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={Boolean(post)} onClose={onClose} title="Коментарі" description={post ? `До поста від ${post.author.displayName}` : undefined}>
      {loading ? <Spinner label="Завантажуємо коментарі…" className="py-12" /> : comments.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center text-ios-secondary">
          <MessageCircle size={30} className="mb-3 opacity-40" />
          <p className="text-sm font-medium">Коментарів ще немає</p>
          <p className="mt-1 text-xs">Будьте першим, хто скаже тепле слово.</p>
        </div>
      ) : (
        <ul className="space-y-3" aria-label="Коментарі">
          {comments.map((comment) => (
            <li key={comment.id} className="flex gap-2.5">
              <button type="button" onClick={() => onOpenUser(comment.author.id)} aria-label={`Профіль ${comment.author.displayName}`} className="shrink-0">
                <Avatar name={comment.author.displayName} src={comment.author.avatarUrl} size="sm" cosmetics={comment.author.cosmetics} />
              </button>
              <div className="min-w-0 flex-1 rounded-2xl bg-ios-fill/10 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => onOpenUser(comment.author.id)} className="truncate text-xs font-semibold hover:underline">{comment.author.displayName}</button>
                  <time dateTime={comment.createdAt} className="shrink-0 text-[10px] text-ios-secondary">{formatConversationTime(comment.createdAt)}</time>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">{comment.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      <form onSubmit={submit} className="mt-4 flex gap-2 border-t border-ios-separator/10 pt-4">
        <input className="text-input min-w-0 flex-1" value={text} onChange={(event) => setText(event.target.value)} maxLength={1000} placeholder="Написати коментар…" aria-label="Текст коментаря" />
        <button type="submit" className="primary-btn shrink-0 px-3" disabled={busy || !text.trim()} aria-label="Надіслати коментар"><Send size={16} /></button>
      </form>
    </Modal>
  );
}
