export function Logo({ compact = false, size = 36 }: { compact?: boolean; size?: number }) {
  return (
    <div className="flex items-center gap-2.5" aria-label="Miston">
      <Mark size={size} />
      {!compact && <span className="text-xl font-bold tracking-tight">Miston</span>}
    </div>
  );
}

export function Mark({ size = 36, className = 'shadow-glow' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-hidden="true">
      <defs>
        <linearGradient id="miston-mark" x1="10" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1" />
          <stop offset=".55" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#miston-mark)" />
      <path d="M14 20a6 6 0 0 1 6-6h24a6 6 0 0 1 6 6v16a6 6 0 0 1-6 6H32l-8 6v-6h-4a6 6 0 0 1-6-6V20Z" fill="#fff" />
      <path d="M23 35V23l9 7 9-7v12" fill="none" stroke="#6d28d9" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
