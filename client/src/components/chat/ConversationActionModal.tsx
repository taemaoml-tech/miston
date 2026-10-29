import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useMessenger } from '../../contexts/MessengerContext';
import type { CleanupScope, Conversation } from '../../types/models';
import { errorMessage } from '../../utils/format';
import { Modal } from '../common/Modal';

export type ConversationAction = 'clear' | 'delete';

export interface ConversationTarget {
  conversation: Conversation;
  action: ConversationAction;
}

interface Copy {
  title: string;
  description: string;
  confirm: string;
}

export function ConversationActionModal({ target, onClose }: { target: ConversationTarget; onClose: () => void }) {
  const { user } = useAuth();
  const { clearHistory, deleteConversation } = useMessenger();
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { conversation, action } = target;
  const myRole = conversation.members.find((member) => member.id === user?.id)?.role;
  const isGroup = conversation.kind === 'group';
  const isManager = isGroup && (myRole === 'owner' || myRole === 'admin');
  // Власник не може просто «вийти» з власної групи — сервер дозволяє лише повне видалення.
  const forcedShare = action === 'delete' && isGroup && myRole === 'owner';
  const canShare = conversation.kind === 'direct' || isManager;
  const scope: CleanupScope = forcedShare || shared ? 'everyone' : 'me';
  const title = conversation.title || 'Розмова';

  const copy: Copy = (() => {
    if (action === 'clear') {
      return scope === 'everyone'
        ? { title: 'Очистити історію для всіх', description: `Усі повідомлення в «${title}» буде видалено в кожного учасника, а вкладення зникнуть з сервера. Дію не можна скасувати.`, confirm: 'Очистити для всіх' }
        : { title: 'Очистити історію', description: `Старі повідомлення зникнуть з вашого екрана в «${title}». В інших учасників історія залишиться.`, confirm: 'Очистити' };
    }
    if (conversation.kind === 'group') {
      return scope === 'everyone'
        ? { title: 'Видалити гру', description: `Групу «${title}» разом з усією історією буде видалено для всіх її учасників.`, confirm: 'Видалити гру' }
        : { title: 'Покинути гру', description: `Ви вийдете з «${title}», а чат зникне з вашого списку.`, confirm: 'Покинути гру' };
    }
    return scope === 'everyone'
      ? { title: 'Видалити чат для обох', description: `Чат «${title}» та всю історію перемови буде видалено і у вас, і в іншого учасника.`, confirm: 'Видалити для обох' }
      : { title: 'Видалити чат', description: `Чат «${title}» зникне з вашого списку. Його поверне нове повідомлення від співрозмовника.`, confirm: 'Видалити чат' };
  })();

  async function run() {
    setBusy(true);
    setError('');
    try {
      if (action === 'clear') await clearHistory(conversation.id, scope);
      else await deleteConversation(conversation.id, scope);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={copy.title} description={copy.description}>
      {canShare && !forcedShare && (
        <label className="mb-4 flex items-start gap-3 rounded-2xl bg-slate-50 p-3 text-left transition hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/70">
          <input type="checkbox" checked={shared} disabled={busy} onChange={(event) => setShared(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-rose-600" />
          <span className="text-sm">
            <span className="block font-medium">{action === 'clear' ? 'Очистити для всіх учасників' : conversation.kind === 'direct' ? 'Видалити для обох' : 'Видалити гру повністю'}</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">{scope === 'everyone' ? 'Дію застосують до всіх, хто бачить цю розмову.' : 'Інакше зміни стосуватимуться лише вашого екрана.'}</span>
          </span>
        </label>
      )}
      {forcedShare && <p className="mb-4 rounded-2xl bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">Ви власник групи — залишити її можна лише разом з повним видаленням.</p>}
      {!canShare && action === 'delete' && <p className="mb-4 rounded-2xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">Групу повністю видаляє лише її власник або адміністратор.</p>}
      {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="secondary-btn" onClick={onClose} disabled={busy}>Скасувати</button>
        <button type="button" className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-60" onClick={() => void run()} disabled={busy}>{busy ? 'Обробка…' : copy.confirm}</button>
      </div>
    </Modal>
  );
}
