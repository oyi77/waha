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
import { MediaS3StorageModule } from '@waha/plus/media/s3/media.s3.storage.module';
import { MediaPgStorageModule } from '@waha/plus/media/pg/media.pg.storage.module';
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
import { ConfigPlusController } from './config.plus.controller';
import { DashboardLoginController } from './dashboard.login.controller';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { AutoReplyController } from './autoreply.controller';
import { AutoReplyService } from './autoreply.service';
import { WahaMcpController } from './mcp/waha.mcp.controller';
import { EngineSwitchController } from './engine.switch.controller';

function getMediaStorageModule() {
  const storage = process.env.WAHA_MEDIA_STORAGE ?? 'LOCAL';
  if (storage === 'S3') return MediaS3StorageModule;
  if (storage === 'POSTGRESQL') return MediaPgStorageModule;
  return MediaLocalStorageModule;
}

const IMPORTS_MEDIA = [
  ConfigModule.forRoot({
    validationSchema: Joi.object({
      WAHA_MEDIA_STORAGE: Joi.string()
        .valid('LOCAL', 'S3', 'POSTGRESQL')
        .default('LOCAL'),
    }),
  }),
  getMediaStorageModule(),
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
  ScheduleService,
  TemplatesService,
  AutoReplyService,
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
    ConfigPlusController,
    DashboardLoginController,
    ScheduleController,
    TemplatesController,
    AutoReplyController,
    WahaMcpController,
    EngineSwitchController,
  ],
  providers: PROVIDERS,
})
export class AppModulePlus extends AppModuleCore {}
