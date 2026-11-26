/** Невеликий маскот Miston: живий, але без руху, що відволікає від стрічки. */
export function MistonMascot({ hint }: { hint: string }) {
  return (
    <div className="flex items-end gap-2" aria-label={`Підказка Miston: ${hint}`}>
      <div className="relative hidden shrink-0 sm:block">
        <svg className="miston-mascot h-16 w-16 drop-shadow-[0_8px_16px_rgba(0,122,255,0.28)]" viewBox="0 0 80 80" role="img" aria-hidden="true">
          <defs>
            <linearGradient id="miston-body" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#7FC4FF" />
              <stop offset="55%" stopColor="#3E9BFF" />
              <stop offset="100%" stopColor="#007AFF" />
            </linearGradient>
            <linearGradient id="miston-shine" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M40 9c1.6 0 2.8 1.2 2.8 2.8v5.4a2.8 2.8 0 0 1-5.6 0v-5.4A2.8 2.8 0 0 1 40 9Z" fill="#FFC857" />
          <circle cx="40" cy="8" r="4.2" fill="#FFD970" />
          <path d="M40 22c15.5 0 26 10.2 26 24.4C66 56.8 55.2 69 40 69S14 56.8 14 46.4C14 32.2 24.5 22 40 22Z" fill="url(#miston-body)" />
          <ellipse cx="30" cy="34" rx="11" ry="7" fill="url(#miston-shine)" opacity="0.5" transform="rotate(-18 30 34)" />
          <circle cx="31" cy="43" r="3.4" fill="#12355B" />
          <circle cx="49" cy="43" r="3.4" fill="#12355B" />
          <circle cx="32.1" cy="41.9" r="1.1" fill="#FFFFFF" />
          <circle cx="50.1" cy="41.9" r="1.1" fill="#FFFFFF" />
          <ellipse cx="24" cy="49" rx="4" ry="2.5" fill="#FF8FA3" opacity="0.75" />
          <ellipse cx="56" cy="49" rx="4" ry="2.5" fill="#FF8FA3" opacity="0.75" />
          <path d="M34 52c2 2.6 4.1 3.9 6 3.9s4-1.3 6-3.9" fill="none" stroke="#12355B" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M18 45c-2.3-1-3.7-3-3.7-5.3M62 45c2.3-1 3.7-3 3.7-5.3" fill="none" stroke="#2F8FFF" strokeWidth="2.4" strokeLinecap="round" opacity="0.55" />
        </svg>
        <span className="miston-halo absolute inset-0 -z-10 rounded-full bg-accent-400/20 blur-xl" />
      </div>
      <p className="rounded-2xl rounded-bl-sm bg-gradient-to-br from-accent-50 to-white px-3.5 py-2.5 text-xs font-medium leading-relaxed text-accent-900 shadow-sm dark:from-accent-950/50 dark:to-ios-surface dark:text-accent-200">
        <span className="mr-1">✦</span>{hint}
      </p>
    </div>
  );
}
