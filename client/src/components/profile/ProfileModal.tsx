import {
  BatteryCharging, BellRing, Camera, CheckCircle2, ChevronLeft, ChevronRight, Database,
  Folder, Languages, LockKeyhole, LogOut, MessageSquare, MonitorSmartphone,
  ShieldCheck, Smartphone, UserRound,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { infoHref } from '../../router/infoRoute';
import { errorMessage } from '../../utils/format';
import { configStringArray } from '../../utils/star';
import type { LoginSession } from '../../types/models';
import { Avatar } from '../common/Avatar';
import { INFO_LINKS } from '../info/infoLinks';
import { Modal } from '../common/Modal';
import { NotificationSettings } from './NotificationSettings';
import { StarDisplayName } from '../star/StarDisplayName';

type Section =
  | 'root' | 'account' | 'chats' | 'privacy' | 'notifications'
  | 'data' | 'folders' | 'devices' | 'energy' | 'language';

const SECTION_TITLES: Record<Section, string> = {
  root: 'Налаштування',
  account: 'Акаунт',
  chats: 'Налаштування чатів',
  privacy: 'Приватність і безпека',
  notifications: 'Сповіщення',
  data: 'Дані та сховище',
  folders: 'Папки для чатів',
  devices: 'Пристрої',
  energy: 'Економія енергії',
  language: 'Мова',
};

function maskPhone(phone: string): string {
  if (phone.length <= 6) return phone;
  return `${phone.slice(0, 3)} ••• •• ${phone.slice(-2)}`;
}

function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return 'Невідомий пристрій';
  const os = /Android/i.test(userAgent) ? 'Android'
    : /iPhone|iPad|iPod/i.test(userAgent) ? 'iPhone / iPad'
      : /Windows/i.test(userAgent) ? 'Windows'
        : /Mac OS X|Macintosh/i.test(userAgent) ? 'macOS'
          : /Linux/i.test(userAgent) ? 'Linux' : 'Пристрій';
  const browser = /Edg\//i.test(userAgent) ? 'Edge'
    : /Chrome\//i.test(userAgent) ? 'Chrome'
      : /Firefox\//i.test(userAgent) ? 'Firefox'
        : /Safari\//i.test(userAgent) ? 'Safari' : '';
  return browser ? `${os} · ${browser}` : os;
}

function SettingsRow({
  icon, color, title, subtitle, onClick,
}: {
  icon: ReactNode;
  color: string;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3.5 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm ${color}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-slate-800 dark:text-slate-100">{title}</span>
        <span className="block truncate text-xs text-slate-400 dark:text-slate-500">{subtitle}</span>
      </span>
      <ChevronRight size={17} className="shrink-0 text-slate-300 dark:text-slate-600" />
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-accent-600 transition hover:text-accent-500 dark:text-accent-400"
    >
      <ChevronLeft size={17} /> Налаштування
    </button>
  );
}

