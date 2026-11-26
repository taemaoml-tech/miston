import { ArrowLeft, BarChart3, LayoutGrid, Plus, Rocket, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { useMessenger } from '../../contexts/MessengerContext';
import { useSocket } from '../../contexts/SocketContext';
import { useAndroidBack } from '../../utils/androidBack';
import { errorMessage } from '../../utils/format';
import { EmptyState } from '../common/EmptyState';
import { Spinner } from '../common/Spinner';
import { CommentsModal } from './CommentsModal';
import { ComposePostModal } from './ComposePostModal';
import { PostCard } from './PostCard';
import { ThemeCard } from './ThemeCard';
import type { FeedAuthor, FeedFilter, FeedPost, FeedTheme } from '../../types/feed';

const filters: Array<{ value: FeedFilter; label: string; icon: LucideIcon }> = [
  { value: 'all', label: 'Усе', icon: LayoutGrid },
  { value: 'projects', label: 'Ігри та проєкти', icon: Rocket },
  { value: 'polls', label: 'Опитування', icon: BarChart3 },
  { value: 'subscriptions', label: 'Підписки', icon: Users },
];

export function FeedPanel({ onOpenUser }: { onOpenUser: (userId: string) => void }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const { selectHome, createDirect } = useMessenger();
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [theme, setTheme] = useState<FeedTheme | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [fresh, setFresh] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [commentsPost, setCommentsPost] = useState<FeedPost | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const loadIdRef = useRef(0);
  const moreBusyRef = useRef(false);
  const loadedAtRef = useRef<string | null>(null);

  const currentUser = useMemo<FeedAuthor>(() => ({
    id: user?.id ?? '',
    username: user?.username ?? '',
    displayName: user?.displayName ?? '',
    avatarUrl: user?.avatarUrl ?? null,
    isPremium: Boolean(user && (user.role !== 'user' || user.isVerified)),
    isVerified: user?.isVerified,
    cosmetics: user?.cosmetics,
  }), [user]);

  const load = useCallback(async (nextFilter: FeedFilter, before?: string) => {
    const id = ++loadIdRef.current;
    if (before) moreBusyRef.current = true; else setLoading(true);
    if (!before) setError('');
    try {
      const result = await api.feed.list(nextFilter, before ?? null, 20);
      if (id !== loadIdRef.current) return;
      setHasMore(result.hasMore);
      if (before) {
        setPosts((current) => [...current, ...result.posts.filter((post) => !current.some((item) => item.id === post.id))]);
      } else {
        setPosts(result.posts);
        setTheme(result.theme);
        loadedAtRef.current = new Date(Date.now() - 5000).toISOString();
        setFresh(false);
      }
    } catch (cause) {
      if (id === loadIdRef.current) setError(errorMessage(cause));
    } finally {
      if (id === loadIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
        moreBusyRef.current = false;
      }
    }
  }, []);

  useEffect(() => { void load(filter); }, [filter, load]);

  useEffect(() => {
    if (!socket || !user) return;
    const onNew = (payload: { authorId?: string }) => {
      if (payload.authorId !== user.id) setFresh(true);
    };
    socket.on('feed:new', onNew);
    return () => { socket.off('feed:new', onNew); };
  }, [socket, user]);

  // Резервний шлях, якщо realtime-подія не дійшла (наприклад, сокет перепідключався).
  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(() => {
      const after = loadedAtRef.current;
      if (!after) return;
      void api.feed.since(after).then(({ count }) => { if (count > 0) setFresh(true); }).catch(() => undefined);
    }, 45000);
    return () => window.clearInterval(timer);
  }, [user]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loading || moreBusyRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !moreBusyRef.current) {
        setLoadingMore(true);
        void load(filter, posts[posts.length - 1]?.createdAt);
      }
    }, { rootMargin: '240px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, filter, posts, load]);

  useAndroidBack(() => {
    if (commentsPost) { setCommentsPost(null); return true; }
    if (composeOpen) { setComposeOpen(false); return true; }
    if (fresh) { setFresh(false); return true; }
    return false;
  }, 160);

  function refresh() {
    void load(filter);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updatePost(updated: FeedPost) {
    setPosts((current) => current.map((post) => post.id === updated.id ? updated : post));
    setCommentsPost((current) => current?.id === updated.id ? updated : current);
  }

  async function react(postId: string, emoji: string) {
    const { post } = await api.feed.react(postId, emoji);
    updatePost(post);
  }

  async function vote(postId: string, optionIndex: number) {
    const { post } = await api.feed.vote(postId, optionIndex);
    updatePost(post);
  }

  async function answerTheme(answer: string) {
    const { theme: updated } = await api.feed.answerTheme(answer);
    setTheme(updated);
  }

  async function chatWith(authorId: string) {
    if (chatBusy) return;
    setChatBusy(true);
    try { await createDirect(authorId); }
    finally { setChatBusy(false); }
  }

  async function removePost(postId: string) {
    try {
      await api.feed.remove(postId);
      setPosts((current) => current.filter((post) => post.id !== postId));
      setCommentsPost((current) => current?.id === postId ? null : current);
    } catch (cause) { setError(errorMessage(cause)); }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-ios-bg" aria-label="Стрічка">
      <header className="shrink-0 border-b border-ios-separator/10 bg-ios-glass/80 px-3 py-3 backdrop-blur-xl sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <button type="button" className="icon-btn md:hidden" onClick={selectHome} aria-label="Назад до повідомлень"><ArrowLeft size={20} /></button>
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight sm:text-xl">Стрічка</h1>
              <p className="hidden text-xs text-ios-secondary sm:block">Ідеї, проєкти й настрій спільноти</p>
            </div>
          </div>
          <button type="button" className="primary-btn shrink-0 px-3 sm:px-4" onClick={() => setComposeOpen(true)}><Plus size={17} /> Новий пост</button>
        </div>
        <div className="subtle-scrollbar mt-3 flex gap-2 overflow-x-auto pb-0.5" role="tablist" aria-label="Фільтри стрічки">
          {filters.map(({ value, label, icon: Icon }) => (
            <button
              type="button"
              key={value}
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={`feed-chip ${filter === value ? 'feed-chip--active' : 'feed-chip--idle'}`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </header>

      <div ref={scrollRef} className="subtle-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-4 pb-6">
          {fresh && (
            <button type="button" onClick={refresh} className="feed-fresh-pill sticky top-0 z-20 mx-auto flex items-center gap-2 rounded-full bg-ios-blue px-4 py-2 text-xs font-bold text-white shadow-glow animate-fade-in">
              <span aria-hidden="true">↑</span> Нові пости
            </button>
          )}

          {loading ? (
            <>
              <div className="feed-card h-36 animate-pulse rounded-3xl border" aria-hidden="true" />
              {[0, 1].map((item) => <div key={item} className="feed-card h-52 animate-pulse rounded-3xl border" aria-hidden="true" />)}
              <p className="text-center text-xs text-ios-secondary" role="status">Завантажуємо стрічку…</p>
            </>
          ) : error && posts.length === 0 ? (
            <div className="feed-card rounded-3xl border">
              <EmptyState icon={Users} title="Стрічку не вдалося завантажити" description={error} action={<button type="button" className="primary-btn" onClick={refresh}>Спробувати ще раз</button>} />
            </div>
          ) : (
            <>
              {theme && <ThemeCard theme={theme} onAnswer={answerTheme} />}
              {posts.length === 0 ? (
                <div className="feed-card rounded-3xl border">
                  <EmptyState icon={LayoutGrid} title="Поки що тихо" description="Тут з'являться пости спільноти. Можете почати першим — додайте думку, фото чи опитування." action={<button type="button" className="primary-btn" onClick={() => setComposeOpen(true)}><Plus size={16} /> Створити пост</button>} />
                </div>
              ) : (
                posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    currentUserId={currentUser.id}
                    onReact={react}
                    onVote={vote}
                    onComments={setCommentsPost}
                    onChat={(id) => void chatWith(id)}
                    onRemove={(id) => void removePost(id)}
                  />
                ))
              )}
              {loadingMore && <Spinner label="Завантажуємо ще…" className="py-4" />}
              <div ref={sentinelRef} className="h-px" aria-hidden="true" />
            </>
          )}
        </div>
      </div>

      <ComposePostModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        initialCategory={filter === 'polls' ? 'polls' : 'projects'}
        onCreated={(post) => {
          setPosts((current) => [post, ...current.filter((item) => item.id !== post.id)]);
          refresh();
        }}
      />
      <CommentsModal
        post={commentsPost}
        currentUser={currentUser}
        onClose={() => setCommentsPost(null)}
        onOpenUser={onOpenUser}
        onCountChange={(postId, count) => setPosts((current) => current.map((post) => post.id === postId ? { ...post, commentCount: count } : post))}
      />
    </div>
  );
}
