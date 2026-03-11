import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import logger from '../utils/logger';

/**
 * Determines whether real S3 is configured.
 * Falls back to local filesystem storage when credentials are missing.
 */
const useS3 = !!(config.s3.accessKeyId && config.s3.secretAccessKey);

if (!useS3) {
  logger.warn('S3 credentials not configured — using local filesystem storage');
}

// ─── S3 Client (only initialised when credentials exist) ────────────────────

const s3 = useS3
  ? new AWS.S3({
      region: config.s3.region,
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: config.s3.secretAccessKey,
    })
  : (null as unknown as AWS.S3);

// ─── Local Storage Helpers ──────────────────────────────────────────────────

const LOCAL_STORAGE_DIR = path.resolve(__dirname, '../../.local-storage');

function localPath(key: string): string {
  // Prevent path traversal
  const resolved = path.resolve(LOCAL_STORAGE_DIR, key);
  if (!resolved.startsWith(LOCAL_STORAGE_DIR)) {
    throw new Error('Invalid storage key');
  }
  return resolved;
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ─── Service ────────────────────────────────────────────────────────────────

export const S3Service = {
  /** Whether we're using real S3 or local fallback */
  isLocal: !useS3,

  /**
   * Upload a PDF buffer to S3 (or local filesystem).
   */
  async uploadPdf(key: string, buffer: Buffer, contentType = 'application/pdf'): Promise<string> {
    if (!useS3) {
      const dest = localPath(key);
      ensureDir(dest);
      fs.writeFileSync(dest, buffer);
      logger.info('Local storage upload complete', { key });
      return key;
    }

    const params: AWS.S3.PutObjectRequest = {
      Bucket: config.s3.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ServerSideEncryption: 'AES256', // encryption at rest for HIPAA
    };

    try {
      await s3.putObject(params).promise();
      logger.info('S3 upload complete', { key });
      return key;
    } catch (err) {
      logger.error('S3 upload failed', { key, error: (err as Error).message });
      throw new Error('Failed to upload document to storage');
    }
  },

  /**
   * Download a PDF from S3 (or local filesystem).
   */
  async downloadPdf(key: string): Promise<Buffer> {
    if (!useS3) {
      const filePath = localPath(key);
      if (!fs.existsSync(filePath)) {
        throw new Error('File not found in local storage');
      }
      return fs.readFileSync(filePath);
    }

    try {
      const result = await s3.getObject({
        Bucket: config.s3.bucket,
        Key: key,
      }).promise();
      return result.Body as Buffer;
    } catch (err) {
      logger.error('S3 download failed', { key, error: (err as Error).message });
      throw new Error('Failed to download document from storage');
    }
  },

  /**
   * Generate a pre-signed URL for temporary access (e.g., staff download).
   * In local mode, returns a server-relative URL served by the local storage route.
   */
  getSignedUrl(key: string, expiresInSeconds = 300): string {
    if (!useS3) {
      return `/api/storage/${encodeURIComponent(key)}`;
    }

    return s3.getSignedUrl('getObject', {
      Bucket: config.s3.bucket,
      Key: key,
      Expires: expiresInSeconds,
    });
  },

  /**
   * Delete a file from S3 (or local filesystem).
   */
  async deleteFile(key: string): Promise<void> {
    if (!useS3) {
      const filePath = localPath(key);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info('Local storage delete complete', { key });
      }
      return;
    }

    try {
      await s3.deleteObject({
        Bucket: config.s3.bucket,
        Key: key,
      }).promise();
      logger.info('S3 delete complete', { key });
    } catch (err) {
      logger.error('S3 delete failed', { key, error: (err as Error).message });
    }
  },

  /**
   * Check if a file exists in S3 (or local filesystem).
   */
  async exists(key: string): Promise<boolean> {
    if (!useS3) {
      return fs.existsSync(localPath(key));
    }

    try {
      await s3.headObject({
        Bucket: config.s3.bucket,
        Key: key,
      }).promise();
      return true;
    } catch {
      return false;
    }
  },
};
