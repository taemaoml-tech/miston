import { Hash, MessageCircle, Plus, Sparkles } from 'lucide-react';
import { useMessenger } from '../../contexts/MessengerContext';

export function ChatPlaceholder({ onNewChat, onCreateChannel }: { onNewChat: () => void; onCreateChannel: () => void }) {
  const { activeServer } = useMessenger();
  return (
    <section className="chat-backdrop hidden h-full min-w-0 flex-1 items-center justify-center p-8 md:flex">
      <div className="max-w-md text-center">
        <div className="relative mx-auto mb-7 flex h-24 w-24 items-center justify-center rounded-[28px] bg-white text-accent-600 shadow-soft dark:bg-slate-900 dark:text-accent-400"><div className="absolute inset-0 rounded-[28px] bg-gradient-to-br from-accent-500/10 to-violet-500/10" />{activeServer ? <Hash size={42} strokeWidth={1.5} /> : <MessageCircle size={42} strokeWidth={1.5} />}<Sparkles size={20} className="absolute -right-2 -top-2 text-violet-400" /></div>
        <h1 className="text-2xl font-bold tracking-tight">{activeServer ? `Вітаємо в ${activeServer.name}` : 'Ваші розмови — просто й красиво'}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">{activeServer ? 'Оберіть канал, щоб долучитися до обговорення, або створіть новий простір для спільноти.' : 'Оберіть розмову зі списку ліворуч або напишіть комусь новому. Усе синхронізується в реальному часі.'}</p>
        <button type="button" className="primary-btn mt-6" onClick={activeServer ? onCreateChannel : onNewChat}><Plus size={17} />{activeServer ? 'Створити канал' : 'Почати розмову'}</button>
        <p className="mt-8 text-xs text-slate-400">Фото, відео, документи й голосові — все в одному місці.</p>
      </div>
    </section>
  );
}
