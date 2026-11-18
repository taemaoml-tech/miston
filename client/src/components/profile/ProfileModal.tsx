import {
  BatteryCharging, BellRing, Bot, Camera, Check, CheckCircle2, ChevronLeft, ChevronRight, Copy, Database,
  Folder, Languages, LockKeyhole, LogOut, Mail, MessageSquare, MonitorSmartphone, Palette, Pencil, Plus,
  QrCode, ShieldCheck, Smartphone, Trash2, UserRound,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { useEnergy } from '../../contexts/EnergyContext';
import { useFolders } from '../../contexts/FoldersContext';
import { LANGUAGES, useLanguage } from '../../contexts/LanguageContext';
import { useMessenger } from '../../contexts/MessengerContext';
import { useTheme } from '../../contexts/ThemeContext';
import { infoHref } from '../../router/infoRoute';
import { errorMessage } from '../../utils/format';
import { configStringArray } from '../../utils/star';
import type { BotAccount, LoginSession } from '../../types/models';
import { Avatar } from '../common/Avatar';
import { INFO_LINKS } from '../info/infoLinks';
import { Modal } from '../common/Modal';
import { NotificationSettings } from './NotificationSettings';
import { ProfileCustomization } from './ProfileCustomization';
import { MistIdCard } from './MistIdCard';
import { MistIdInbox } from './MistIdInbox';
import { QrLoginScanner } from './QrLoginScanner';
import { StarDisplayName } from '../star/StarDisplayName';

type Section =
  | 'root' | 'account' | 'appearance' | 'chats' | 'privacy' | 'notifications'
  | 'data' | 'folders' | 'devices' | 'energy' | 'language' | 'bots' | 'mistInbox' | 'qrLogin';

const SECTION_TITLES: Record<Section, string> = {
  root: 'Налаштування',
  account: 'Акаунт',
  appearance: 'Кастомізація профілю',
  chats: 'Налаштування чатів',
  privacy: 'Приватність і безпека',
  notifications: 'Сповіщення',
  data: 'Дані та сховище',
  folders: 'Папки для чатів',
  devices: 'Пристрої',
  energy: 'Економія енергії',
  language: 'Мова',
  bots: 'Боти',
  mistInbox: 'Пошта Mist ID',
  qrLogin: 'Вхід через QR код',
};

const SECTION_I18N_KEYS: Record<Section, string> = {
  root: 'settings', account: 'account', appearance: 'appearance', chats: 'chats',
  privacy: 'privacy', notifications: 'notifications', data: 'data', folders: 'folders',
  devices: 'devices', energy: 'energy', language: 'language', bots: 'bots',
  mistInbox: 'mistInbox', qrLogin: 'qrLogin',
};

const FOLDER_COLOR_OPTIONS = [
  { value: 'blue', label: 'Блакитний', hex: '#007AFF' },
  { value: 'green', label: 'Зелений', hex: '#34C759' },
  { value: 'purple', label: 'Фіолетовий', hex: '#AF52DE' },
  { value: 'amber', label: 'Оранжевий', hex: '#FF9F0A' },
  { value: 'rose', label: 'Рожевий', hex: '#FF2D55' },
  { value: 'cyan', label: 'Бірюзовий', hex: '#32ADE6' },
];

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
      className="flex w-full items-center gap-3.5 px-4 py-3 text-left transition hover:bg-ios-fill/10"
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm ${color}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-ios-label">{title}</span>
        <span className="block truncate text-xs text-ios-secondary">{subtitle}</span>
      </span>
      <ChevronRight size={17} className="shrink-0 text-ios-secondary" />
    </button>
  );
}

function BackButton({ onClick, label = 'Налаштування' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-ios-blue transition hover:text-accent-500"
    >
      <ChevronLeft size={17} /> {label}
    </button>
  );
}

