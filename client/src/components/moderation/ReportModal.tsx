import { Flag, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../api';
import type { Complaint, ComplaintCategory } from '../../types/models';
import { errorMessage, formatDateTime } from '../../utils/format';
import { COMPLAINT_CATEGORY_LABELS, COMPLAINT_STATUS_LABELS } from '../../utils/moderation';
import { Modal } from '../common/Modal';
import { Spinner } from '../common/Spinner';
import { AdminChip, AdminEmpty, AdminNotice } from '../admin/parts';

export interface ReportTarget {
  userId?: string;
  messageId?: string;
}

const CATEGORIES: ComplaintCategory[] = ['spam', 'harassment', 'nsfw', 'scam', 'copyright', 'other'];

export function ReportModal({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
  const [category, setCategory] = useState<ComplaintCategory>('spam');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [mine, setMine] = useState<Complaint[] | null>(null);

  useEffect(() => {
    if (!target) return;
    setSent(false);
    setError('');
    setDescription('');
    void (async () => {
      try {
        const result = await api.complaints.mine(5);
        setMine(result.items);
      } catch {
        setMine(null);
      }
    })();
  }, [target]);

  async function submit() {
    if (!target) return;
    const text = description.trim();
    if (text.length < 10) { setError('Опишіть проблему детальніше — щонайменше 10 символів.'); return; }
    setSending(true);
    setError('');
    try {
      await api.complaints.submit({ ...(target.userId ? { targetUserId: target.userId } : {}), ...(target.messageId ? { messageId: target.messageId } : {}), category, description: text });
      setSent(true);
      setDescription('');
      const result = await api.complaints.mine(5);
      setMine(result.items);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={Boolean(target)} onClose={onClose} title="Скаржитися" description={target?.messageId ? 'Модератори побачать текст повідомлення разом зі скаргою' : 'Модератори розглянуть вашу скаргу та зафіксують рішення'}>
      {sent ? (
        <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <p className="flex items-center gap-2 font-semibold"><Flag size={16} /> Скаргу надіслано</p>
          <p className="mt-1">Статус «Нова». Ви побачите, як її беруть в роботу та закривають, у списку нижче.</p>
        </div>
      ) : (
        <>
          {error && <AdminNotice message={error} />}
          <label className="field-label block" htmlFor="report-category">Категорія</label>
          <select id="report-category" className="text-input mb-3" value={category} onChange={(event) => setCategory(event.target.value as ComplaintCategory)}>
            {CATEGORIES.map((value) => <option key={value} value={value}>{COMPLAINT_CATEGORY_LABELS[value]}</option>)}
          </select>
          <label className="field-label block" htmlFor="report-text">Що сталося</label>
          <textarea id="report-text" className="text-input min-h-28 resize-y" maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Опишіть, що саме відбувається: коли, де та хто участникує." />
          <p className="mt-1 text-xs text-slate-400">{description.trim().length}/1000</p>
          <button type="button" className="primary-btn mt-4 w-full" disabled={sending} onClick={() => void submit()}><Send size={16} />Надіслати скаргу</button>
        </>
      )}

      <h4 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-slate-400">Мої скарги</h4>
      {mine === null ? <Spinner label="Завантаження…" className="py-6" /> : (
        <ul className="space-y-2">
          {mine.map((complaint) => (
            <li key={complaint.id} className="rounded-xl border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <AdminChip tone={complaint.status === 'new' ? 'red' : complaint.status === 'in_progress' ? 'amber' : 'green'}>{COMPLAINT_STATUS_LABELS[complaint.status]}</AdminChip>
                <span className="text-xs text-slate-400">{COMPLAINT_CATEGORY_LABELS[complaint.category]} · {formatDateTime(complaint.createdAt)}</span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{complaint.description}</p>
              {complaint.resolution && <p className="mt-1 text-xs text-emerald-600">Рішення: {complaint.resolution}</p>}
            </li>
          ))}
        </ul>
      )}
      {mine?.length === 0 && <AdminEmpty>Ви ще не подавали скарг.</AdminEmpty>}
    </Modal>
  );
}
