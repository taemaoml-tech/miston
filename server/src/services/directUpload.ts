import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config/env';
import { AppError } from '../utils/errors';

export const FEED_VIDEO_FOLDER = 'miston/feed';
export const MAX_DIRECT_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

export type DirectUploadSignature = {
  provider: 'cloudinary';
  cloudName: string;
  apiKey: string;
  timestamp: number;
  publicId: string;
  folder: string;
  signature: string;
} | {
  provider: 's3';
  uploadUrl: string;
  publicUrl: string;
  method: 'PUT';
  expiresIn: number;
};

function cloudinarySignature(): DirectUploadSignature {
  if (!config.CLOUDINARY_CLOUD_NAME || !config.CLOUDINARY_API_KEY || !config.CLOUDINARY_API_SECRET) {
    throw new AppError(503, 'UPLOAD_NOT_CONFIGURED', 'Завантаження відео тимчасово недоступне');
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = crypto.randomUUID();
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, public_id: publicId, folder: FEED_VIDEO_FOLDER },
    config.CLOUDINARY_API_SECRET,
  );
  return {
    provider: 'cloudinary',
    cloudName: config.CLOUDINARY_CLOUD_NAME,
    apiKey: config.CLOUDINARY_API_KEY,
    timestamp,
    publicId,
    folder: FEED_VIDEO_FOLDER,
    signature,
  };
}

function s3Key(fileName: string): string {
  const extension = fileName.toLowerCase().match(/\.(mp4|webm|mov)$/)?.[1] ?? 'mp4';
  return `${FEED_VIDEO_FOLDER}/videos/${crypto.randomUUID()}.${extension}`;
}

async function s3Signature(fileName: string): Promise<DirectUploadSignature> {
  if (
    !config.S3_ENDPOINT
    || !config.S3_BUCKET
    || !config.S3_ACCESS_KEY_ID
    || !config.S3_SECRET_ACCESS_KEY
    || !config.S3_PUBLIC_BASE_URL
  ) {
    throw new AppError(503, 'UPLOAD_NOT_CONFIGURED', 'Безкоштовне сховище для відео не налаштоване');
  }

  const key = s3Key(fileName);
  const client = new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    forcePathStyle: true,
    // Без заголовка CRC32: браузер робить звичайний PUT без додаткових полів.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    },
  });
  const expiresIn = 3600;
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: key }),
    { expiresIn },
  );

  return {
    provider: 's3',
    uploadUrl,
    publicUrl: `${config.S3_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`,
    method: 'PUT',
    expiresIn,
  };
}

export async function signFeedVideoUpload(bytes: number, fileName: string): Promise<DirectUploadSignature> {
  if (!Number.isInteger(bytes) || bytes <= 0 || bytes > MAX_DIRECT_VIDEO_BYTES) {
    throw new AppError(400, 'VIDEO_TOO_LARGE', 'Відео має бути не більше 2 ГБ');
  }
  return config.STORAGE_PROVIDER === 's3' ? s3Signature(fileName) : cloudinarySignature();
}
