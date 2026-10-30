/** Обгортка Miston існує лише для Android, тому інтерфейс питає платформу пристрою. */
export function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent);
}
