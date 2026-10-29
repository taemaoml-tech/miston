import { LoaderCircle } from 'lucide-react';

export function Spinner({ label = 'Завантаження', className = '' }: { label?: string; className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400 ${className}`} role="status">
      <LoaderCircle size={18} className="animate-spin" />
      <span>{label}</span>
    </div>
  );
}
