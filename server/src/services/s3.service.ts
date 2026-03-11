import AWS from 'aws-sdk';
import { config } from '../config';
import logger from '../utils/logger';

const s3 = new AWS.S3({
  region: config.s3.region,
  accessKeyId: config.s3.accessKeyId || undefined,
  secretAccessKey: config.s3.secretAccessKey || undefined,
  // For local dev, you can point to MinIO or localstack
  ...(config.env === 'development' && config.s3.accessKeyId === ''
    ? { endpoint: 'http://localhost:9000', s3ForcePathStyle: true }
    : {}),
});

export const S3Service = {
  /**
   * Upload a PDF buffer to S3.
   */
  async uploadPdf(key: string, buffer: Buffer, contentType = 'application/pdf'): Promise<string> {
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
   * Download a PDF from S3.
   */
  async downloadPdf(key: string): Promise<Buffer> {
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
   * Expires in 5 minutes by default.
   */
  getSignedUrl(key: string, expiresInSeconds = 300): string {
    return s3.getSignedUrl('getObject', {
      Bucket: config.s3.bucket,
      Key: key,
      Expires: expiresInSeconds,
    });
  },

  /**
   * Delete a file from S3.
   */
  async deleteFile(key: string): Promise<void> {
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
   * Check if a file exists in S3.
   */
  async exists(key: string): Promise<boolean> {
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
