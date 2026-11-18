import { Camera, Check, Copy, ImagePlus, QrCode, ScanLine, Search, X } from 'lucide-react';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { api } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import type { UserProfile } from '../../types/models';
import { errorMessage } from '../../utils/format';
import { Avatar } from '../common/Avatar';
import { Modal } from '../common/Modal';
import { Spinner } from '../common/Spinner';
import { StarDisplayName } from '../star/StarDisplayName';

interface FriendsQrModalProps {
  open: boolean;
  onClose: () => void;
  onOpenUser: (id: string) => void;
}

type QrTab = 'card' | 'scan';
type CameraStatus = 'idle' | 'starting' | 'active' | 'denied';

function normalizeMistId(raw: string): string {
  const value = raw.trim().replace(/\s+/g, '').replace(/^mistid:/i, '').replace(/^@/, '').toLowerCase();
  if (!value) return '';
  return value.includes('@') ? value : `${value}@mist.id`;
}

function drawAndDecode(image: CanvasImageSource, width: number, height: number): string | null {
  if (!width || !height) return null;
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1600 / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const code = jsQR(
    context.getImageData(0, 0, canvas.width, canvas.height).data,
    canvas.width,
    canvas.height,
    { inversionAttempts: 'attemptBoth' },
  );
  return code?.data?.trim() || null;
}

