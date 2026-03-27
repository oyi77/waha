import {
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AppsService,
  IAppsService,
} from '@waha/apps/app_sdk/services/IAppsService';
import { EngineBootstrap } from '@waha/core/abc/EngineBootstrap';
import { GowsEngineConfigService } from '@waha/core/config/GowsEngineConfigService';
import { WPPEngineConfigService } from '@waha/core/config/WPPEngineConfigService';
import { WebJSEngineConfigService } from '@waha/core/config/WebJSEngineConfigService';
import { WhatsappSessionGoWSCore } from '@waha/core/engines/gows/session.gows.core';
import { WebhookConductor } from '@waha/core/integrations/webhooks/WebhookConductor';
import { MediaStorageFactory } from '@waha/core/media/MediaStorageFactory';
import { CoreApiKeyRepository } from '@waha/core/storage/CoreApiKeyRepository';
import { LocalSessionAuthRepository } from '@waha/core/storage/LocalSessionAuthRepository';
import { LocalSessionConfigRepository } from '@waha/core/storage/LocalSessionConfigRepository';
import { LocalStoreCore } from '@waha/core/storage/LocalStoreCore';
import { DefaultMap } from '@waha/utils/DefaultMap';
import { getPinoLogLevel, LoggerBuilder } from '@waha/utils/logging';
import { promiseTimeout, sleep } from '@waha/utils/promiseTimeout';
import { complete } from '@waha/utils/reactive/complete';
import { SwitchObservable } from '@waha/utils/reactive/SwitchObservable';
import { PinoLogger } from 'nestjs-pino';
import { Observable, retry, share } from 'rxjs';
import { map } from 'rxjs/operators';

import { getNamespace, getSessionNamespace } from '../config';
import { WhatsappConfigService } from '../config.service';
import {
  WAHAEngine,
  WAHAEvents,
  WAHASessionStatus,
} from '../structures/enums.dto';
import {
  ProxyConfig,
  SessionConfig,
  SessionDetailedInfo,
  SessionDTO,
  SessionInfo,
} from '../structures/sessions.dto';
import { WebhookConfig } from '../structures/webhooks.config.dto';
import { populateSessionInfo, SessionManager } from '../core/abc/manager.abc';
import { SessionParams, WhatsappSession } from '../core/abc/session.abc';
import { EngineConfigService } from '../core/config/EngineConfigService';
import { WhatsappSessionNoWebCore } from '../core/engines/noweb/session.noweb.core';
import { WhatsappSessionWPPCore } from '../core/engines/wpp/session.wpp.core';
import { WhatsappSessionWebJSCore } from '../core/engines/webjs/session.webjs.core';
import { getProxyConfig } from '../core/helpers.proxy';
import { MediaManager } from '../core/media/MediaManager';

const MAX_SESSIONS_ENV = 'WAHA_MAX_SESSIONS';

@Injectable()
export class SessionManagerPlus extends SessionManager implements OnModuleInit {
  SESSION_STOP_TIMEOUT = 3000;

  // Map: sessionName -> session (null = stopped, undefined/missing = removed)
  private sessions: Map<string, WhatsappSession | null>;
  // Map: sessionName -> config
  private sessionConfigs: Map<string, SessionConfig | null>;
  // Map: sessionName -> per-event observables
  private eventsMap: Map<
    string,
    DefaultMap<WAHAEvents, SwitchObservable<any>>
  >;

  protected readonly EngineClass: typeof WhatsappSession;
  protected readonly engineBootstrap: EngineBootstrap;

  private sessionConfigRepository: LocalSessionConfigRepository;