export function ProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, updateUser, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);
  const [section, setSection] = useState<Section>('root');
  const [form, setForm] = useState({ displayName: '', username: '', bio: '' });
  const [preview, setPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [sessions, setSessions] = useState<LoginSession[] | null>(null);
  const [sessionsError, setSessionsError] = useState('');
  const [energySaver, setEnergySaver] = useState(() => localStorage.getItem('miston.energySaver') === 'true');
  const [cache, setCache] = useState('');

  useEffect(() => {
    if (user && open) {
      setForm({ displayName: user.displayName, username: user.username, bio: user.bio || '' });
      setPreview(null); setAvatarFile(null); setError(''); setSaved(false); setSection('root');
    }
  }, [user, open]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  useEffect(() => {
    if (!open || section !== 'devices') return;
    let active = true;
    setSessions(null);
    setSessionsError('');
    api.auth.sessions()
      .then((result) => { if (active) setSessions(result.sessions); })
      .catch((cause) => { if (active) setSessionsError(errorMessage(cause)); });
    return () => { active = false; };
  }, [open, section]);

  useEffect(() => {
    if (!open || section !== 'data') return;
    let active = true;
    void navigator.storage?.estimate?.()
      .then((estimate) => {
        if (!active) return;
        const used = estimate.usage ?? 0;
        setCache(used > 1024 * 1024 ? `${(used / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(used / 1024))} КБ`);
      })
      .catch(() => { if (active) setCache('невідомо'); });
    return () => { active = false; };
  }, [open, section]);

  if (!user) return null;

  const backgroundGradient = user.cosmetics?.profile_background
    ? configStringArray(user.cosmetics.profile_background.config, 'gradient')
    : [];
  const phoneVerified = user.phoneVerified === true;

  const chooseAvatar = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Виберіть файл зображення.'); return; }
    if (file.size > 8 * 1024 * 1024) { setError('Аватар має бути меншим за 8 МБ.'); return; }
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file)); setAvatarFile(file); setError(''); setSaved(false);
  };

  async function saveAccount(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(''); setSaved(false);
    try {
      let updated = user!;
      if (avatarFile) updated = (await api.users.avatar(avatarFile)).user;
      const result = await api.users.update({
        ...form,
        displayName: form.displayName.trim(),
        username: form.username.trim(),
        bio: form.bio.trim(),
      });
      updateUser({ ...updated, ...result.user });
      setAvatarFile(null); setPreview(null); setSaved(true);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={SECTION_TITLES[section]} wide={section !== 'root'}>
      {section === 'root' ? (
        <>
          <div className="flex flex-col items-center pb-5">
            <div className="relative">
              <Avatar name={user.displayName} src={user.avatarUrl} size="xl" cosmetics={user.cosmetics} />
              <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-4 border-white bg-accent-600 text-white dark:border-slate-900">
                <Camera size={14} />
              </span>
            </div>
            <p className="mt-3 text-xl font-bold text-slate-900 dark:text-white">
              <StarDisplayName name={user.displayName} cosmetics={user.cosmetics} verified={user.isVerified} />
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {user.phoneNumber ? `${maskPhone(user.phoneNumber)} · ` : ''}@{user.username}
            </p>
          </div>

          <div className="divide-y overflow-hidden rounded-2xl border bg-white dark:border-slate-800 dark:bg-slate-900">
            <SettingsRow icon={<UserRound size={19} />} color="bg-sky-500" title="Акаунт" subtitle="Номер, ім'я користувача, «Про себе»" onClick={() => setSection('account')} />
            <SettingsRow icon={<MessageSquare size={19} />} color="bg-orange-500" title="Налаштування чатів" subtitle="Тема, анімації, вигляд повідомлень" onClick={() => setSection('chats')} />
            <SettingsRow icon={<LockKeyhole size={19} />} color="bg-emerald-500" title="Приватність і безпека" subtitle="Підтвердження входу, номер телефону, сесії" onClick={() => setSection('privacy')} />
            <SettingsRow icon={<BellRing size={19} />} color="bg-rose-500" title="Сповіщення" subtitle="SMS про нові повідомлення" onClick={() => setSection('notifications')} />
            <SettingsRow icon={<Database size={19} />} color="bg-indigo-500" title="Дані та сховище" subtitle="Кеш застосунку та медіа" onClick={() => setSection('data')} />
            <SettingsRow icon={<Folder size={19} />} color="bg-blue-500" title="Папки для чатів" subtitle="Сортування чатів по папках" onClick={() => setSection('folders')} />
            <SettingsRow icon={<MonitorSmartphone size={19} />} color="bg-cyan-500" title="Пристрої" subtitle="Керування під'єднаними сесіями" onClick={() => setSection('devices')} />
            <SettingsRow icon={<BatteryCharging size={19} />} color="bg-amber-500" title="Економія енергії" subtitle="Менше анімацій за низького заряду" onClick={() => setSection('energy')} />
            <SettingsRow icon={<Languages size={19} />} color="bg-violet-500" title="Мова" subtitle="Українська" onClick={() => setSection('language')} />
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 border-t pt-5">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
              onClick={() => void logout()}
            >
              <LogOut size={17} /> Вийти з акаунта
            </button>
            <span className="text-xs text-slate-400">Miston 1.0.0</span>
          </div>
        </>
      ) : (
        <div>
          <BackButton onClick={() => setSection('root')} />
          {section === 'account' && (
            <form onSubmit={saveAccount}>
              <div
                className="mb-4 rounded-2xl border"
                style={backgroundGradient.length >= 2 ? { backgroundImage: `linear-gradient(135deg, ${backgroundGradient.join(', ')})` } : undefined}
              >
                <div className="flex items-center gap-5 p-4">
                  <button type="button" onClick={() => fileRef.current?.click()} className="group relative rounded-full" aria-label="Змінити фото профілю">
                    <Avatar name={form.displayName || user.displayName} src={preview || user.avatarUrl} size="xl" cosmetics={user.cosmetics} />
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-950/45 text-white opacity-0 transition group-hover:opacity-100"><Camera size={23} /></span>
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
                <div>
                  <span className="field-label">Номер телефону</span>
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm dark:bg-slate-800/70">
                    <span className="text-slate-600 dark:text-slate-300">{user.phoneNumber ? maskPhone(user.phoneNumber) : 'не вказано'}</span>
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${phoneVerified ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      <ShieldCheck size={13} /> {phoneVerified ? 'підтверджено' : 'не підтверджено'}
                    </span>
                  </div>
                </div>
              </div>
              {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}
              {saved && <p className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><CheckCircle2 size={17} /> Профіль успішно оновлено.</p>}
              <div className="mt-5 flex justify-end border-t pt-4">
                <button type="submit" className="primary-btn" disabled={saving || !form.displayName.trim() || !form.username.trim()}>{saving ? 'Збереження…' : 'Зберегти зміни'}</button>
              </div>
            </form>
          )}

          {section === 'chats' && (
            <div className="space-y-4">
              <div className="rounded-2xl border p-4 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Темна тема</p>
                    <p className="mt-1 text-xs text-slate-400">Зараз увімкнено: {theme === 'dark' ? 'темна' : 'світла'}.</p>
                  </div>
                  <button type="button" role="switch" aria-checked={theme === 'dark'} onClick={toggleTheme} className={`relative h-6 w-11 shrink-0 rounded-full transition ${theme === 'dark' ? 'bg-accent-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${theme === 'dark' ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>
                </div>
              </div>
              <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                Анімації, розмір тексту та вигляд бульбашок налаштовуються автоматично за системними параметрами пристрою.
              </p>
            </div>
          )}

          {section === 'privacy' && (
            <div className="space-y-4">
              <div className="rounded-2xl border p-4 dark:border-slate-800">
                <p className="flex items-center gap-2 text-sm font-semibold"><Smartphone size={16} /> Номер телефону</p>
                {phoneVerified ? (
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    {user.phoneNumber ? maskPhone(user.phoneNumber) : 'номер не вказано'} — підтверджено.
                  </p>
                ) : (
                  <>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      Додайте номер, щоб отримувати коди входу та SMS-сповіщення, коли Miston закритий.
                    </p>
                    <button
                      type="button"
                      className="secondary-btn mt-3"
                      onClick={() => updateUser({ ...user, phoneVerified: false })}
                    >
                      <Smartphone size={14} /> Підтвердити номер
                    </button>
                  </>
                )}
              </div>
              <div className="rounded-2xl border p-4 dark:border-slate-800">
                <p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={16} /> Підтвердження входу</p>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Після введення пароля Miston надсилає 8-значний код у чат із ботом <span className="font-semibold">Miston</span>.
                  Якщо доступу до застосунку немає, код приходить SMS на підтверджений номер.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSection('devices')}
                className="flex w-full items-center justify-between rounded-2xl border p-4 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
              >
                <span>
                  <span className="block text-sm font-semibold">Активні пристрої</span>
                  <span className="mt-1 block text-xs text-slate-400">Переглянути та завершити сесії</span>
                </span>
                <ChevronRight size={17} className="text-slate-300 dark:text-slate-600" />
              </button>
            </div>
          )}

          {section === 'notifications' && <NotificationSettings />}

          {section === 'data' && (
            <div className="space-y-4">
              <div className="rounded-2xl border p-4 dark:border-slate-800">
                <p className="flex items-center gap-2 text-sm font-semibold"><Database size={16} /> Кеш застосунку</p>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Використано: {cache || 'рахуємо…'}. Медіа зберігаються на сервері, тому кеш можна безпечно очистити.</p>
                <button
                  type="button"
                  className="secondary-btn mt-3"
                  onClick={() => {
                    if (!window.confirm('Очистити локальний кеш і перезавантажити Miston?')) return;
                    for (const key of Object.keys(localStorage)) {
                      if (key.startsWith('miston.') && key !== 'miston.energySaver') localStorage.removeItem(key);
                    }
                    window.location.reload();
                  }}
                >
                  Очистити кеш
                </button>
              </div>
              <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                Фото, відео та файли зберігаються на сервері Miston. Локально лишаються лише налаштування та кеш перегляду.
              </p>
            </div>
          )}

          {section === 'folders' && (
            <div className="rounded-2xl border p-5 text-center dark:border-slate-800">
              <Folder size={30} className="mx-auto text-blue-500" />
              <p className="mt-3 font-semibold">Папки для чатів</p>
              <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                Сортування чатів по папках з'явиться в наступному оновленні. Поки що чати впорядковані за останнім повідомленням.
              </p>
            </div>
          )}

          {section === 'devices' && (
            <div className="space-y-3">
              {sessions === null && !sessionsError && <p className="text-sm text-slate-400">Завантажуємо сесії…</p>}
              {sessionsError && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{sessionsError}</p>}
              {sessions?.length === 0 && <p className="text-sm text-slate-400">Активних сесій немає.</p>}
              {sessions?.map((session) => (
                <div key={session.id} className="flex items-center gap-3 rounded-2xl border p-4 dark:border-slate-800">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-white"><MonitorSmartphone size={19} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{deviceLabel(session.userAgent)}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Вхід: {new Date(session.createdAt).toLocaleString('uk-UA')}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400"
                    onClick={() => {
                      void api.auth.revokeSession(session.id)
                        .then(() => setSessions((current) => current?.filter((item) => item.id !== session.id) ?? null))
                        .catch((cause) => setSessionsError(errorMessage(cause)));
                    }}
                  >
                    Завершити
                  </button>
                </div>
              ))}
              <p className="text-xs leading-5 text-slate-400">
                Завершення сесії скасовує її токен оновлення. Поточний пристрій може залишатися в мережі до кінця терміну дії токена.
              </p>
            </div>
          )}

          {section === 'energy' && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4 rounded-2xl border p-4 dark:border-slate-800">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold"><BatteryCharging size={16} /> Економія енергії</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Вимикає важкі анімації та зменшує частоту оновлень, коли заряд низький.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={energySaver}
                  onClick={() => {
                    const next = !energySaver;
                    setEnergySaver(next);
                    localStorage.setItem('miston.energySaver', String(next));
                    document.documentElement.classList.toggle('reduce-motion', next);
                  }}
                  className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition ${energySaver ? 'bg-accent-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${energySaver ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
              <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                Налаштування зберігається лише на цьому пристрої.
              </p>
            </div>
          )}

          {section === 'language' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-2xl border p-4 dark:border-slate-800">
                <div>
                  <p className="text-sm font-semibold">Українська</p>
                  <p className="mt-1 text-xs text-slate-400">Мова інтерфейсу Miston</p>
                </div>
                <CheckCircle2 size={20} className="text-emerald-500" />
              </div>
              <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                Інші мови з'являться пізніше. Зараз інтерфейс повністю українською.
              </p>
            </div>
          )}

          {section === 'account' && (
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
          )}
        </div>
      )}
    </Modal>
  );
}
