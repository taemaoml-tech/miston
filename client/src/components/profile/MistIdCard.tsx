import { Copy, QrCode } from 'lucide-react';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface MistIdCardProps {
  mistId: string;
  displayName: string;
  avatarUrl?: string | null;
}

export function MistIdCard({ mistId, displayName, avatarUrl }: MistIdCardProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(mistId, { width: 200, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
      .then((url: string) => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => { if (!cancelled) setQrDataUrl(null); });
    return () => { cancelled = true; };
  }, [mistId]);

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
    </div>
  );
}
