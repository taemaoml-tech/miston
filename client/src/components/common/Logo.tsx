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
    <svg width={size} height={size} viewBox="0 0 128 128" className={className} role="img" aria-hidden="true">
      <defs>
        <linearGradient id="miston-mark" x1="18" y1="8" x2="112" y2="120" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1687FF" />
          <stop offset="1" stopColor="#0062E8" />
        </linearGradient>
        <filter id="miston-mark-shadow" x="-25%" y="-20%" width="160%" height="170%">
          <feDropShadow dx="0" dy="7" stdDeviation="7" floodColor="#001A3A" floodOpacity=".35" />
        </filter>
      </defs>
      <rect x="9" y="8" width="110" height="110" rx="36" fill="url(#miston-mark)" filter="url(#miston-mark-shadow)" />
      <path d="M64 31c-19.3 0-35 13.8-35 30.8 0 9.2 4.6 17.5 12 23.1l-3.3 12.4 15.7-8.1c3.3.9 6.9 1.4 10.6 1.4 19.3 0 35-13.8 35-30.8S83.3 31 64 31Z" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M50 73V52l14 14 14-14v21" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
