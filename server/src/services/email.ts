import nodemailer from 'nodemailer';
import { config } from '../config/env';

export function emailConfigured(): boolean {
  return Boolean(config.SMTP_HOST && config.SMTP_PORT && config.SMTP_FROM);
}

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (!emailConfigured()) {
    throw new Error('SMTP не налаштований: додайте SMTP_HOST/PORT/FROM у змінних середовища.');
  }
  const transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS ?? '' } : undefined,
  });
  await transporter.sendMail({
    from: config.SMTP_FROM,
    to,
    subject,
    text,
  });
}
