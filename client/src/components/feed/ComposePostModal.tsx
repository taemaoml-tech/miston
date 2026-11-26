import { BarChart3, ImagePlus, LoaderCircle, Plus, Send, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { api } from '../../api';
import { assetUrl } from '../../api/client';
import type { FeedCategory, FeedDraft, FeedPost } from '../../types/feed';
import { errorMessage } from '../../utils/format';
import { Modal } from '../common/Modal';

const categories: Array<{ value: FeedCategory; label: string }> = [
  { value: 'projects', label: 'Ігри та проєкти' },
  { value: 'polls', label: 'Опитування' },
  { value: 'subscriptions', label: 'Підписки' },
];

export function ComposePostModal({ open, onClose, onCreated, initialCategory = 'projects' }: {
  open: boolean;
  onClose: () => void;
  onCreated: (post: FeedPost) => void;
  initialCategory?: FeedCategory;
}) {
  const [text, setText] = useState('');
  const [category, setCategory] = useState<FeedCategory>(initialCategory);
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [pollEnabled, setPollEnabled] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setText('');
    setCategory(initialCategory);
    setImage(null);
    setImagePreview(null);
    setPollEnabled(initialCategory === 'polls');
    setQuestion('');
    setOptions(['', '']);
    setError('');
  }, [open, initialCategory]);

  useEffect(() => () => { if (imagePreview) URL.revokeObjectURL(imagePreview); }, [imagePreview]);

  function pickImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Можна додати лише зображення.'); return; }
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImage(file);
    setImagePreview(URL.createObjectURL(file));
    setError('');
    event.target.value = '';
  }

  const filledOptions = options.map((option) => option.trim()).filter(Boolean);
  const poll = pollEnabled && question.trim() && filledOptions.length >= 2
    ? { question: question.trim(), options: filledOptions }
    : null;
  const canPublish = Boolean(text.trim() || image || poll) && !busy;

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (!canPublish) return;
    setBusy(true);
    setError('');
    const draft: FeedDraft = { text: text.trim(), category: poll ? 'polls' : category, image, poll };
    try {
      const { post } = await api.feed.create(draft);
      onCreated(post);
      onClose();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  const preview = imagePreview ? assetUrl(imagePreview) : null;

  return (
    <Modal open={open} onClose={onClose} title="Новий пост" description="Поділіться тим, що вас надихнуло">
      <form onSubmit={publish}>
        <label className="block">
          <span className="field-label">Що нового?</span>
          <textarea className="text-input min-h-28 resize-y" value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} placeholder="Коротка думка, новина або невеликий челендж…" aria-label="Текст поста" />
          <span className="mt-1 block text-right text-[11px] text-ios-secondary">{text.length}/2000</span>
        </label>

        <div className="mt-3">
          <span className="field-label">Категорія</span>
          <div className="subtle-scrollbar flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Категорія поста">
            {categories.map((item) => (
              <button type="button" key={item.value} onClick={() => { setCategory(item.value); setPollEnabled(item.value === 'polls'); }} className={`feed-chip ${category === item.value ? 'feed-chip--active' : 'feed-chip--idle'}`} aria-pressed={category === item.value}>{item.label}</button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <label className="secondary-btn cursor-pointer">
            <ImagePlus size={16} /> {image ? 'Змінити фото' : 'Додати фото'}
            <input type="file" accept="image/*" className="hidden" onChange={pickImage} />
          </label>
          <button type="button" className={`secondary-btn ${pollEnabled ? 'border-ios-blue/40 bg-ios-blue/10 text-ios-blue' : ''}`} onClick={() => setPollEnabled((value) => !value)} aria-pressed={pollEnabled}>
            <BarChart3 size={16} /> Опитування
          </button>
        </div>

        {preview && (
          <div className="relative mt-3">
            <img src={preview} alt="Попередній перегляд зображення" className="feed-image" />
            <button type="button" onClick={() => { if (imagePreview) URL.revokeObjectURL(imagePreview); setImage(null); setImagePreview(null); }} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white" aria-label="Прибрати зображення"><X size={16} /></button>
          </div>
        )}

        {pollEnabled && (
          <div className="mt-3 rounded-2xl border border-ios-separator/12 bg-ios-fill/[0.06] p-3.5">
            <label className="block">
              <span className="field-label">Питання опитування</span>
              <input className="text-input" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={140} placeholder="Що обраємо?" aria-label="Питання опитування" />
            </label>
            <div className="mt-3 space-y-2">
              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input className="text-input" value={option} onChange={(event) => setOptions((current) => current.map((item, i) => i === index ? event.target.value : item))} maxLength={80} placeholder={`Варіант ${index + 1}`} aria-label={`Варіант ${index + 1}`} />
                  {options.length > 2 && (
                    <button type="button" className="icon-btn h-9 w-9" onClick={() => setOptions((current) => current.filter((_, i) => i !== index))} aria-label={`Прибрати варіант ${index + 1}`}><X size={15} /></button>
                  )}
                </div>
              ))}
            </div>
            {options.length < 5 && <button type="button" className="mt-2 flex items-center gap-1 text-xs font-semibold text-ios-blue" onClick={() => setOptions((current) => [...current, ''])}><Plus size={14} /> Додати варіант</button>}
          </div>
        )}

        {error && <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}

        <div className="mt-5 flex justify-end gap-2 border-t border-ios-separator/10 pt-4">
          <button type="button" className="secondary-btn" onClick={onClose}>Скасувати</button>
          <button type="submit" className="primary-btn" disabled={!canPublish}>{busy ? <><LoaderCircle size={16} className="animate-spin" /> Публікуємо…</> : <><Send size={16} /> Опублікувати</>}</button>
        </div>
      </form>
    </Modal>
  );
}
