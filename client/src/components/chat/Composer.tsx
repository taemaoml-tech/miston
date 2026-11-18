import { ArrowUp, Check, FileText, Film, Image, Mic, Plus, Reply, SmilePlus, Square, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { api } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import type { ConversationMember, Message, MessageKind, Sticker } from '../../types/models';
import { errorMessage, formatBytes, formatDuration } from '../../utils/format';
import { Avatar } from '../common/Avatar';
import { PickerPanel } from './PickerPanel';

interface ComposerProps {
  conversationId: string;
  onSent: (message: Message) => void;
  editing?: Message | null;
  onCancelEdit?: () => void;
  onEdited?: (message: Message) => void;
  replyTo?: Message | null;
  onCancelReply?: () => void;
  members?: ConversationMember[];
}

interface MentionState {
  start: number;
  query: string;
  options: ConversationMember[];
}

export function Composer({
  conversationId, onSent, editing = null, onCancelEdit, onEdited,
  replyTo = null, onCancelReply, members = [],
}: ComposerProps) {
  const { socket } = useSocket();
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<MessageKind>('document');
  const [menuOpen, setMenuOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const acceptRef = useRef('*/*');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const cancelledRef = useRef(false);
  const typingTimer = useRef<number | undefined>(undefined);
  const previewUrl = file && kind === 'image' ? URL.createObjectURL(file) : null;
  const mention = useMemo<MentionState | null>(() => {
    if (editing) return null;
    const before = text.slice(0, caret);
    const match = /(?:^|[\s(])@([a-zA-Z0-9_]{0,32})$/.exec(before);
    if (!match) return null;
    const needle = match[1].toLocaleLowerCase('uk-UA');
    const options = members
      .filter((member) => member.id !== user?.id)
      .filter((member) => !needle || [member.username, member.displayName, member.alias]
        .some((value) => value ? value.toLocaleLowerCase('uk-UA').includes(needle) : false))
      .slice(0, 6);
    return { start: caret - match[1].length - 1, query: match[1], options };
  }, [text, caret, members, user?.id, editing]);
  const activeMention = mention && mention.options.length ? Math.min(mentionIndex, mention.options.length - 1) : 0;

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => {
    setText(''); setFile(null); setError(''); setMenuOpen(false); setCaret(0); setMentionIndex(0); setPickerOpen(false);
    return () => { if (typingTimer.current) window.clearTimeout(typingTimer.current); };
  }, [conversationId]);
  const previousEditingId = useRef<string | null>(null);
  useEffect(() => {
    const editingId = editing?.id ?? null;
    if (editingId === previousEditingId.current) return;
    previousEditingId.current = editingId;
    setError(''); setFile(null); setMenuOpen(false);
    setText(editing?.content ?? '');
    window.setTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
      if (editingId) textarea.focus();
    }, 0);
  }, [editing]);
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const emitTyping = (isTyping: boolean) => socket?.emit('typing', { conversationId, isTyping });
  const onTextChange = (value: string, caretPosition?: number) => {
    setText(value); emitTyping(true);
    setCaret(caretPosition ?? value.length);
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => emitTyping(false), 1200);
    const textarea = textareaRef.current;
    if (textarea) { textarea.style.height = 'auto'; textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`; }
  };

  function insertMention(member: ConversationMember) {
    if (!mention) return;
    const inserted = `@${member.username} `;
    const next = text.slice(0, mention.start) + inserted + text.slice(caret);
    const nextCaret = mention.start + inserted.length;
    onTextChange(next, nextCaret);
    setMentionIndex(0);
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function insertEmoji(emoji: string) {
    const next = text.slice(0, caret) + emoji + text.slice(caret);
    const nextCaret = caret + emoji.length;
    onTextChange(next, nextCaret);
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
  }

  async function sendSticker(sticker: Sticker) {
    if (sending) return;
    setSending(true); setError(''); emitTyping(false);
    try {
      const result = await api.conversations.sendSticker(conversationId, sticker.id, replyTo?.id);
      onSent(result.message);
      onCancelReply?.();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setSending(false); }
  }

  const pickFile = (accept: string, nextKind: MessageKind) => {
    acceptRef.current = accept; setKind(nextKind); setMenuOpen(false);
    window.setTimeout(() => { if (inputRef.current) { inputRef.current.accept = accept; inputRef.current.click(); } }, 0);
  };
  const fileChosen = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    if (chosen) { setFile(chosen); setError(''); }
    event.target.value = '';
  };

  async function send() {
    if (sending) return;
    if (editing) {
      const content = text.trim();
      if (!content) return;
      setSending(true); setError(''); emitTyping(false);
      try {
        const result = await api.conversations.editMessage(conversationId, editing.id, content);
        onEdited?.(result.message);
        onCancelEdit?.();
        setText('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
      } catch (cause) { setError(errorMessage(cause)); }
      finally { setSending(false); }
      return;
    }
    if (!text.trim() && !file) return;
    setSending(true); setError(''); emitTyping(false);
    try {
      const result = file
        ? await api.conversations.sendFile(conversationId, file, text.trim(), kind, undefined, replyTo?.id)
        : await api.conversations.sendText(conversationId, text.trim(), replyTo?.id);
      onSent(result.message); setText(''); setFile(null); onCancelReply?.();
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setSending(false); }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (mention && mention.options.length > 0) {
      if (event.key === 'ArrowDown') { event.preventDefault(); setMentionIndex((activeMention + 1) % mention.options.length); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); setMentionIndex((activeMention - 1 + mention.options.length) % mention.options.length); return; }
      if ((event.key === 'Enter' || event.key === 'Tab') && !event.nativeEvent.isComposing) { event.preventDefault(); insertMention(mention.options[activeMention]); return; }
      if (event.key === 'Escape') { event.preventDefault(); setCaret(0); return; }
    }
    if (event.key === 'Escape') {
      if (editing) { event.preventDefault(); onCancelEdit?.(); return; }
      if (replyTo) { event.preventDefault(); onCancelReply?.(); return; }
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
  }

  async function startRecording() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setError('Цей браузер не підтримує запис голосу.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream; chunksRef.current = []; cancelledRef.current = false; setSeconds(0);
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (!cancelledRef.current) {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          const voice = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
          setSending(true);
          void api.conversations.sendFile(conversationId, voice, '', 'voice', seconds, replyTo?.id)
            .then((result) => { onSent(result.message); onCancelReply?.(); })
            .catch((cause) => setError(errorMessage(cause)))
            .finally(() => setSending(false));
        }
        setRecording(false); setSeconds(0); recorderRef.current = null;
      };
      recorder.start(); setRecording(true);
    } catch { setError('Доступ до мікрофона відхилено. Перевірте дозволи браузера та спробуйте ще раз.'); }
  }

  const stopRecording = (cancel: boolean) => {
    cancelledRef.current = cancel;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    else { streamRef.current?.getTracks().forEach((track) => track.stop()); setRecording(false); }
  };

  return (
    <div className="border-t border-ios-separator/10 bg-ios-glass/70 px-3 pb-3 pt-2 backdrop-blur-xl sm:px-5 sm:pb-4">
      {error && <div role="alert" className="ios-glass mx-auto mb-2 flex max-w-4xl items-center justify-between gap-2 rounded-2xl px-3 py-2 text-xs text-rose-600 dark:text-rose-300"><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Закрити помилку"><X size={14} /></button></div>}
      {editing && <div className="mx-auto mb-2 flex max-w-4xl items-center justify-between gap-3 rounded-2xl border-l-[3px] border-ios-blue bg-ios-blue/10 px-3 py-2 text-xs text-ios-blue"><div className="min-w-0"><p className="font-semibold">Редагування повідомлення</p><p className="truncate opacity-80">{editing.content || 'Без тексту'}</p></div><button type="button" className="icon-btn h-7 w-7 shrink-0" onClick={() => onCancelEdit?.()} aria-label="Скасувати редагування"><X size={15} /></button></div>}
      {replyTo && !editing && (
        <div className="ios-glass mx-auto mb-2 flex max-w-4xl items-center gap-3 rounded-2xl border-l-[3px] border-ios-blue px-3 py-2 text-xs">
          <Reply size={15} className="shrink-0 text-ios-blue" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ios-blue">Відповідь · {replyTo.sender.displayName}</p>
            <p className="truncate text-ios-secondary">{replyTo.content || 'Вкладення'}</p>
          </div>
          <button type="button" className="icon-btn h-7 w-7 shrink-0" onClick={() => onCancelReply?.()} aria-label="Скасувати відповідь"><X size={15} /></button>
        </div>
      )}
      {file && <div className="ios-glass mx-auto mb-2 flex max-w-4xl items-center gap-3 rounded-2xl p-2.5"><div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-ios-blue/10 text-ios-blue">{previewUrl ? <img src={previewUrl} alt="Перегляд вкладення" className="h-full w-full object-cover" /> : kind === 'video' ? <Film size={20} /> : <FileText size={20} />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file.name}</p><p className="text-xs text-ios-secondary">{formatBytes(file.size)}</p></div><button type="button" className="icon-btn h-8 w-8" onClick={() => setFile(null)} aria-label="Видалити вкладення"><X size={17} /></button></div>}
      {pickerOpen && !editing && (
        <div className="mx-auto mb-2 max-w-4xl">
          <PickerPanel onEmoji={insertEmoji} onSticker={(sticker) => void sendSticker(sticker)} />
        </div>
      )}
      <div className="mx-auto flex max-w-4xl items-end gap-1.5 rounded-full border border-ios-separator/15 bg-ios-bg/80 p-1.5 shadow-sm backdrop-blur-xl dark:bg-ios-glass/80">
        {!recording && !editing && <div className="relative"><button type="button" className={`icon-btn h-9 w-9 bg-ios-fill/10 text-ios-blue hover:bg-ios-blue/15 ${menuOpen ? 'bg-ios-blue/15' : ''}`} onClick={() => setMenuOpen((value) => !value)} aria-label="Прикріпити файл" aria-expanded={menuOpen}><Plus size={21} /></button>{menuOpen && <><button className="fixed inset-0 z-10 cursor-default" tabIndex={-1} aria-label="Закрити меню вкладень" onClick={() => setMenuOpen(false)} /><div className="ios-glass absolute bottom-12 left-0 z-20 w-44 rounded-[20px] p-1.5 shadow-soft animate-slide-up"><button type="button" onClick={() => pickFile('image/*', 'image')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-ios-fill/10"><Image size={18} className="text-ios-blue" /> Фото</button><button type="button" onClick={() => pickFile('video/*', 'video')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-ios-fill/10"><Film size={18} className="text-[#AF52DE]" /> Відео</button><button type="button" onClick={() => pickFile('*/*', 'document')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-ios-fill/10"><FileText size={18} className="text-ios-secondary" /> Документ</button></div></>}</div>}
        <input ref={inputRef} type="file" className="hidden" onChange={fileChosen} />
        {!recording && !editing && (
          <button
            type="button"
            className={`icon-btn h-9 w-9 ${pickerOpen ? 'bg-ios-blue/10 text-ios-blue' : 'text-ios-secondary'}`}
            onClick={() => setPickerOpen((value) => !value)}
            aria-label="Стікери та емодзі"
            aria-expanded={pickerOpen}
            title="Стікери та емодзі"
          >
            <SmilePlus size={20} />
          </button>
        )}
        {recording ? (
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-full bg-rose-500/10 px-4 py-2 text-rose-600 dark:text-rose-300"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" /><span className="text-sm font-semibold tabular-nums">{formatDuration(seconds)}</span><span className="hidden truncate text-xs opacity-70 sm:block">Запис голосового повідомлення…</span><button type="button" onClick={() => stopRecording(true)} className="ml-auto rounded-full px-2 py-1 text-xs font-semibold hover:bg-rose-500/15">Скасувати</button></div>
        ) : (
          <div className="relative min-w-0 flex-1">
            <textarea
              ref={textareaRef}
              rows={1}
              maxLength={4000}
              className="subtle-scrollbar max-h-32 min-h-9 w-full resize-none border-0 bg-transparent px-1 py-2 text-[15px] leading-5 text-ios-label placeholder:text-ios-secondary focus:border-0 focus:outline-none focus:ring-0"
              value={text}
              onChange={(event) => onTextChange(event.target.value, event.target.selectionStart)}
              onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
              onKeyDown={onKeyDown}
              placeholder={editing ? 'Редагуйте повідомлення…' : 'Напишіть повідомлення…'}
              aria-label={editing ? 'Редагування повідомлення' : 'Повідомлення'}
            />
            {mention && mention.options.length > 0 && (
              <div className="ios-glass absolute bottom-full left-0 z-30 mb-2 w-full max-w-sm overflow-hidden rounded-[20px] py-1 shadow-soft animate-slide-up" role="listbox" aria-label="Згадки учасників">
                <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-ios-secondary">
                  {mention.query ? `Згадка «${mention.query}»` : 'Згадати учасника'}
                </p>
                {mention.options.map((member, index) => (
                  <button
                    key={member.id}
                    type="button"
                    role="option"
                    aria-selected={index === activeMention}
                    onMouseDown={(event) => { event.preventDefault(); insertMention(member); }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition ${index === activeMention ? 'bg-ios-blue/10' : 'hover:bg-ios-fill/10'}`}
                  >
                    <Avatar name={member.displayName} src={member.avatarUrl} size="sm" cosmetics={member.cosmetics} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{member.alias || member.displayName}</span>
                      <span className="block truncate text-[11px] text-ios-secondary">@{member.username}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {recording ? <button type="button" className="primary-btn h-9 w-9 rounded-full p-0" onClick={() => stopRecording(false)} aria-label="Зупинити й надіслати голосове повідомлення"><Square size={16} fill="currentColor" /></button> : editing ? <button type="button" className="primary-btn h-9 w-9 rounded-full p-0 shadow-glow" onClick={() => void send()} disabled={sending || !text.trim()} aria-label="Зберегти зміни">{sending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Check size={18} />}</button> : text.trim() || file ? <button type="button" className="primary-btn h-9 w-9 rounded-full p-0 shadow-glow" onClick={() => void send()} disabled={sending} aria-label="Надіслати повідомлення">{sending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <ArrowUp size={20} />}</button> : <button type="button" className="icon-btn h-9 w-9 text-ios-blue hover:bg-ios-blue/10" onClick={() => void startRecording()} aria-label="Записати голосове повідомлення"><Mic size={20} /></button>}
      </div>
    </div>
  );
}
