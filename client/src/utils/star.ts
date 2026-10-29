import type { StarCategory, StarRarity } from '../types/models';

export const ACCENT_SCALES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const;

export const DEFAULT_ACCENT = [
  '#eef2ff', '#e0e7ff', '#c7d2fe', '#a5b4fc', '#818cf8',
  '#6366f1', '#4f46e5', '#4338ca', '#3730a3', '#312e81', '#1e1b4b',
];

export function hexToRgb(value: string): string | null {
  const trimmed = value.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(trimmed);
  if (short?.[1]) {
    const [r, g, b] = short[1].split('').map((part) => parseInt(part + part, 16));
    return `${r} ${g} ${b}`;
  }
  const full = /^#([0-9a-f]{6})$/i.exec(trimmed);
  if (!full?.[1]) return null;
  const number = parseInt(full[1], 16);
  return `${(number >> 16) & 255} ${(number >> 8) & 255} ${number & 255}`;
}

export function applyAccentPalette(palette?: unknown): void {
  const root = document.documentElement;
  const colors = Array.isArray(palette) && palette.length === ACCENT_SCALES.length
    ? palette.map((color) => String(color))
    : DEFAULT_ACCENT;
  ACCENT_SCALES.forEach((scale, index) => {
    const rgb = hexToRgb(colors[index] ?? DEFAULT_ACCENT[index]!);
    if (rgb) root.style.setProperty(`--accent-${scale}`, rgb);
  });
}

export function resetAccentPalette(): void {
  applyAccentPalette(DEFAULT_ACCENT);
}

export const RARITY_META: Record<StarRarity, { label: string; badge: string; card: string; glow: string }> = {
  common: {
    label: 'Звичайний',
    badge: 'bg-slate-200/80 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    card: 'from-slate-50 to-white dark:from-slate-800 dark:to-slate-900',
    glow: 'shadow-none',
  },
  rare: {
    label: 'Рідкісний',
    badge: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
    card: 'from-sky-50 to-white dark:from-sky-950/50 dark:to-slate-900',
    glow: 'shadow-[0_0_24px_-12px_rgba(56,189,248,.9)]',
  },
  epic: {
    label: 'Епічний',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
    card: 'from-violet-50 to-white dark:from-violet-950/50 dark:to-slate-900',
    glow: 'shadow-[0_0_28px_-10px_rgba(168,85,247,.85)]',
  },
  legendary: {
    label: 'Легендарний',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    card: 'from-amber-50 to-white dark:from-amber-950/40 dark:to-slate-900',
    glow: 'shadow-[0_0_30px_-8px_rgba(245,158,11,.9)]',
  },
  seasonal: {
    label: 'Сезонний',
    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
    card: 'from-rose-50 to-white dark:from-rose-950/40 dark:to-slate-900',
    glow: 'shadow-[0_0_26px_-10px_rgba(244,63,94,.8)]',
  },
};

export const CATEGORY_META: Record<StarCategory | 'inventory', { label: string; hint: string }> = {
  profile: { label: 'Профіль', hint: 'Рамки, ніки, аватари, фони та значки' },
  chats: { label: 'Чати', hint: 'Теми, фони, ефекти та звуки' },
  emoji: { label: 'Емодзі', hint: 'Ексклюзивні емодзі та стикери' },
  collections: { label: 'Колекції', hint: 'Рідкісні, сезонні та святкові набори' },
  inventory: { label: 'Інвентар', hint: 'Ваші покупки та екіпірування' },
};

export function configString(config: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = config?.[key];
  return typeof value === 'string' ? value : undefined;
}

export function configNumber(config: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = config?.[key];
  return typeof value === 'number' ? value : undefined;
}

export function configStringArray(config: Record<string, unknown> | undefined, key: string): string[] {
  const value = config?.[key];
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}
