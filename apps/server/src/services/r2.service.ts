import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config.js';
import { nanoid } from 'nanoid';

export class CloudflareR2Service {
  private client: S3Client | null = null;
  private bucket: string;
  private publicUrl: string;

  constructor() {
    this.bucket = config.r2.bucketName;
    this.publicUrl = config.r2.publicUrl.replace(/\/$/, '');

    if (this.isConfigured()) {
      try {
        const rawEndpoint =
          config.r2.endpoint ||
          (config.r2.accountId
            ? `https://${config.r2.accountId.replace(/[^a-zA-Z0-9]/g, '')}.r2.cloudflarestorage.com`
            : undefined);
        const endpoint = rawEndpoint ? rawEndpoint.replace(/[\r\n\t"']/g, '').trim() : undefined;
        const region = (config.r2.region || 'auto').replace(/[^a-zA-Z0-9-]/g, '').trim() || 'auto';

        this.client = new S3Client({
          region,
          endpoint,
          credentials: {
            accessKeyId: config.r2.accessKeyId.replace(/[\r\n\t"']/g, '').trim(),
            secretAccessKey: config.r2.secretAccessKey.replace(/[\r\n\t"']/g, '').trim(),
          },
          forcePathStyle: Boolean(config.r2.endpoint),
        });
      } catch (err) {
        console.warn('[Cloud Storage S3] Failed to initialize S3Client:', err);
      }
    }
  }

  public isConfigured(): boolean {
    return Boolean(
      (config.r2.accountId || config.r2.endpoint) &&
        config.r2.accessKeyId &&
        config.r2.secretAccessKey
    );
  }

  public getBucketName(): string {
    return this.bucket;
  }

  /**
   * Upload an audio buffer to Cloudflare R2
   */
  public async uploadAudio(
    filename: string,
    buffer: Buffer,
    contentType: string = 'audio/mpeg'
  ): Promise<{ key: string; url: string }> {
    const ext = filename.split('.').pop() || 'mp3';
    const cleanBase = filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const key = `audio/${Date.now()}_${cleanBase.substring(0, 30)}_${nanoid(6)}.${ext}`;

    if (!this.client) {
      throw new Error(
        'Cloudflare R2 is not configured. Please add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY to your environment variables.'
      );
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await this.client.send(command);

    // If public domain is configured (e.g. pub-xxx.r2.dev or custom CDN), use it directly.
    // Otherwise route through the server's streaming proxy.
    const url = this.publicUrl ? `${this.publicUrl}/${key}` : `/api/sounds/stream/${encodeURIComponent(key)}`;

    return { key, url };
  }

  /**
   * Delete an object from Cloudflare R2
   */
  public async deleteAudio(key: string): Promise<void> {
    if (!this.client) return;

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await this.client.send(command);
    } catch (err) {
      console.warn(`[Cloudflare R2] Failed to delete object ${key}:`, err);
    }
  }

  /**
   * Fetch an object stream from Cloudflare R2
   */
  public async getAudioStream(key: string) {
    if (!this.client) {
      throw new Error('Cloudflare R2 is not configured');
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return await this.client.send(command);
  }
}

export const r2Service = new CloudflareR2Service();
