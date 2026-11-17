import { Hash, MessageCircle, Plus, Sparkles } from 'lucide-react';
import { useMessenger } from '../../contexts/MessengerContext';

export function ChatPlaceholder({ onNewChat, onCreateChannel }: { onNewChat: () => void; onCreateChannel: () => void }) {
  const { activeServer } = useMessenger();
  return (
    <section className="chat-backdrop hidden h-full min-w-0 flex-1 items-center justify-center p-8 md:flex">
      <div className="max-w-md text-center">
        <div className="ios-glass relative mx-auto mb-7 flex h-24 w-24 items-center justify-center rounded-[32px] text-ios-blue shadow-soft">{activeServer ? <Hash size={42} strokeWidth={1.5} /> : <MessageCircle size={42} strokeWidth={1.5} />}<Sparkles size={20} className="absolute -right-2 -top-2 text-ios-blue" /></div>
        <h1 className="text-[28px] font-bold tracking-tight">{activeServer ? `Вітаємо в ${activeServer.name}` : 'Ваші розмови — просто й красиво'}</h1>
        <p className="mt-3 text-sm leading-6 text-ios-secondary">{activeServer ? 'Оберіть канал, щоб долучитися до обговорення, або створіть новий простір для спільноти.' : 'Оберіть розмову зі списку ліворуч або напишіть комусь новому. Усе синхронізується в реальному часі.'}</p>
        <button type="button" className="primary-btn mt-6" onClick={activeServer ? onCreateChannel : onNewChat}><Plus size={17} />{activeServer ? 'Створити канал' : 'Почати розмову'}</button>
        <p className="mt-8 text-xs text-ios-secondary">Фото, відео, документи й голосові — все в одному місці.</p>
      </div>
    </section>
  );
}
