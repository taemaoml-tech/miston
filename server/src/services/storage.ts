import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config/env';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

export function storageConfigured(): boolean {
  return Boolean(config.CLOUDINARY_CLOUD_NAME && config.CLOUDINARY_API_KEY && config.CLOUDINARY_API_SECRET);
}

export async function uploadFile(buffer: Buffer, originalName: string, mimeType: string): Promise<string> {
  if (storageConfigured()) {
    (cloudinary as any).config({
      cloud_name: config.CLOUDINARY_CLOUD_NAME,
      api_key: config.CLOUDINARY_API_KEY,
      api_secret: config.CLOUDINARY_API_SECRET,
    });
    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: 'auto', folder: 'miston', public_id: crypto.randomUUID() },
        (error, result) => {
          if (error || !result) reject(error ?? new Error('Cloudinary upload failed'));
          else resolve(result as { secure_url: string });
        },
      );
      stream.end(buffer);
    });
    return result.secure_url;
  }

  // Локальний диск (за замовчуванням).
  const ext = path.extname(originalName) || '';
  const filename = `${crypto.randomUUID()}${ext}`;
  const fullPath = path.join(config.UPLOAD_DIR, filename);
  await fs.mkdir(config.UPLOAD_DIR, { recursive: true });
  await fs.writeFile(fullPath, buffer);
  return `/uploads/${filename}`;
}

export function isRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
