import { Module } from '@nestjs/common';
import { MediaStorageFactory } from '@waha/core/media/MediaStorageFactory';
import { MediaS3StorageConfig } from './MediaS3StorageConfig';
import { MediaS3StorageFactory } from './MediaS3StorageFactory';

@Module({
  providers: [
    MediaS3StorageConfig,
    {
      provide: MediaStorageFactory,
      useClass: MediaS3StorageFactory,
    },
  ],
  exports: [MediaStorageFactory],
})
export class MediaS3StorageModule {}
