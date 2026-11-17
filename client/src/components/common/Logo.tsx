export function Logo({ compact = false, size = 36 }: { compact?: boolean; size?: number }) {
  return (
    <div className="flex items-center gap-2.5" aria-label="Planegram">
      <Mark size={size} />
      {!compact && <span className="text-xl font-bold tracking-tight">Planegram</span>}
    </div>
  );
}

export function Mark({ size = 36, className = 'shadow-glow' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-hidden="true">
      <defs>
        <linearGradient id="miston-mark" x1="14" y1="4" x2="50" y2="62" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4A97FF" />
          <stop offset=".45" stopColor="#007AFF" />
          <stop offset="1" stopColor="#003D7D" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#miston-mark)" />
      <g fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 39.6Q32 36.4 57 39.6" strokeWidth="2.3" />
        <path d="M7 35Q14 28 21 24" strokeWidth="1.8" />
        <path d="M57 35Q50 28 43 24" strokeWidth="1.8" />
        <path d="M21 24C24 15.5 40 15.5 43 24" strokeWidth="1.8" />
        <path d="M21 24C24 32.5 40 32.5 43 24" strokeWidth="1.8" />
        <path d="M21 24V49M25 24V49M39 24V49M43 24V49" strokeWidth="1.9" />
        <path d="M20 24H26M38 24H44M19.5 49H26.5M37.5 49H44.5" strokeWidth="1.9" />
        <path d="M21 27.5L25 32M25 27.5L21 32M21 33.5L25 38M25 33.5L21 38M39 27.5L43 32M43 27.5L39 32M39 33.5L43 38M43 33.5L39 38" strokeWidth="1.4" />
        <path d="M27 29.4V38.2M32 31.1V37.6M37 29.4V38.2" strokeWidth="1.1" opacity=".9" />
      </g>
    </svg>
  );
}
