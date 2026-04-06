import { Injectable } from '@nestjs/common';
import { IMediaStorage } from '@waha/core/media/IMediaStorage';
import { MediaStorageFactory } from '@waha/core/media/MediaStorageFactory';
import { Logger } from 'pino';
import { MediaPgStorage } from './MediaPgStorage';
import { MediaPgStorageConfig } from './MediaPgStorageConfig';

@Injectable()
export class MediaPgStorageFactory extends MediaStorageFactory {
  constructor(private config: MediaPgStorageConfig) {
    super();
  }

  async build(name: string, logger: Logger): Promise<IMediaStorage> {
    return new MediaPgStorage(logger, this.config);
  }
}