  constructor(
    config: WhatsappConfigService,
    private engineConfigService: EngineConfigService,
    private webjsEngineConfigService: WebJSEngineConfigService,
    private wppEngineConfigService: WPPEngineConfigService,
    gowsConfigService: GowsEngineConfigService,
    log: PinoLogger,
    private mediaStorageFactory: MediaStorageFactory,
    @Inject(AppsService)
    appsService: IAppsService,
  ) {
    super(log, config, gowsConfigService, appsService);
    this.sessions = new Map();
    this.sessionConfigs = new Map();
    this.eventsMap = new Map();

    const engineName = this.engineConfigService.getDefaultEngineName();
    this.EngineClass = this.getEngine(engineName);
    this.engineBootstrap = this.getEngineBootstrap(engineName);

    this.store = new LocalStoreCore(getNamespace(), getSessionNamespace());
    this.sessionAuthRepository = new LocalSessionAuthRepository(this.store);
    this.sessionConfigRepository = new LocalSessionConfigRepository(this.store);
  }

  protected getEngine(engine: WAHAEngine): typeof WhatsappSession {
    if (engine === WAHAEngine.WEBJS) {
      return WhatsappSessionWebJSCore;
    } else if (engine === WAHAEngine.WPP) {
      return WhatsappSessionWPPCore;
    } else if (engine === WAHAEngine.NOWEB) {
      return WhatsappSessionNoWebCore;
    } else if (engine === WAHAEngine.GOWS) {
      return WhatsappSessionGoWSCore;
    } else {
      throw new NotFoundException(`Unknown whatsapp engine '${engine}'.`);
    }
  }

  // ─── Limit Check ─────────────────────────────────────────────────────────────
  private checkSessionLimit() {
    const maxSessions = parseInt(process.env[MAX_SESSIONS_ENV] || '0', 10);
    if (maxSessions <= 0) return; // 0 = unlimited
    const running = [...this.sessions.values()].filter((s) => s !== null).length;
    if (running >= maxSessions) {
      throw new UnprocessableEntityException(
        `Session limit reached. WAHA Plus is configured to allow max ${maxSessions} concurrent sessions. ` +
          `Stop or delete an existing session before starting a new one.`,
      );
    }
  }

  // ─── Event helpers ───────────────────────────────────────────────────────────
  private getOrCreateEvents(
    name: string,
  ): DefaultMap<WAHAEvents, SwitchObservable<any>> {
    if (!this.eventsMap.has(name)) {
      this.eventsMap.set(
        name,
        new DefaultMap<WAHAEvents, SwitchObservable<any>>(
          () =>
            new SwitchObservable((obs$) => obs$.pipe(retry(), share())),
        ),
      );
    }
    return this.eventsMap.get(name)!;
  }

  private updateSessionEvents(name: string) {
    const session = this.sessions.get(name);
    if (!session) return;
    const events = this.getOrCreateEvents(name);
    for (const eventName in WAHAEvents) {
      const event = WAHAEvents[eventName];
      const stream$ = session
        .getEventObservable(event)
        .pipe(map(populateSessionInfo(event, session)));
      events.get(event).switch(stream$);
    }
  }

