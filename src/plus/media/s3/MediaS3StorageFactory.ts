import { Injectable } from '@nestjs/common';
import { IMediaStorage } from '@waha/core/media/IMediaStorage';
import { MediaStorageFactory } from '@waha/core/media/MediaStorageFactory';
import { Logger } from 'pino';
import { MediaS3Storage } from './MediaS3Storage';
import { MediaS3StorageConfig } from './MediaS3StorageConfig';

@Injectable()
export class MediaS3StorageFactory extends MediaStorageFactory {
  constructor(private config: MediaS3StorageConfig) {
    super();
  }

  async build(name: string, logger: Logger): Promise<IMediaStorage> {
    return new MediaS3Storage(logger, this.config);
  }
}
