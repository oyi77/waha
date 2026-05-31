import { Module, Optional } from '@nestjs/common';
import { WAHAHealthCheckService } from '@waha/core/abc/WAHAHealthCheckService';
import {
  AppModuleCore,
  CONTROLLERS,
  IMPORTS_CORE,
  PROVIDERS_BASE,
} from '@waha/core/app.module.core';
import { CredentialResolver } from '@waha/core/auth/dashboardCookieAuth';
import { WAHAHealthCheckServiceCore } from '@waha/core/health/WAHAHealthCheckServiceCore';
import { MediaLocalStorageModule } from '@waha/core/media/local/media.local.storage.module';
import { MediaS3StorageModule } from '@waha/plus/media/s3/media.s3.storage.module';
import { MediaPgStorageModule } from '@waha/plus/media/pg/media.pg.storage.module';
import { DashboardConfigServiceCore } from '@waha/core/config/DashboardConfigServiceCore';
import { WhatsappConfigService } from '@waha/config.service';
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
import { SessionRecoveryController } from './session_recovery.controller';
import { AutoReplyController } from './autoreply.controller';
import { AutoReplyService } from './autoreply.service';
import { WahaMcpController } from './mcp/waha.mcp.controller';
import { EngineSwitchController } from './engine.switch.controller';
import { MessageEventService } from './message.event.service';
import { MessageLogService } from './message.log.service';
import { MessageLogController } from './message.log.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { SessionLifecycleController } from './session_lifecycle.controller';
import { SessionHealthController } from './session_health.controller';

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
  MessageEventService,
  MessageLogService,
  AnalyticsService,
  SettingsService,
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
    MessageLogController,
    AnalyticsController,
    SettingsController,
    SessionLifecycleController,
    SessionHealthController,
    SessionRecoveryController,
    WahaMcpController,
    EngineSwitchController,
  ],
  providers: PROVIDERS,
})
export class AppModulePlus extends AppModuleCore {
  constructor(
    config: WhatsappConfigService,
    dashboardConfig: DashboardConfigServiceCore,
    @Optional() private settingsService?: SettingsService,
  ) {
    super(config, dashboardConfig);
  }

  protected override getCredentialResolver(): CredentialResolver {
    const envCreds = this.dashboardConfig.credentials;
    const settings = this.settingsService;
    return async () => {
      if (settings) {
        try {
          const token = await settings.getStoredAuthToken();
          if (token) return { authToken: token };
        } catch {
          // DB not ready yet (manager not wired) — fall through to env
        }
      }
      return envCreds;
    };
  }
}
