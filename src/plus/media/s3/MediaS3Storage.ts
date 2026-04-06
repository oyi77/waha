import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  IMediaStorage,
  MediaData,
  MediaStorageData,
  getMetadata,
} from '@waha/core/media/IMediaStorage';
import { Logger } from 'pino';
import { MediaS3StorageConfig } from './MediaS3StorageConfig';

export class MediaS3Storage extends IMediaStorage {
  private client: S3Client;
  private bucket: string;
  private urlExpiresIn: number;

  constructor(
    private log: Logger,
    private config: MediaS3StorageConfig,
  ) {
    super();
    this.bucket = config.bucket;
    this.urlExpiresIn = config.urlExpiresIn;
    const s3Config: any = {
      region: config.region,
    };
    if (config.endpoint) {
      s3Config.endpoint = config.endpoint;
      s3Config.forcePathStyle = config.forcePathStyle;
    }
    if (config.accessKeyId && config.secretAccessKey) {
      s3Config.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      };
    }
    this.client = new S3Client(s3Config);
  }

  private getKey(data: MediaData): string {
    const ext = data.file.extension ? `.${data.file.extension}` : '';
    return `${data.session}/${data.message.chatId}/${data.message.id}${ext}`;
  }

  async init(): Promise<void> {
    this.log.info({ bucket: this.bucket }, 'S3 media storage initialized');
  }

  async save(buffer: Buffer, data: MediaData): Promise<boolean> {
    const key = this.getKey(data);
    const metadata = getMetadata(data);
    const stringMetadata: Record<string, string> = {};
    for (const [k, v] of Object.entries(metadata)) {
      if (v !== undefined && v !== null) {
        stringMetadata[k] = String(v);
      }
    }
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        Metadata: stringMetadata,
      }),
    );
    this.log.debug({ key }, 'Saved media to S3');
    return true;
  }

  async exists(data: MediaData): Promise<boolean> {
    const key = this.getKey(data);
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async getStorageData(data: MediaData): Promise<MediaStorageData> {
    const key = this.getKey(data);
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: this.urlExpiresIn,
    });
    return {
      url,
      s3: { Bucket: this.bucket, Key: key },
    };
  }

  async purge(): Promise<void> {
    // S3 lifecycle policies handle cleanup — no-op here
  }

  async close(): Promise<void> {
    this.client.destroy();
  }
}
