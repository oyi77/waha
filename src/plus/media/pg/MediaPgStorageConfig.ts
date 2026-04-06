import { Injectable } from '@nestjs/common';

@Injectable()
export class MediaPgStorageConfig {
  get connectionString(): string {
    return (
      process.env.WAHA_MEDIA_PG_URL ??
      process.env.DATABASE_URL ??
      'postgresql://postgres:password@localhost:5432/waha'
    );
  }
}