export function ProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, updateUser, logout } = useAuth();
  const { conversations, selectConversation } = useMessenger();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { energySaving, setEnergySaving } = useEnergy();
  const { folders, loading: foldersLoading, error: foldersError, refresh: refreshFolders, createFolder, renameFolder, deleteFolder, addConversation, removeConversation } = useFolders();
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
  const [cache, setCache] = useState('');
  const [myBots, setMyBots] = useState<BotAccount[]>([]);
  const [botsError, setBotsError] = useState('');
  const [botsLoading, setBotsLoading] = useState(false);
  const [botToken, setBotToken] = useState('');
  const [botsBusy, setBotsBusy] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderColor, setFolderColor] = useState('blue');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);
  const [folderError, setFolderError] = useState('');
  const [tfStatus, setTfStatus] = useState<{ enabled: boolean; hint: string | null } | null>(null);
  const [tfCurrent, setTfCurrent] = useState('');
  const [tfNew, setTfNew] = useState('');
  const [tfHint, setTfHint] = useState('');
  const [tfDisablePass, setTfDisablePass] = useState('');
  const [tfError, setTfError] = useState('');
  const [tfBusy, setTfBusy] = useState(false);

  useEffect(() => {
    if (user && open) {
      setForm({ displayName: user.displayName ?? '', username: user.username ?? '', bio: user.bio ?? '' });
      setPreview(null); setAvatarFile(null); setError(''); setSaved(false); setSection('root');
    }
  }, [user, open]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  useEffect(() => {
    if (!open || section !== 'privacy') return;
    let active = true;
    setTfError('');
    api.auth.twoFactor.status()
      .then((result) => { if (active) setTfStatus(result); })
      .catch((cause) => { if (active) setTfError(errorMessage(cause)); });
    return () => { active = false; };
  }, [open, section]);
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
    if (!open || section !== 'folders') return;
    void refreshFolders();
  }, [open, section, refreshFolders]);

  useEffect(() => {
    if (!open || section !== 'bots') return;
    let active = true;
    setBotsLoading(true);
    setBotsError('');
    api.bots.mine()
      .then((result) => { if (active) setMyBots(result.bots); })
      .catch((cause) => { if (active) setBotsError(errorMessage(cause)); })
      .finally(() => { if (active) setBotsLoading(false); });
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

  async function submitFolder(event: FormEvent) {
    event.preventDefault();
    const name = folderName.trim();
    if (!name) return;
    setFolderBusy(true);
    setFolderError('');
    try {
      if (editingFolderId) await renameFolder(editingFolderId, { name, color: folderColor });
      else await createFolder(name, folderColor);
      setFolderName('');
      setFolderColor('blue');
      setEditingFolderId(null);
    } catch (cause) {
      setFolderError(errorMessage(cause));
    } finally {
      setFolderBusy(false);
    }
  }

  async function connectBot(event: FormEvent) {
    event.preventDefault();
    const token = botToken.trim();
    if (!token) return;
    setBotsBusy(true);
    setBotsError('');
    try {
      const result = await api.bots.connect(token);
      setMyBots((current) => [...current.filter((bot) => bot.id !== result.bot.id), result.bot]);
      setBotToken('');
    } catch (cause) {
      setBotsError(errorMessage(cause));
    } finally {
      setBotsBusy(false);
    }
  }

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
    <Modal open={open} onClose={onClose} title={t(SECTION_I18N_KEYS[section], SECTION_TITLES[section])} wide={section !== 'root'}>
      {section === 'root' ? (
        <>
          <div className="flex flex-col items-center pb-5">
            <div className="relative">
              <Avatar name={user.displayName} src={user.avatarUrl} size="xl" cosmetics={user.cosmetics} />
              <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-4 border-ios-bg bg-ios-blue text-white">
                <Camera size={14} />
              </span>
            </div>
            <p className="mt-3 text-xl font-bold text-ios-label">
              <StarDisplayName name={user.displayName} cosmetics={user.cosmetics} verified={user.isVerified} />
            </p>
            <p className="mt-1 text-sm text-ios-secondary">
              {user.mistId || `${user.username}@mist.id`}
            </p>
          </div>

          <div className="divide-y divide-ios-separator/10 overflow-hidden rounded-[22px] border border-ios-separator/10 bg-ios-bg/70">
            <SettingsRow icon={<QrCode size={19} />} color="bg-blue-500" title={t('qrLogin', 'Вхід через QR код')} subtitle={t('qrLoginSub', 'Відскануйте код з іншого пристрою')} onClick={() => setSection('qrLogin')} />
            <SettingsRow icon={<Mail size={19} />} color="bg-indigo-500" title={t('mistInbox', 'Пошта Mist ID')} subtitle={t('mistInboxSub', 'Системні повідомлення акаунту')} onClick={() => setSection('mistInbox')} />
            <SettingsRow icon={<UserRound size={19} />} color="bg-sky-500" title={t('account', 'Акаунт')} subtitle={t('accountSub', 'Номер, ім\'я користувача, «Про себе»')} onClick={() => setSection('account')} />
            <SettingsRow icon={<Palette size={19} />} color="bg-pink-500" title={t('appearance', 'Кастомізація профілю')} subtitle={t('appearanceSub', 'Рамки, колір імені, значки — безкоштовно')} onClick={() => setSection('appearance')} />
            <SettingsRow icon={<MessageSquare size={19} />} color="bg-orange-500" title={t('chats', 'Налаштування чатів')} subtitle={t('chatsSub', 'Тема, анімації, вигляд повідомлень')} onClick={() => setSection('chats')} />
            <SettingsRow icon={<LockKeyhole size={19} />} color="bg-emerald-500" title={t('privacy', 'Приватність і безпека')} subtitle={t('privacySub', 'Підтвердження входу, номер телефону, сесії')} onClick={() => setSection('privacy')} />
            <SettingsRow icon={<BellRing size={19} />} color="bg-rose-500" title={t('notifications', 'Сповіщення')} subtitle={t('notificationsSub', 'SMS про нові повідомлення')} onClick={() => setSection('notifications')} />
            <SettingsRow icon={<Database size={19} />} color="bg-indigo-500" title={t('data', 'Дані та сховище')} subtitle={t('dataSub', 'Кеш застосунку та медіа')} onClick={() => setSection('data')} />
            <SettingsRow icon={<Folder size={19} />} color="bg-blue-500" title={t('folders', 'Папки для чатів')} subtitle={t('foldersSub', 'Сортування чатів по папках')} onClick={() => setSection('folders')} />
            <SettingsRow icon={<MonitorSmartphone size={19} />} color="bg-cyan-500" title={t('devices', 'Пристрої')} subtitle={t('devicesSub', 'Керування під\'єднаними сесіями')} onClick={() => setSection('devices')} />
            <SettingsRow icon={<Bot size={19} />} color="bg-purple-500" title={t('bots', 'Боти')} subtitle={t('botsSub', 'Створення та керування ботами через BotFather')} onClick={() => setSection('bots')} />
            <SettingsRow icon={<BatteryCharging size={19} />} color="bg-amber-500" title={t('energy', 'Економія енергії')} subtitle={t('energySub', 'Менше анімацій за низького заряду')} onClick={() => setSection('energy')} />
            <SettingsRow icon={<Languages size={19} />} color="bg-violet-500" title={t('language', 'Мова')} subtitle={LANGUAGES.find((item) => item.code === language)?.label || 'Українська'} onClick={() => setSection('language')} />
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 border-t pt-5">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
              onClick={() => void logout()}
            >
              <LogOut size={17} /> Вийти з акаунта
            </button>
            <span className="text-xs text-ios-secondary">Miston 1.0.0</span>
          </div>
        </>
      ) : (
        <div>
          <BackButton onClick={() => setSection('root')} label={t('settings', 'Налаштування')} />
          {section === 'account' && (
            <>
              <div className="mb-4">
                <MistIdCard mistId={user.mistId || `${user.username}@mist.id`} displayName={user.displayName} avatarUrl={user.avatarUrl} />
              </div>
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
                <div><span className="field-label">Mist ID</span><div className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">{user.mistId || `${user.username}@mist.id`}</div></div>
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
            </>
          )}

          {section === 'appearance' && <ProfileCustomization />}

          {section === 'chats' && (
            <div className="space-y-4">
              <div className="rounded-2xl border p-4 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Темна тема</p>
                    <p className="mt-1 text-xs text-slate-400">Зараз увімкнено: {theme === 'dark' ? 'темна' : 'світла'}.</p>
                  </div>
                  <button type="button" role="switch" aria-checked={theme === 'dark'} onClick={toggleTheme} className={`relative h-6 w-11 shrink-0 rounded-full transition ${theme === 'dark' ? 'bg-ios-blue' : 'bg-ios-fill/30'}`}>
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

              <div className="rounded-2xl border p-4 dark:border-slate-800">
                <p className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole size={16} /> Двоетапна перевірка</p>
                {tfStatus?.enabled ? (
                  <>
                    <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">Увімкнено{tfStatus.hint ? ` · підказка: ${tfStatus.hint}` : ''}.</p>
                    <p className="mt-1 text-xs text-slate-400">При вході з нового пристрою після SMS-коду потрібен цей пароль.</p>
                    <label className="mt-3 block"><span className="field-label">Пароль двоетапної перевірки</span>
                      <input type="password" className="text-input" value={tfDisablePass} onChange={(e) => setTfDisablePass(e.target.value)} placeholder="Введіть, щоб вимкнути" />
                    </label>
                    {tfError && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{tfError}</p>}
                    <button
                      type="button"
                      className="secondary-btn mt-3"
                      disabled={tfBusy || !tfDisablePass}
                      onClick={() => {
                        setTfBusy(true); setTfError('');
                        api.auth.twoFactor.disable(tfDisablePass)
                          .then((r) => { setTfStatus({ enabled: r.enabled, hint: null }); setTfDisablePass(''); })
                          .catch((cause) => setTfError(errorMessage(cause)))
                          .finally(() => setTfBusy(false));
                      }}
                    >Вимкнути двоетапну перевірку</button>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                      Додатковий пароль, який запитується при вході з нового пристрою після коду підтвердження.
                    </p>
                    <label className="mt-3 block"><span className="field-label">Поточний пароль акаунта</span>
                      <input type="password" className="text-input" value={tfCurrent} onChange={(e) => setTfCurrent(e.target.value)} />
                    </label>
                    <label className="mt-3 block"><span className="field-label">Новий пароль двоетапної перевірки</span>
                      <input type="password" className="text-input" value={tfNew} onChange={(e) => setTfNew(e.target.value)} placeholder="мінімум 6 символів" />
                    </label>
                    <label className="mt-3 block"><span className="field-label">Підказка (необов'язково)</span>
                      <input className="text-input" value={tfHint} onChange={(e) => setTfHint(e.target.value)} placeholder="Напр. улюблене місто" />
                    </label>
                    {tfError && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{tfError}</p>}
                    <button
                      type="button"
                      className="primary-btn mt-3"
                      disabled={tfBusy || !tfCurrent || tfNew.length < 6}
                      onClick={() => {
                        setTfBusy(true); setTfError('');
                        api.auth.twoFactor.setup(tfCurrent, tfNew, tfHint || undefined)
                          .then((r) => { setTfStatus({ enabled: r.enabled, hint: tfHint || null }); setTfCurrent(''); setTfNew(''); setTfHint(''); })
                          .catch((cause) => setTfError(errorMessage(cause)))
                          .finally(() => setTfBusy(false));
                      }}
                    >Увімкнути двоетапну перевірку</button>
                  </>
                )}
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
          {section === 'mistInbox' && <MistIdInbox />}
          {section === 'qrLogin' && <QrLoginScanner />}

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
                      if (key.startsWith('miston.') && key !== 'miston.energySaver' && key !== 'miston.activeFolder') localStorage.removeItem(key);
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
            <div className="space-y-4">
              <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                {t('foldersIntro', 'Створюйте папки й розкладайте чати, щоб швидко знаходити потрібні розмови.')}
              </p>
              <form onSubmit={(event) => { void submitFolder(event); }} className="space-y-3 rounded-2xl border border-ios-separator/15 p-4">
                <div>
                  <label className="field-label" htmlFor="folder-name">{t('folderName', 'Назва папки')}</label>
                  <input id="folder-name" value={folderName} onChange={(event) => setFolderName(event.target.value)} maxLength={60} className="text-input" placeholder={t('folderName', 'Назва папки')} />
                </div>
                <div>
                  <p className="field-label">{t('folderColor', 'Колір')}</p>
                  <div className="flex flex-wrap gap-2">
                    {FOLDER_COLOR_OPTIONS.map((option) => (
                      <button type="button" key={option.value} onClick={() => setFolderColor(option.value)} aria-label={option.label} aria-pressed={folderColor === option.value} className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition ${folderColor === option.value ? 'border-ios-label scale-110' : 'border-transparent'}`} style={{ backgroundColor: option.hex }}>
                        {folderColor === option.value && <Check size={15} className="text-white" />}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="submit" disabled={folderBusy || !folderName.trim()} className="primary-btn">
                    {editingFolderId ? <Check size={16} /> : <Plus size={16} />}
                    {editingFolderId ? t('saved', 'Зберегти') : t('createFolder', 'Створити папку')}
                  </button>
                  {editingFolderId && <button type="button" className="secondary-btn" onClick={() => { setEditingFolderId(null); setFolderName(''); setFolderColor('blue'); }}>{t('cancel', 'Скасувати')}</button>}
                </div>
                {(folderError || foldersError) && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{folderError || foldersError}</p>}
              </form>
              <div className="space-y-2">
                {foldersLoading && <p className="text-sm text-ios-secondary">Завантаження…</p>}
                {!foldersLoading && folders.length === 0 && (
                  <p className="rounded-2xl border border-dashed p-5 text-center text-sm text-ios-secondary">{t('noFolders', 'Папок ще немає. Створіть першу, щоб відсортувати чати.')}</p>
                )}
                {folders.map((folder) => {
                  const assignedIds = folder.conversationIds;
                  return (
                    <div key={folder.id} className="rounded-2xl border border-ios-separator/15 p-4">
                      <div className="flex items-center gap-3">
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: FOLDER_COLOR_OPTIONS.find((item) => item.value === folder.color)?.hex || '#007AFF' }} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-ios-label">{folder.name}</p>
                          <p className="text-xs text-ios-secondary">{assignedIds.length} {t('chatsCount', 'чатів')}</p>
                        </div>
                        <button type="button" className="icon-btn !h-8 !w-8" aria-label={t('rename', 'Перейменувати')} onClick={() => { setEditingFolderId(folder.id); setFolderName(folder.name); setFolderColor(folder.color); }}><Pencil size={15} /></button>
                        <button type="button" className="icon-btn !h-8 !w-8 text-rose-600 dark:text-rose-400" aria-label={t('delete', 'Видалити')} onClick={() => { void deleteFolder(folder.id).catch((cause) => setFolderError(errorMessage(cause))); }}><Trash2 size={15} /></button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {conversations.filter((conversation) => conversation.kind !== 'saved' && conversation.kind !== 'channel').map((conversation) => {
                          const assigned = assignedIds.includes(conversation.id);
                          return (
                            <button type="button" key={conversation.id} onClick={() => { void (assigned ? removeConversation(folder.id, conversation.id) : addConversation(folder.id, conversation.id)).catch((cause) => setFolderError(errorMessage(cause))); }} className={`inline-flex max-w-[180px] items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${assigned ? 'bg-ios-blue/15 text-ios-blue' : 'bg-ios-fill/10 text-ios-secondary hover:bg-ios-fill/20'}`}>
                              <span className="truncate">{conversation.title}</span>
                              {assigned && <Check size={12} className="shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs leading-5 text-ios-secondary">
                {t('assign', 'Додати до папки')}: {t('allChats', 'Усі чати')} → {t('folders', 'Папки для чатів')}.
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

          {section === 'bots' && (
            <div className="space-y-4">
              <button
                type="button"
                className="primary-btn w-full"
                onClick={() => {
                  void api.bots.father().then((result) => {
                    return api.conversations.create({ kind: 'direct', userId: result.user.id }).then((conv) => {
                      selectConversation(conv.conversation.id);
                      onClose();
                    });
                  }).catch((cause) => setBotsError(errorMessage(cause)));
                }}
              >
                <Bot size={16} /> {t('openBotFather', 'Відкрити BotFather')}
              </button>
              <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                {t('botsIntro', 'Створюйте ботів у чаті з BotFather або підключіть готовий бот за токеном.')}
                {' '}{t('botCommand', 'У чаті з BotFather напишіть /newbot Назва usernamebot, щоб створити бота.')}
              </p>
              <form onSubmit={(event) => { void connectBot(event); }} className="space-y-2 rounded-2xl border border-ios-separator/15 p-4">
                <label className="field-label" htmlFor="bot-token">{t('botToken', 'Токен бота')}</label>
                <input id="bot-token" value={botToken} onChange={(event) => setBotToken(event.target.value)} className="text-input font-mono text-xs" placeholder={t('tokenPlaceholder', 'Вставте токен від BotFather')} />
                <button type="submit" disabled={botsBusy || !botToken.trim()} className="primary-btn">
                  <Plus size={16} /> {t('connect', 'Підключити')}
                </button>
              </form>
              {botsLoading && <p className="text-sm text-ios-secondary">Завантажуємо ботів…</p>}
              {botsError && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{botsError}</p>}
              {!botsLoading && myBots.length === 0 && (
                <p className="rounded-2xl border border-dashed p-5 text-center text-sm text-ios-secondary">{t('noBots', 'У вас ще немає ботів. Створіть бота через BotFather або підключіть за токеном.')}</p>
              )}
              {myBots.length > 0 && <p className="text-sm font-semibold text-ios-label">{t('myBots', 'Мої боти')}</p>}
              {myBots.map((bot) => (
                <div key={bot.id} className="rounded-2xl border border-ios-separator/15 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">@{bot.username}</p>
                      <p className="mt-0.5 truncate text-xs text-ios-secondary">{bot.displayName}{bot.funMode ? ` · 🎉 ${t('funMode', 'Веселун')}` : ''}</p>
                    </div>
                    <button
                      type="button"
                      className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400"
                      onClick={() => {
                        void api.bots.remove(bot.username)
                          .then(() => setMyBots((current) => current.filter((item) => item.id !== bot.id)))
                          .catch((cause) => setBotsError(errorMessage(cause)));
                      }}
                    >
                      {t('delete', 'Видалити')}
                    </button>
                  </div>
                  <label className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-ios-fill/10 px-3 py-2">
                    <span className="text-xs font-medium text-ios-label">🎉 {t('funMode', 'Веселун')}</span>
                    <input type="checkbox" checked={bot.funMode} onChange={(event) => {
                      void api.bots.update(bot.username, { funMode: event.target.checked })
                        .then((result) => setMyBots((current) => current.map((item) => item.id === bot.id ? result.bot : item)))
                        .catch((cause) => setBotsError(errorMessage(cause)));
                    }} className="h-5 w-5 accent-ios-blue" aria-label={t('funMode', 'Веселун')} />
                  </label>
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-ios-fill/10 px-3 py-2">
                    <code className="min-w-0 flex-1 truncate text-xs text-slate-600 dark:text-slate-300">{bot.token}</code>
                    <button
                      type="button"
                      className="shrink-0 text-ios-secondary hover:text-accent-600"
                      onClick={() => { void navigator.clipboard?.writeText(bot.token); }}
                      aria-label={t('copyToken', 'Скопіювати токен')}
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {section === 'energy' && (
            <div className="space-y-4">
              <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                {t('energyIntro', 'Режим економії вимикає анімації та скляні ефекти, щоб зберегти заряд батареї.')}
              </p>
              <div className="rounded-2xl border border-ios-separator/15 p-4">
                <label className="flex items-center justify-between gap-4">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ios-label">{t('energy', 'Економія енергії')}</span>
                    <span className="mt-1 block text-xs leading-5 text-ios-secondary">{t('energyHint', 'Анімації та розмиття лишатимуться вимкненими, доки ви не вимкнете цей режим.')}</span>
                  </span>
                  <input type="checkbox" checked={energySaving} onChange={(event) => setEnergySaving(event.target.checked)} className="h-6 w-6 shrink-0 accent-ios-blue" aria-label={t('energy', 'Економія енергії')} />
                </label>
              </div>
              <ul className="space-y-2 rounded-2xl bg-ios-fill/10 p-4 text-sm text-ios-secondary">
                <li className="flex items-center gap-2"><Check size={15} className="shrink-0 text-emerald-500" />{t('energyEffect1', 'Без анімацій переходів')}</li>
                <li className="flex items-center gap-2"><Check size={15} className="shrink-0 text-emerald-500" />{t('energyEffect2', 'Без скляного розмиття')}</li>
                <li className="flex items-center gap-2"><Check size={15} className="shrink-0 text-emerald-500" />{t('energyEffect3', 'Менше оновлень екрана')}</li>
              </ul>
              <p className="text-xs leading-5 text-ios-secondary">Налаштування зберігається на цьому пристрої.</p>
            </div>
          )}

          {section === 'language' && (
            <div className="space-y-3">
              <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                {t('languageIntro', 'Оберіть мову інтерфейсу. Неперекладені повідомлення лишаються українською.')}
              </p>
              <div className="divide-y divide-ios-separator/10 overflow-hidden rounded-2xl border border-ios-separator/15">
                {LANGUAGES.map((item) => (
                  <button type="button" key={item.code} onClick={() => setLanguage(item.code)} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-ios-fill/10" aria-pressed={language === item.code}>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ios-label">{item.label}</span>
                      <span className="mt-0.5 block text-xs text-ios-secondary">{t('interfaceLanguage', 'Мова інтерфейсу Miston')}</span>
                    </span>
                    {language === item.code && <CheckCircle2 size={20} className="shrink-0 text-emerald-500" />}
                  </button>
                ))}
              </div>
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

