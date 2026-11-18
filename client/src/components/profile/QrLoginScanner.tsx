import { Camera, Check, CheckCircle2, ImagePlus, ScanLine, X } from 'lucide-react';
import jsQR from 'jsqr';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { api } from '../../api';
import { errorMessage } from '../../utils/format';
import { Spinner } from '../common/Spinner';

type CameraStatus = 'idle' | 'starting' | 'active' | 'denied';

const TOKEN_PREFIX = 'mistlogin:';

function normalizeToken(raw: string): string {
  const value = raw.trim();
  return (value.startsWith(TOKEN_PREFIX) ? value.slice(TOKEN_PREFIX.length) : value).trim();
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

export function QrLoginScanner() {
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const scanningRef = useRef(false);
  const lastCodeRef = useRef<{ value: string; at: number } | null>(null);

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

  const approve = useCallback(async (raw: string) => {
    const token = normalizeToken(raw);
    if (!/^[a-f0-9]{48}$/i.test(token)) {
      setError('Це не код входу Miston. Відскануйте QR на сторінці входу іншого пристрою.');
      return;
    }
    if (scanningRef.current) return;
    scanningRef.current = true;
    setBusy(true);
    setError('');
    try {
      await api.mistQr.approveLoginSession(token);
      stopCamera();
      setApproved(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      scanningRef.current = false;
      setBusy(false);
    }
  }, [stopCamera]);

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
    void approve(value);
  }, [approve]);

  const startCamera = useCallback(async () => {
    stopCamera();
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('denied');
      setError('Камера недоступна в цьому браузері. Скористайтеся завантаженням фото або ручним вводом.');
      return;
    }
    setCameraStatus('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
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
      setError('Не вдалося відкрити камеру. Дозвольте доступ або скористайтеся іншими способами нижче.');
    }
  }, [decodeCameraFrame, stopCamera]);

  useEffect(() => {
    void startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    setBusy(true);
    setError('');
    try {
      const value = await readQrFromFile(file);
      if (!value) {
        setError('QR-код на зображенні не знайдено. Спробуйте чіткіше фото.');
        return;
      }
      await approve(value);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function handleManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void approve(manual);
  }

  if (approved) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[22px] border border-emerald-500/25 bg-emerald-500/10 p-8 text-center">
        <CheckCircle2 size={44} className="text-emerald-500" />
        <p className="text-base font-semibold text-ios-label">Вхід підтверджено</p>
        <p className="text-sm leading-6 text-ios-secondary">Інший пристрій увійшов у ваш акаунт без пароля. Цей QR-код більше не дійсний для повторного входу.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-ios-secondary">
        На іншому пристрої відкрийте <b>Вхід → QR-код</b>. Відскануйте код, що там показано, — пристрій увійде у ваш акаунт без пароля та додаткової перевірки.
      </p>

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
            <p className="text-sm font-semibold">{cameraStatus === 'starting' ? 'Запуск камери…' : 'Камера вимкнена'}</p>
            <p className="text-xs leading-5 text-white/70">Дозвольте доступ до камери або скористайтеся іншими способами нижче.</p>
            <button type="button" className="secondary-btn mt-1 border-white/30 bg-white/15 text-white hover:bg-white/25" onClick={() => void startCamera()} disabled={cameraStatus === 'starting'}>
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
        <label className="field-label" htmlFor="qr-login-manual">Або введіть код входу вручну</label>
        <div className="flex gap-2">
          <input
            id="qr-login-manual"
            className="text-input min-w-0 flex-1"
            value={manual}
            onChange={(event) => setManual(event.target.value)}
            placeholder="mistlogin:…"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className="primary-btn shrink-0" disabled={busy}>
            <ScanLine size={16} /> Підтвердити
          </button>
        </div>
      </form>

      {busy && <Spinner label="Підтверджуємо вхід…" />}
      {error && <div role="alert" className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">{error}</div>}
      <p className="flex items-center gap-1.5 text-[11px] text-ios-secondary"><Check size={13} /> Код короткоживучий і одноразовий: після підтвердження він більше не працює.</p>
    </div>
  );
}
