/**
 * Normalizes a phone number to E.164 (`+380...`, `+1...`).
 * Accepts `+`, spaces, dashes and parentheses. Ukrainian local numbers
 * (`0XXXXXXXXX`) get the `+38` prefix automatically.
 */
export function normalizePhone(raw: string): string | null {
  const value = raw.trim();
  if (!/^[+\d][\d\s()-]{4,24}$/.test(value)) return null;

  let digits = value.replace(/\D/g, '');
  if (value.startsWith('+')) {
    // already international
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (/^0\d{9}$/.test(digits)) {
    digits = `38${digits}`;
  }

  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

export function maskPhone(phone: string): string {
  if (phone.length <= 6) return phone;
  return `${phone.slice(0, 3)}•••••${phone.slice(-2)}`;
}
