import { Copy, QrCode } from 'lucide-react';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../../api';

interface MistIdCardProps {
  mistId: string;
  displayName: string;
  avatarUrl?: string | null;
}

interface LoginQr {
  token: string;
  expiresAt: string;
  dataUrl: string;
}

export function MistIdCard({ mistId, displayName, avatarUrl }: MistIdCardProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loginQr, setLoginQr] = useState<LoginQr | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(mistId, { width: 200, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
      .then((url: string) => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => { if (!cancelled) setQrDataUrl(null); });
    return () => { cancelled = true; };
  }, [mistId]);

  async function generateLoginQr() {
    setGenerating(true);
    setError('');
    try {
      const result = await api.mistQr.generate();
      const dataUrl = await QRCode.toDataURL(result.token, {
        width: 200,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      setLoginQr({ token: result.token, expiresAt: result.expiresAt, dataUrl });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      {avatarUrl && <img src={avatarUrl} alt={displayName} className="h-16 w-16 rounded-full object-cover" />}
      <p className="text-lg font-bold text-slate-900 dark:text-white">{displayName}</p>
      <p className="text-sm text-slate-500 dark:text-slate-400">{mistId}</p>
      {qrDataUrl ? (
        <img src={qrDataUrl} alt="QR-код Mist ID" className="h-48 w-48 rounded-2xl" />
      ) : (
        <div className="flex h-48 w-48 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
          <QrCode size={48} className="text-slate-400" />
        </div>
      )}
      <button type="button" className="secondary-btn px-4 py-2 text-xs" onClick={() => void navigator.clipboard.writeText(mistId)}>
        <Copy size={14} /> Копіювати Mist ID
      </button>

      <div className="mt-2 w-full border-t border-slate-200 pt-4 text-center dark:border-slate-700">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">QR-код для входу</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Відскануйте на іншому пристрої або скопіюйте код і введіть його на сторінці входу.
        </p>
        <button type="button" className="primary-btn mt-3 w-full py-2.5 text-xs" disabled={generating} onClick={() => void generateLoginQr()}>
          {generating ? 'Створення…' : 'Створити код'}
        </button>
        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
        {loginQr && (
          <div className="mt-3 flex flex-col items-center gap-2">
            <img src={loginQr.dataUrl} alt="QR-код для входу" className="h-40 w-40 rounded-xl bg-white p-1" />
            <code className="max-w-full break-all rounded-lg bg-slate-100 px-2 py-1 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{loginQr.token}</code>
            <button type="button" className="secondary-btn px-3 py-1.5 text-[11px]" onClick={() => void navigator.clipboard.writeText(loginQr.token)}>
              <Copy size={12} /> Копіювати код
            </button>
            <p className="text-[10px] text-slate-400">Дійсний до {new Date(loginQr.expiresAt).toLocaleTimeString('uk-UA')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