async function readQrFromFile(file: File): Promise<string | null> {
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(file);
    try {
      return drawAndDecode(bitmap, bitmap.width, bitmap.height);
    } finally {
      bitmap.close();
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Не вдалося прочитати зображення.'));
      image.src = url;
    });
    return drawAndDecode(image, image.naturalWidth, image.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function FriendsQrModal({ open, onClose, onOpenUser }: FriendsQrModalProps) {
  const { user } = useAuth();
  const [tab, setTab] = useState<QrTab>('card');
  const [cardQr, setCardQr] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [matches, setMatches] = useState<UserProfile[]>([]);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const scanningRef = useRef(false);
  const lastCodeRef = useRef<{ value: string; at: number } | null>(null);

  const mistId = user?.mistId?.trim() || (user ? `${user.username}@mist.id` : '');

  useEffect(() => {
    if (!mistId || !open) return;
    let cancelled = false;
    QRCode.toDataURL(mistId, {
      width: 240,
      margin: 1,
      color: { dark: '#111827', light: '#ffffff' },
    }).then((url: string) => {
      if (!cancelled) setCardQr(url);
    }).catch(() => {
      if (!cancelled) setCardQr(null);
    });
    return () => { cancelled = true; };
  }, [mistId, open]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setNotice('');
    setMatches([]);
    setManual('');
  }, [open]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const stopCamera = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    scanningRef.current = false;
    setCameraStatus('idle');
  }, []);

  const resolveMistId = useCallback(async (raw: string) => {
    const candidate = normalizeMistId(raw);
    if (!candidate) {
      setError('Введіть Mist ID друга, наприклад artemoml@mist.id.');
      return;
    }
    if (/^[a-f0-9]{48}$/i.test(raw.trim())) {
      setError('Це код входу, а не картка друга. Відскануйте QR на картці Mist ID.');
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    setMatches([]);
    try {
      const { users } = await api.users.search(candidate);
      const exact = users.find((found) => normalizeMistId(found.mistId || `${found.username}@mist.id`) === candidate);
      const target = exact ?? (users.length === 1 ? users[0] : null);

      if (target) {
        onOpenUser(target.id);
        onClose();
        return;
      }

      const choices = users.filter((found) => found.id !== user?.id);
      if (choices.length > 1) {
        setMatches(choices);
        setNotice('Знайдено кілька профілів. Виберіть потрібний.');
        return;
      }
      setError(`Користувача «${candidate}» не знайдено.`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }, [onClose, onOpenUser, user?.id]);

  const decodeCameraFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const scale = Math.min(1, 900 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const code = jsQR(
      context.getImageData(0, 0, canvas.width, canvas.height).data,
      canvas.width,
      canvas.height,
      { inversionAttempts: 'attemptBoth' },
    );
    const value = code?.data?.trim();
    if (!value) return;

    const last = lastCodeRef.current;
    if (scanningRef.current || (last && last.value === value && Date.now() - last.at < 2500)) return;
    lastCodeRef.current = { value, at: Date.now() };
    scanningRef.current = true;
    void resolveMistId(value).finally(() => { scanningRef.current = false; });
  }, [resolveMistId]);

  const startCamera = useCallback(async () => {
    stopCamera();
    setError('');
    setNotice('');
    setMatches([]);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('denied');
      setError('Камера недоступна в цьому браузері. Завантажте фото або введіть Mist ID вручну.');
      return;
    }

    setCameraStatus('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      if (!open || tab !== 'scan') {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setCameraStatus('active');

      const tick = () => {
        if (!streamRef.current || !videoRef.current) return;
        if (videoRef.current.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) decodeCameraFrame();
        frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
    } catch {
      setCameraStatus('denied');
      setError('Не вдалося відкрити камеру. Дозвольте доступ або скористайтеся завантаженням фото / ручним вводом.');
    }
  }, [decodeCameraFrame, open, stopCamera, tab]);

  useEffect(() => {
    if (!open || tab !== 'scan') {
      stopCamera();
      return;
    }
    void startCamera();
    return () => stopCamera();
  }, [open, tab, startCamera, stopCamera]);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    setBusy(true);
    setError('');
    setNotice('');
    setMatches([]);
    try {
      const value = await readQrFromFile(file);
      if (!value) {
        setError('QR-код на зображенні не знайдено. Спробуйте чіткіше фото.');
        return;
      }
      await resolveMistId(value);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function handleManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void resolveMistId(manual);
  }

  async function copyMistId() {
    if (!mistId) return;
    try {
      await navigator.clipboard.writeText(mistId);
      setCopied(true);
    } catch {
      setError('Не вдалося скопіювати Mist ID.');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tab === 'card' ? 'Моя картка Mist ID' : 'Друзі за QR-кодом'}
      description={tab === 'card'
        ? 'Покажіть картку другу або відскануйте його картку.'
        : 'Відскануйте QR, завантажте фото або введіть Mist ID.'}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-1 rounded-full bg-ios-fill/10 p-1" role="tablist" aria-label="Режим QR-картки">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'card'}
            onClick={() => setTab('card')}
            className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold transition ${tab === 'card' ? 'bg-ios-bg text-ios-label shadow-sm' : 'text-ios-secondary'}`}
          >
            <QrCode size={16} /> Моя картка
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'scan'}
            onClick={() => setTab('scan')}
            className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold transition ${tab === 'scan' ? 'bg-ios-bg text-ios-label shadow-sm' : 'text-ios-secondary'}`}
          >
            <ScanLine size={16} /> Сканувати
          </button>
        </div>

        {tab === 'card' ? (
          <div>
            <div className="wallet-card relative isolate overflow-hidden rounded-[26px] bg-gradient-to-br from-[#0A84FF] via-[#007AFF] to-[#5E5CE6] p-5 text-white shadow-glow">
              <div className="wallet-shine pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
              <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/20 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-black/20 blur-2xl" />

              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-white/75">Mist ID · Miston</p>
                  <div className="mt-3 flex items-center gap-3">
                    <Avatar name={user?.displayName ?? 'Користувач'} src={user?.avatarUrl} size="lg" cosmetics={user?.cosmetics} />
                    <div className="min-w-0">
                      <p className="truncate text-lg font-bold text-white">
                        <StarDisplayName name={user?.displayName ?? 'Користувач'} cosmetics={user?.cosmetics} verified={user?.isVerified} />
                      </p>
                      <p className="truncate text-sm text-white/75">@{user?.username ?? 'user'}</p>
                    </div>
                  </div>
                </div>
                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-white p-2 shadow-lg">
                  {cardQr ? (
                    <img src={cardQr} alt="QR-код картки Mist ID" className="h-full w-full" />
                  ) : (
                    <QrCode size={56} className="text-slate-900" />
                  )}
                </div>
              </div>

              <div className="relative mt-6 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] text-white/70">Ваша адреса для друзів</p>
                  <p className="truncate text-base font-semibold text-white">{mistId || '—'}</p>
                </div>
                <div className="h-8 w-12 shrink-0 rounded-md bg-gradient-to-r from-white/70 via-white/20 to-white/70 opacity-70" />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" className="secondary-btn" onClick={() => void copyMistId()}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Скопійовано' : 'Копіювати Mist ID'}
              </button>
              <button type="button" className="primary-btn" onClick={() => setTab('scan')}>
                <ScanLine size={16} /> Сканувати друга
              </button>
            </div>
            <p className="mt-3 text-center text-xs leading-5 text-ios-secondary">
              У QR-коді записаний ваш Mist ID. Після сканування відкриється профіль — без автоматичного запиту у друзі.
            </p>
            {error && <div role="alert" className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">{error}</div>}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative aspect-square w-full overflow-hidden rounded-[24px] bg-black">
              <video
                ref={videoRef}
                muted
                playsInline
                className={`h-full w-full object-cover transition-opacity ${cameraStatus === 'active' ? 'opacity-100' : 'opacity-0'}`}
              />
              <canvas ref={canvasRef} className="hidden" />

              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="qr-scan-frame h-64 w-64 rounded-3xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,.38)]" />
              </div>

              {cameraStatus !== 'active' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-white">
                  <Camera size={32} className="text-white/85" />
                  <p className="text-sm font-semibold">
                    {cameraStatus === 'starting' ? 'Запуск камери…' : 'Камера вимкнена'}
                  </p>
                  <p className="text-xs leading-5 text-white/70">Дозвольте доступ до камери або скористайтеся іншими способами нижче.</p>
                  <button
                    type="button"
                    className="secondary-btn mt-1 border-white/30 bg-white/15 text-white hover:bg-white/25"
                    onClick={() => void startCamera()}
                    disabled={cameraStatus === 'starting'}
                  >
                    <Camera size={15} /> Увімкнути камеру
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="secondary-btn" onClick={() => fileRef.current?.click()} disabled={busy}>
                <ImagePlus size={16} /> Завантажити фото
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => void handleFile(event)} />
              <button type="button" className="secondary-btn" onClick={stopCamera} disabled={cameraStatus !== 'active'}>
                <X size={16} /> Вимкнути камеру
              </button>
            </div>

            <form onSubmit={handleManual} className="space-y-2">
              <label className="field-label" htmlFor="friends-qr-mist-id">Або введіть Mist ID вручну</label>
              <div className="flex gap-2">
                <input
                  id="friends-qr-mist-id"
                  className="text-input min-w-0 flex-1"
                  value={manual}
                  onChange={(event) => setManual(event.target.value)}
                  placeholder="name@mist.id"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button type="submit" className="primary-btn shrink-0" disabled={busy}>
                  <Search size={16} /> Знайти
                </button>
              </div>
            </form>

            {busy && <Spinner label="Шукаємо профіль…" />}
            {notice && <p className="rounded-xl bg-ios-fill/10 px-3 py-2 text-xs text-ios-secondary">{notice}</p>}
            {error && <div role="alert" className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">{error}</div>}

            {matches.length > 0 && (
              <ul className="space-y-1">
                {matches.map((candidate) => (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-2xl bg-ios-fill/10 p-2 text-left transition hover:bg-ios-fill/20"
                      onClick={() => {
                        onOpenUser(candidate.id);
                        onClose();
                      }}
                    >
                      <Avatar name={candidate.displayName} src={candidate.avatarUrl} size="sm" cosmetics={candidate.cosmetics} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{candidate.displayName}</span>
                        <span className="block truncate text-xs text-ios-secondary">{candidate.mistId || `@${candidate.username}`}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
