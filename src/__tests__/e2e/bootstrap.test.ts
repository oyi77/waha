import { INestApplication, MiddlewareConsumer, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { TerminusModule } from '@nestjs/terminus';
import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '@waha/api/health.controller';
import { PingController } from '@waha/api/ping.controller';
import { ServerController } from '@waha/api/server.controller';
import { VersionController } from '@waha/api/version.controller';
import { WhatsappConfigService } from '@waha/config.service';
import { SessionManager } from '@waha/core/abc/manager.abc';
import { WAHAHealthCheckService } from '@waha/core/abc/WAHAHealthCheckService';
import { ApiKeyAuthMiddleware } from '@waha/core/auth/api-key-auth.middleware';
import { ApiKeyAuthFactory } from '@waha/core/auth/ApiKeyAuthFactory';
import { ApiKeyService } from '@waha/core/auth/ApiKeyService';
import { ApiKeyStrategy } from '@waha/core/auth/apiKey.strategy';
import { IApiKeyAuth } from '@waha/core/auth/auth';
import { CaslAbilityFactory } from '@waha/core/auth/casl.ability';
import { PoliciesGuard } from '@waha/core/auth/policies.guard';
import { DashboardConfigServiceCore } from '@waha/core/config/DashboardConfigServiceCore';
import { EngineConfigService } from '@waha/core/config/EngineConfigService';
import { GowsEngineConfigService } from '@waha/core/config/GowsEngineConfigService';
import { SwaggerConfigServiceCore } from '@waha/core/config/SwaggerConfigServiceCore';
import { WebJSEngineConfigService } from '@waha/core/config/WebJSEngineConfigService';
import { WPPEngineConfigService } from '@waha/core/config/WPPEngineConfigService';
import { Logger as NestJSPinoLogger, LoggerModule } from 'nestjs-pino';
import * as request from 'supertest';

const MOCK_SESSION_MANAGER = {
  onModuleInit: jest.fn(),
  onApplicationBootstrap: jest.fn(),
  beforeApplicationShutdown: jest.fn(),
  getSessions: jest.fn().mockResolvedValue([]),
  exists: jest.fn().mockResolvedValue(false),
  isRunning: jest.fn().mockReturnValue(false),
  getSession: jest.fn(),
  getSessionInfo: jest.fn().mockResolvedValue(null),
  getSessionEvent: jest.fn(),
  getSessionEvents: jest.fn(),
  sessionAuthRepository: null,
  sessionConfigRepository: null,
  apiKeyRepository: {
    getAll: jest.fn().mockResolvedValue([]),
    getByIdOrFail: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  store: { init: jest.fn() },
};

const MOCK_HEALTH_SERVICE = {
  check: jest.fn().mockResolvedValue({
    status: 'ok',
    info: {},
    error: {},
    details: {},
  }),
};

@Module({
  imports: [
    LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
    ConfigModule.forRoot({ isGlobal: true }),
    PassportModule,
    TerminusModule,
  ],
  controllers: [
    PingController,
    ServerController,
    VersionController,
    HealthController,
  ],
  providers: [
    { provide: SessionManager, useValue: MOCK_SESSION_MANAGER },
    { provide: WAHAHealthCheckService, useValue: MOCK_HEALTH_SERVICE },
    WhatsappConfigService,
    EngineConfigService,
    WebJSEngineConfigService,
    WPPEngineConfigService,
    GowsEngineConfigService,
    DashboardConfigServiceCore,
    SwaggerConfigServiceCore,
    ApiKeyStrategy,
    ApiKeyService,
    CaslAbilityFactory,
    PoliciesGuard,
    {
      provide: IApiKeyAuth,
      useFactory: ApiKeyAuthFactory,
      inject: [WhatsappConfigService, NestJSPinoLogger],
    },
  ],
})
class BootstrapTestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ApiKeyAuthMiddleware).forRoutes('api', 'health');
  }
}

describe('AppModuleCore bootstrap', () => {
  let app: INestApplication;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [BootstrapTestModule],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  test('module compiles and DI resolves', () => {
    expect(module).toBeDefined();
    expect(app).toBeDefined();
  });

  test('SessionManager is injectable', () => {
    const manager = module.get(SessionManager);
    expect(manager).toBe(MOCK_SESSION_MANAGER);
  });

  test('GET /ping returns pong', async () => {
    const response = await request(app.getHttpServer()).get('/ping');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'pong' });
  });

  test('GET /api/server/version returns version info', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/server/version')
      .set('X-Api-Key', '666');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('version');
  });

  test('GET /api/server/status returns uptime info', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/server/status')
      .set('X-Api-Key', '666');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('startTimestamp');
    expect(response.body).toHaveProperty('uptime');
  });

  test('GET /api/server/version without api key returns 401', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/server/version',
    );
    expect(response.status).toBe(401);
  });
});
