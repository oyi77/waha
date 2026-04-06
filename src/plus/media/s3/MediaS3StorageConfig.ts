import { Injectable } from '@nestjs/common';

@Injectable()
export class MediaS3StorageConfig {
  get bucket(): string {
    return process.env.WAHA_MEDIA_S3_BUCKET ?? '';
  }
  get region(): string {
    return process.env.WAHA_MEDIA_S3_REGION ?? 'us-east-1';
  }
  get endpoint(): string | undefined {
    return process.env.WAHA_MEDIA_S3_ENDPOINT;
  }
  get accessKeyId(): string | undefined {
    return process.env.WAHA_MEDIA_S3_ACCESS_KEY_ID;
  }
  get secretAccessKey(): string | undefined {
    return process.env.WAHA_MEDIA_S3_SECRET_ACCESS_KEY;
  }
  get urlExpiresIn(): number {
    return parseInt(process.env.WAHA_MEDIA_S3_URL_EXPIRES_IN ?? '3600', 10);
  }
  get forcePathStyle(): boolean {
    return process.env.WAHA_MEDIA_S3_FORCE_PATH_STYLE === 'true';
  }
}
