import { Module } from '@nestjs/common';
import { WAHAHealthCheckService } from '@waha/core/abc/WAHAHealthCheckService';
import {
  AppModuleCore,
  CONTROLLERS,
  IMPORTS_CORE,
  PROVIDERS_BASE,
} from '@waha/core/app.module.core';
import { WAHAHealthCheckServiceCore } from '@waha/core/health/WAHAHealthCheckServiceCore';
import { MediaLocalStorageModule } from '@waha/core/media/local/media.local.storage.module';
import { ChannelsInfoServiceCore } from '@waha/core/services/ChannelsInfoServiceCore';
import { SessionManager } from '@waha/core/abc/manager.abc';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

import { SessionManagerPlus } from './manager.plus';
import { BroadcastController } from './broadcast.controller';
import { BulkController } from './bulk.controller';
import { WebhookPlusController } from './webhook.plus.controller';
import { DashboardPlusController } from './dashboard.plus.controller';
import { ServerPlusController } from './server.plus.controller';

const IMPORTS_MEDIA = [
  ConfigModule.forRoot({
    validationSchema: Joi.object({
      WAHA_MEDIA_STORAGE: Joi.string()
        .valid('LOCAL', 'S3', 'POSTGRESQL')
        .default('LOCAL'),
    }),
  }),
  MediaLocalStorageModule,
];

const IMPORTS = [...IMPORTS_CORE, ...IMPORTS_MEDIA];

const PROVIDERS = [
  {
    provide: SessionManager,
    useClass: SessionManagerPlus,
  },
  {
    provide: WAHAHealthCheckService,
    useClass: WAHAHealthCheckServiceCore,
  },
  ChannelsInfoServiceCore,
  ...PROVIDERS_BASE,
];

@Module({
  imports: IMPORTS,
  controllers: [
    ...CONTROLLERS,
    BroadcastController,
    BulkController,
    WebhookPlusController,
    DashboardPlusController,
    ServerPlusController,
  ],
  providers: PROVIDERS,
})
export class AppModulePlus extends AppModuleCore {}