  getSessionEvent(name: string, event: WAHAEvents): Observable<any> {
    return this.getOrCreateEvents(name).get(event);
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────
  async beforeApplicationShutdown(signal?: string) {
    const names = [...this.sessions.keys()];
    for (const name of names) {
      if (this.sessions.get(name)) {
        await this.stop(name, true).catch(() => {});
      }
    }
    this.stopEvents();
    await this.engineBootstrap.shutdown();
  }

  async onApplicationBootstrap() {
    this.apiKeyRepository = new CoreApiKeyRepository();
    await this.engineBootstrap.bootstrap();
    this.startPredefinedSessions();
  }

  // ─── Core API ────────────────────────────────────────────────────────────────
  async exists(name: string): Promise<boolean> {
    // Check in-memory first, then on-disk configs
    if (this.sessions.has(name) || this.sessionConfigs.has(name)) return true;
    return this.sessionConfigRepository.exists(name);
  }

  isRunning(name: string): boolean {
    return !!this.sessions.get(name);
  }

  async upsert(name: string, config?: SessionConfig): Promise<void> {
    this.sessionConfigs.set(name, config ?? null);
    // Persist config to disk
    if (config) {
      await this.sessionConfigRepository.saveConfig(name, config);
    }
  }

  async start(name: string): Promise<SessionDTO> {
    if (this.isRunning(name)) {
      throw new UnprocessableEntityException(
        `Session '${name}' is already started.`,
      );
    }

    this.checkSessionLimit();

    this.log.info({ session: name }, `Starting session...`);
    const logger = this.log.logger.child({ session: name });
    const config = this.sessionConfigs.get(name) ?? null;
    logger.level = getPinoLogLevel(config?.debug);
    const loggerBuilder: LoggerBuilder = logger;

    const storage = await this.mediaStorageFactory.build(
      name,
      loggerBuilder.child({ name: 'Storage' }),
    );
    await storage.init();
    const mediaManager = new MediaManager(
      storage,
      this.config.mimetypes,
      loggerBuilder.child({ name: 'MediaManager' }),
    );

    const webhook = new WebhookConductor(loggerBuilder);
    const proxyConfig = this.getProxyConfigForSession(name, config);
    const sessionConfig: SessionParams = {
      name,
      mediaManager,
      loggerBuilder,
      printQR: this.engineConfigService.shouldPrintQR,
      sessionStore: this.store,
      proxyConfig: proxyConfig,
      sessionConfig: config,
      ignore: this.ignoreChatsConfig(config),
    };
    if (this.EngineClass === WhatsappSessionWebJSCore) {
      sessionConfig.engineConfig = this.webjsEngineConfigService.getConfig();
    } else if (this.EngineClass === WhatsappSessionWPPCore) {
      sessionConfig.engineConfig = this.wppEngineConfigService.getConfig();
    } else if (this.EngineClass === WhatsappSessionGoWSCore) {
      sessionConfig.engineConfig = this.gowsConfigService.getConfig();
    }

    await this.sessionAuthRepository.init(name);
    // @ts-ignore
    const session = new this.EngineClass(sessionConfig);
    this.sessions.set(name, session);
    this.updateSessionEvents(name);

    // configure webhooks
    const webhooks = this.getWebhooksForSession(config);
    webhook.configure(session, webhooks);

    // Apps
    try {
      await this.appsService.beforeSessionStart(session, this.store);
    } catch (e) {
      logger.error(`Apps Error: ${e}`);
      session.status = WAHASessionStatus.FAILED;
    }

    if (session.status !== WAHASessionStatus.FAILED) {
      await session.start();
      logger.info('Session has been started.');
      await this.appsService.afterSessionStart(session, this.store);
    }

    return {
      name: session.name,
      status: session.status,
      config: session.sessionConfig,
    };
  }

  async stop(name: string, silent: boolean): Promise<void> {
    if (!this.isRunning(name)) {
      this.log.debug({ session: name }, `Session is not running.`);
      return;
    }
    this.log.info({ session: name }, `Stopping session...`);
    try {
      const session = this.getSession(name);
      await session.stop();
    } catch (err) {
      this.log.warn(`Error while stopping session '${name}'`);
      if (!silent) throw err;
    }
    this.log.info({ session: name }, `Session has been stopped.`);
    this.sessions.set(name, null);
    await sleep(this.SESSION_STOP_TIMEOUT);
  }

  async unpair(name: string) {
    const session = this.sessions.get(name);
    if (!session) return;
    this.log.info({ session: name }, 'Unpairing the device from account...');
    await session.unpair().catch((err) => {
      this.log.warn(`Error while unpairing from device: ${err}`);
    });
    await sleep(1000);
  }

  async logout(name: string): Promise<void> {
    await this.sessionAuthRepository.clean(name);
  }

  async delete(name: string): Promise<void> {
    await this.appsService.removeBySession(this, name);
    this.sessions.delete(name);
    this.sessionConfigs.delete(name);
    this.eventsMap.delete(name);
    await this.sessionConfigRepository.deleteConfig(name);
  }

  getSession(name: string): WhatsappSession {
    const session = this.sessions.get(name);
    if (!session) {
      throw new NotFoundException(
        `We didn't find a running session with name '${name}'.\n` +
          `Please start it first by using POST /api/sessions/${name}/start request`,
      );
    }
    return session;
  }

  async getSessions(all: boolean): Promise<SessionInfo[]> {
    const result: SessionInfo[] = [];
    const tracked = new Set([
      ...this.sessions.keys(),
      ...this.sessionConfigs.keys(),
    ]);

    for (const name of tracked) {
      const session = this.sessions.get(name);
      const config = this.sessionConfigs.get(name) ?? null;

      if (!session && !all) continue;

      if (!session) {
        // stopped or configured but not started
        result.push({
          name,
          status: WAHASessionStatus.STOPPED,
          config,
          me: null,
          presence: null,
          timestamps: { activity: null },
        });
      } else {
        const me = session.getSessionMeInfo();
        result.push({
          name: session.name,
          status: session.status,
          config: session.sessionConfig,
          me,
          presence: session.presence,
          timestamps: { activity: session.getLastActivityTimestamp() },
        });
      }
    }
    return result;
  }

  async getSessionInfo(name: string): Promise<SessionDetailedInfo | null> {
    const session = this.sessions.get(name);
    const config = this.sessionConfigs.get(name) ?? null;
    const exists = await this.exists(name);

    if (!exists) return null;

    let engine: any = {};
    if (session) {
      try {
        const engineInfo = await promiseTimeout(1000, session.getEngineInfo());
        engine = { engine: session.engine, ...engineInfo };
      } catch {
        engine = { engine: session?.engine };
      }
    }

    if (!session) {
      return {
        name,
        status: WAHASessionStatus.STOPPED,
        config,
        me: null,
        presence: null,
        timestamps: { activity: null },
        engine,
      };
    }

    const me = session.getSessionMeInfo();
    return {
      name: session.name,
      status: session.status,
      config: session.sessionConfig,
      me,
      presence: session.presence,
      timestamps: { activity: session.getLastActivityTimestamp() },
      engine,
    };
  }

  // ─── Stats (for /api/server/sessions/stats) ──────────────────────────────────
  getSessionsStats() {
    let running = 0;
    let stopped = 0;
    let failed = 0;
    for (const session of this.sessions.values()) {
      if (!session) {
        stopped++;
      } else if (session.status === WAHASessionStatus.FAILED) {
        failed++;
      } else {
        running++;
      }
    }
    return { total: this.sessions.size, running, stopped, failed };
  }

  // ─── Webhook helpers ─────────────────────────────────────────────────────────
  private getWebhooksForSession(config?: SessionConfig | null): WebhookConfig[] {
    let webhooks: WebhookConfig[] = [];
    if (config?.webhooks) {
      webhooks = webhooks.concat(config.webhooks);
    }
    const globalWebhookConfig = this.config.getWebhookConfig();
    if (globalWebhookConfig) {
      webhooks.push(globalWebhookConfig);
    }
    return webhooks;
  }

  private getProxyConfigForSession(
    name: string,
    config?: SessionConfig | null,
  ): ProxyConfig | undefined {
    if (config?.proxy) {
      return config.proxy;
    }
    const session = this.sessions.get(name);
    if (!session) return undefined;
    const sessions: Record<string, WhatsappSession> = { [name]: session };
    return getProxyConfig(this.config, sessions, name);
  }

  protected stopEvents() {
    for (const events of this.eventsMap.values()) {
      complete(events);
    }
  }

  // ─── Module Init ─────────────────────────────────────────────────────────────
  async onModuleInit() {
    await this.init();
  }

  async init() {
    await this.store.init();
    const knex = this.store.getWAHADatabase();
    await this.appsService.migrate(knex);
    // Load persisted session configs from disk
    await this.loadPersistedSessions();
  }

  private async loadPersistedSessions() {
    try {
      const sessionNames = await this.sessionConfigRepository.getAllConfigs();
      for (const name of sessionNames) {
        const config = await this.sessionConfigRepository.getConfig(name);
        this.sessionConfigs.set(name, config);
        // Mark as stopped (null) but tracked
        if (!this.sessions.has(name)) {
          this.sessions.set(name, null);
        }
      }
      this.log.info(
        `Loaded ${sessionNames.length} persisted session(s) from disk.`,
      );
    } catch (error) {
      this.log.error({ error }, 'Failed to load persisted sessions');
    }
  }
}
