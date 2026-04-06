import { Module } from '@nestjs/common';
import { MediaStorageFactory } from '@waha/core/media/MediaStorageFactory';
import { MediaPgStorageConfig } from './MediaPgStorageConfig';
import { MediaPgStorageFactory } from './MediaPgStorageFactory';

@Module({
  providers: [
    MediaPgStorageConfig,
    {
      provide: MediaStorageFactory,
      useClass: MediaPgStorageFactory,
    },
  ],
  exports: [MediaStorageFactory],
})
export class MediaPgStorageModule {}
