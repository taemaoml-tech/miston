import { Camera, CheckCircle2, LogOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { infoHref } from '../../router/infoRoute';
import { errorMessage } from '../../utils/format';
import { configStringArray } from '../../utils/star';
import { Avatar } from '../common/Avatar';
import { INFO_LINKS } from '../info/infoLinks';
import { Modal } from '../common/Modal';
import { StarDisplayName } from '../star/StarDisplayName';

export function ProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, updateUser, logout } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ displayName: '', username: '', bio: '' });
  const [preview, setPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user && open) {
      setForm({ displayName: user.displayName, username: user.username, bio: user.bio || '' });
      setPreview(null); setAvatarFile(null); setError(''); setSaved(false);
    }
  }, [user, open]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  if (!user) return null;
  const backgroundGradient = user.cosmetics?.profile_background
    ? configStringArray(user.cosmetics.profile_background.config, 'gradient')
    : [];
  const chooseAvatar = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Виберіть файл зображення.'); return; }
    if (file.size > 8 * 1024 * 1024) { setError('Аватар має бути меншим за 8 МБ.'); return; }
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file)); setAvatarFile(file); setError(''); setSaved(false);
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(''); setSaved(false);
    try {
      let updated = user!;
      if (avatarFile) updated = (await api.users.avatar(avatarFile)).user;
      const result = await api.users.update({ ...form, displayName: form.displayName.trim(), username: form.username.trim(), bio: form.bio.trim() });
      updateUser({ ...updated, ...result.user });
      setAvatarFile(null); setPreview(null); setSaved(true);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Ваш профіль" description="Як вас бачать у Miston">
      <form onSubmit={save}>
        <div className="mb-4 rounded-2xl border" style={backgroundGradient.length >= 2 ? { backgroundImage: `linear-gradient(135deg, ${backgroundGradient.join(', ')})` } : undefined}>
          <div className="flex items-center gap-5 p-4">
            <button type="button" onClick={() => fileRef.current?.click()} className="group relative rounded-full" aria-label="Змінити фото профілю">
              <Avatar name={form.displayName || user.displayName} src={preview || user.avatarUrl} size="xl" cosmetics={user.cosmetics} />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-950/45 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"><Camera size={23} /></span>
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold"><StarDisplayName name={form.displayName || user.displayName} cosmetics={user.cosmetics} verified={user.isVerified} /></p>
              <button type="button" onClick={() => fileRef.current?.click()} className="secondary-btn mt-2">Змінити фото</button>
              <p className="mt-2 text-xs text-slate-400">JPG, PNG або GIF, до 8 МБ</p>
            </div>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => chooseAvatar(event.target.files?.[0])} />
        <div className="space-y-4">
          <label className="block"><span className="field-label">Показуване ім'я</span><input required maxLength={60} className="text-input" value={form.displayName} onChange={(e) => { setForm({ ...form, displayName: e.target.value }); setSaved(false); }} /></label>
          <label className="block"><span className="field-label">Ім'я користувача</span><div className="relative"><span className="absolute left-3.5 top-2.5 text-sm text-slate-400">@</span><input required minLength={3} pattern="[a-zA-Z0-9_]+" className="text-input pl-8" value={form.username} onChange={(e) => { setForm({ ...form, username: e.target.value }); setSaved(false); }} /></div></label>
          <label className="block"><span className="field-label">Про себе</span><textarea className="text-input min-h-24 resize-none" maxLength={240} value={form.bio} onChange={(e) => { setForm({ ...form, bio: e.target.value }); setSaved(false); }} placeholder="Трохи про себе…" /><span className="mt-1 block text-right text-xs text-slate-400">{form.bio.length}/240</span></label>
          <div><span className="field-label">Електронна пошта</span><div className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">{user.email}</div></div>
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}
        {saved && <p className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><CheckCircle2 size={17} /> Профіль успішно оновлено.</p>}
        <nav className="mt-6 border-t pt-5" aria-label="Сторінки Miston">
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Сторінки Miston</p>
          <div className="flex flex-wrap gap-2">
            {INFO_LINKS.map((link) => (
              <a key={link.route} href={infoHref(link.route)} className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-accent-300 hover:text-accent-700 dark:text-slate-300 dark:hover:text-accent-300">
                <link.icon size={13} /> {link.label}
              </a>
            ))}
          </div>
        </nav>
        <div className="mt-6 flex items-center justify-between gap-3 border-t pt-5">
          <button type="button" className="inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30" onClick={() => void logout()}><LogOut size={17} /> Вийти</button>
          <button type="submit" className="primary-btn" disabled={saving || !form.displayName.trim() || !form.username.trim()}>{saving ? 'Збереження…' : 'Зберегти зміни'}</button>
        </div>
      </form>
    </Modal>
  );
}
