import { config } from '../config/env';
import { AppError } from '../utils/errors';

export type SmsProvider = 'zavu' | 'twilio';

/** Які провайдери реально налаштовані (Zavu має перевагу над Twilio). */
export function smsProvider(): SmsProvider | null {
  return smsProviders()[0] ?? null;
}

/** Усі налаштовані провайдери у порядку пріоритету: Zavu, потім Twilio. */
export function smsProviders(): SmsProvider[] {
  const providers: SmsProvider[] = [];
  if (config.ZAVU_API_KEY) providers.push('zavu');
  if (config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN && config.TWILIO_FROM_NUMBER) providers.push('twilio');
  return providers;
}

export function smsConfigured(): boolean {
  return smsProvider() !== null;
}

interface ZavuErrorBody {
  code?: string;
  message?: string;
  details?: unknown;
}

/**
 * Надсилає SMS через Zavu (API v1): POST https://api.zavu.dev/v1/messages
 * Ключ передається як Bearer-токен, тіло — { to, text }.
 */
async function sendViaZavu(to: string, body: string): Promise<void> {
  const apiKey = config.ZAVU_API_KEY!;
  const base = (config.ZAVU_API_BASE_URL || 'https://api.zavu.dev').replace(/\/$/, '');
  const payload: Record<string, string> = { to, text: body };
  if (config.ZAVU_CHANNEL) payload.channel = config.ZAVU_CHANNEL;
  if (config.ZAVU_FROM_NUMBER) payload.from = config.ZAVU_FROM_NUMBER;

  const response = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let detail = '';
    let code = '';
    try {
      const data = await response.json() as ZavuErrorBody;
      detail = data.message ?? '';
      code = data.code ?? '';
    } catch {
      // відповідь без JSON
    }
    console.error('Zavu SMS failed', response.status, code, detail);
    throw new AppError(
      502,
      'SMS_SEND_FAILED',
      detail
        ? `Не вдалося надіслати SMS через Zavu: ${detail}`
        : `Не вдалося надіслати SMS через Zavu (HTTP ${response.status}).`,
    );
  }
}

interface TwilioErrorBody {
  message?: string;
  code?: number;
  more_info?: string;
}

/** Надсилає звичайний SMS через REST API Twilio (без SDK). */
async function sendViaTwilio(to: string, body: string): Promise<void> {
  const accountSid = config.TWILIO_ACCOUNT_SID!;
  const authToken = config.TWILIO_AUTH_TOKEN!;
  const from = config.TWILIO_FROM_NUMBER!;

  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    },
  );

  if (!response.ok) {
    let detail = '';
    try {
      const data = await response.json() as TwilioErrorBody;
      detail = data.message ?? '';
    } catch {
      // ignore non-JSON error body
    }
    console.error('Twilio SMS failed', response.status, detail);
    throw new AppError(
      502,
      'SMS_SEND_FAILED',
      detail
        ? `Не вдалося надіслати SMS: ${detail}`
        : `Не вдалося надіслати SMS через Twilio (HTTP ${response.status}).`,
    );
  }
}

/**
 * Надсилає SMS на номер у форматі E.164 через налаштований провайдер.
 * Якщо основний провайдер не зміг надіслати (наприклад, немає грошей на
 * рахунку), пробуємо другий, якщо він налаштований.
 */
export async function sendSms(to: string, body: string): Promise<void> {
  const providers = smsProviders();
  if (providers.length === 0) {
    throw new AppError(
      503,
      'SMS_NOT_CONFIGURED',
      'Відправка SMS ще не налаштована: додайте ZAVU_API_KEY або дані Twilio в налаштуваннях сервера.',
    );
  }

  let lastError: unknown;
  for (const provider of providers) {
    try {
      if (provider === 'zavu') {
        await sendViaZavu(to, body);
      } else {
        await sendViaTwilio(to, body);
      }
      return;
    } catch (error) {
      lastError = error;
      console.error(`SMS via ${provider} failed`, error instanceof Error ? error.message : error);
    }
  }
  throw lastError;
}
