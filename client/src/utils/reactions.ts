// Keep this list and order in sync with server/src/utils/reactions.ts.
export const REACTION_EMOJIS = ['👍', '❤️', '🔥', '😂', '😮', '😢', '✅'] as const;

export const REACTION_LABELS: Record<string, string> = {
  '👍': 'Подобається',
  '❤️': 'Серце',
  '🔥': 'Вогонь',
  '😂': 'Смішно',
  '😮': 'Здивування',
  '😢': 'Сум',
  '✅': 'Погоджуюсь',
};
