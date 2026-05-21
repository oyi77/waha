import {
  Inject,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
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
import { Sqlite3ApiKeyRepository } from '@waha/core/storage/sqlite3/Sqlite3ApiKeyRepository';
import { LocalSessionAuthRepository } from '@waha/core/storage/LocalSessionAuthRepository';
import { LocalSessionConfigRepository } from '@waha/core/storage/LocalSessionConfigRepository';
import { LocalStoreCore } from '@waha/core/storage/LocalStoreCore';
import { Sqlite3SessionWorkerRepository } from '@waha/core/storage/sqlite3/Sqlite3SessionWorkerRepository';
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
import { AnalyticsService } from './analytics.service';
import { AutoReplyService } from './autoreply.service';
import { MessageEventService } from './message.event.service';
import { MessageLogService } from './message.log.service';
import { SettingsService } from './settings.service';

const MAX_SESSIONS_ENV = 'WAHA_MAX_SESSIONS';

@Injectable()
export class SessionManagerPlus extends SessionManager implements OnModuleInit, OnModuleDestroy {
  SESSION_STOP_TIMEOUT = 3000;

  // Map: sessionName -> WhatsappSession (null = stopped, absent = removed)
  private sessions: Map<string, WhatsappSession | null>;
  // Map: sessionName -> SessionConfig (null = no config)
  private sessionConfigMap: Map<string, SessionConfig | null>;
  // Per-session, per-event reactive streams
  private eventsMap: Map<string, DefaultMap<WAHAEvents, SwitchObservable<any>>>;

  protected readonly EngineClass: typeof WhatsappSession;
  protected readonly engineBootstrap: EngineBootstrap;

  private localSessionConfigRepo: LocalSessionConfigRepository;
  private _cachedLifecycleSettings: {
    autoRestartOnBoot: boolean;
    autoRestartFailed: boolean;
    restartAllSessions: boolean;
    autoStartDelay: number;
  } | null = null;

  private _failedSessionCheckTimer: ReturnType<typeof setInterval> | null = null;
  private _failedRestartAttempts: Map<string, number> = new Map();
  private static readonly FAILED_CHECK_INTERVAL_MS = 60_000;
  private static readonly MAX_FAILED_RESTART_ATTEMPTS = 5;

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
    @Optional() private messageEventService?: MessageEventService,
    @Optional() private autoReplyService?: AutoReplyService,
    @Optional() private messageLogService?: MessageLogService,
    @Optional() private analyticsService?: AnalyticsService,
    @Optional() private settingsService?: SettingsService,
  ) {
    super(log, config, gowsConfigService, appsService);
    this.sessions = new Map();
    this.sessionConfigMap = new Map();
    this.eventsMap = new Map();

    const engineName = this.engineConfigService.getDefaultEngineName();
    this.EngineClass = this.getEngine(engineName);
    this.engineBootstrap = this.getEngineBootstrap(engineName);

    const store = new LocalStoreCore(getNamespace(), getSessionNamespace());
    this.store = store;
    this.sessionAuthRepository = new LocalSessionAuthRepository(store);
    this.localSessionConfigRepo = new LocalSessionConfigRepository(store);
  }

  protected getEngine(engine: WAHAEngine): typeof WhatsappSession {
    if (engine === WAHAEngine.WEBJS) return WhatsappSessionWebJSCore;
    if (engine === WAHAEngine.WPP) return WhatsappSessionWPPCore;
    if (engine === WAHAEngine.NOWEB) return WhatsappSessionNoWebCore;
    if (engine === WAHAEngine.GOWS) return WhatsappSessionGoWSCore;
    throw new NotFoundException(`Unknown whatsapp engine '${engine}'.`);
  }

  // ─── Session Limit ────────────────────────────────────────────────────────────
  private checkSessionLimit() {
    const max = parseInt(process.env[MAX_SESSIONS_ENV] || '0', 10);
    if (max <= 0) return; // 0 = unlimited
    const running = [...this.sessions.values()].filter(
      (s) => s !== null,
    ).length;
    if (running >= max) {
      throw new UnprocessableEntityException(
        `Session limit reached: max ${max} concurrent sessions allowed. ` +
          `Stop or delete an existing session before starting a new one. ` +
          `Set WAHA_MAX_SESSIONS=0 for unlimited.`,
      );
    }
  }

  // ─── Event Observables ────────────────────────────────────────────────────────
  private getOrCreateEvents(
    name: string,
  ): DefaultMap<WAHAEvents, SwitchObservable<any>> {
    if (!this.eventsMap.has(name)) {
      this.eventsMap.set(
        name,
        new DefaultMap<WAHAEvents, SwitchObservable<any>>(
          () => new SwitchObservable((obs$) => obs$.pipe(retry(), share())),
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

  // ─── Lifecycle ────────────────────────────────────────────────────────────────
  async beforeApplicationShutdown(_signal?: string) {
    for (const [name, session] of this.sessions.entries()) {
      if (session) {
        await this.stop(name, true).catch(() => {});
      }
    }
    this.stopEvents();
    await this.engineBootstrap.shutdown();
  }

  async onApplicationBootstrap() {
    this.apiKeyRepository = new Sqlite3ApiKeyRepository(this.store);
    await this.apiKeyRepository.init();
    await this.engineBootstrap.bootstrap();

    // Load session lifecycle settings from DB (merge with env var defaults)
    const lcSettings = await this.loadSessionLifecycleSettings();

    // Apply auto-start delay if configured
    if (lcSettings.autoStartDelay > 0) {
      this.log.info(
        `Delaying session start by ${lcSettings.autoStartDelay}s (autoStartDelay)`,
      );
      await sleep(lcSettings.autoStartDelay * 1000);
    }

    // Restart sessions that were running on this worker
    const restartAll = lcSettings.restartAllSessions;
    if (restartAll) {
      await this.restartAllSessions(lcSettings);
    } else {
      await this.restartWorkerSessions(lcSettings);
    }

    // Also start predefined sessions from env var
    this.startPredefinedSessions();
  }

  private async loadSessionLifecycleSettings(): Promise<{
    autoRestartOnBoot: boolean;
    autoRestartFailed: boolean;
    restartAllSessions: boolean;
    autoStartDelay: number;
  }> {
    // Start with env var defaults
    const defaults = {
      autoRestartOnBoot: this.config.shouldRestartWorkerSessions,
      autoRestartFailed: false,
      restartAllSessions: this.config.shouldRestartAllSessions,
      autoStartDelay: this.config.autoStartDelaySeconds,
    };

    // Override with DB settings if available
    if (this.settingsService) {
      try {
        const dbSettings =
          await this.settingsService.getSessionLifecycleSettings();
        const settings = {
          autoRestartOnBoot: dbSettings.autoRestartOnBoot,
          autoRestartFailed: dbSettings.autoRestartFailed,
          restartAllSessions: dbSettings.restartAllSessions,
          autoStartDelay: dbSettings.autoStartDelay,
        };
        this._cachedLifecycleSettings = settings;
        return settings;
      } catch (error) {
        this.log.warn(
          { error },
          'Failed to load session lifecycle settings from DB, using env defaults',
        );
      }
    }

    return defaults;
  }

  async reloadSessionLifecycleSettings() {
    this._cachedLifecycleSettings = null;
    return this.loadSessionLifecycleSettings();
  }

  async getSessionLifecycleSettings() {
    if (this._cachedLifecycleSettings) {
      return this._cachedLifecycleSettings;
    }
    return this.loadSessionLifecycleSettings();
  }

  // ─── Core API ─────────────────────────────────────────────────────────────────
  async exists(name: string): Promise<boolean> {
    if (this.sessions.has(name) || this.sessionConfigMap.has(name)) return true;
    return this.localSessionConfigRepo.exists(name);
  }

  isRunning(name: string): boolean {
    return !!this.sessions.get(name);
  }

  async upsert(name: string, config?: SessionConfig): Promise<void> {
    this.sessionConfigMap.set(name, config ?? null);
    if (config) {
      await this.localSessionConfigRepo.saveConfig(name, config);
    } else {
      // Mark as tracked even without config
      if (!this.sessions.has(name)) {
        this.sessions.set(name, null);
      }
    }
  }

  async start(name: string): Promise<SessionDTO> {
    if (this.isRunning(name)) {
      // Allow restarting sessions that aren't WORKING (FAILED, SCAN_QR_CODE, etc.)
      const session = this.sessions.get(name);
      if (session?.status !== WAHASessionStatus.WORKING) {
        await this.stop(name, true);
      } else {
        throw new UnprocessableEntityException(
          `Session '${name}' is already started.`,
        );
      }
    }

    this.checkSessionLimit();

    this.log.info({ session: name }, 'Starting session...');
    const config = this.sessionConfigMap.get(name) ?? null;
    const logger = this.log.logger.child({ session: name });
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
    const proxyConfig = this.resolveProxy(name, config);
    const sessionConfig: SessionParams = {
      name,
      mediaManager,
      loggerBuilder,
      printQR: this.engineConfigService.shouldPrintQR,
      sessionStore: this.store,
      proxyConfig,
      sessionConfig: config,
      ignore: this.ignoreChatsConfig(config),
    };

    // Per-session engine override: use config.engine if specified, else fallback to server default
    const perSessionEngine: WAHAEngine | undefined = (config as any)?.engine as
      | WAHAEngine
      | undefined;
    const EngineClass = perSessionEngine
      ? this.getEngine(perSessionEngine)
      : this.EngineClass;

    if (EngineClass === WhatsappSessionWebJSCore) {
      sessionConfig.engineConfig = this.webjsEngineConfigService.getConfig();
    } else if (EngineClass === WhatsappSessionWPPCore) {
      sessionConfig.engineConfig = this.wppEngineConfigService.getConfig();
    } else if (EngineClass === WhatsappSessionGoWSCore) {
      sessionConfig.engineConfig = this.gowsConfigService.getConfig();
    }

    await this.sessionAuthRepository.init(name);
    // @ts-ignore
    const session = new EngineClass(sessionConfig);
    this.sessions.set(name, session);
    this.updateSessionEvents(name);

    // Configure webhooks
    const webhooks = this.resolveWebhooks(config);
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
      // Subscribe to message events for auto-reply, logging, analytics
      this.subscribeMessageEvents(name);
      if (this.analyticsService) {
        this.analyticsService
          .increment(name, 'sessions_started')
          .catch(() => {});
      }
    } else {
      // Session failed before start — mark as not running so it can be restarted
      this.sessions.set(name, null);
    }

    // Track on worker for auto-restart
    await this.assign(name);

    return {
      name: session.name,
      status: session.status,
      config: session.sessionConfig,
    };
  }

  async stop(name: string, silent: boolean): Promise<void> {
    if (!this.isRunning(name)) {
      this.log.debug({ session: name }, 'Session is not running.');
      return;
    }
    this.log.info({ session: name }, 'Stopping session...');
    try {
      const session = this.getSession(name);
      await session.stop();
    } catch (err) {
      this.log.warn(`Error while stopping session '${name}'`);
      if (!silent) throw err;
    }
    this.log.info({ session: name }, 'Session has been stopped.');
    this.sessions.set(name, null);
    // Untrack from worker
    await this.unassign(name);
    await sleep(this.SESSION_STOP_TIMEOUT);
  }

  async unpair(name: string) {
    const session = this.sessions.get(name);
    if (!session) return;
    this.log.info({ session: name }, 'Unpairing device from account...');
    await session.unpair().catch((err) => {
      this.log.warn(`Error while unpairing: ${err}`);
    });
    await sleep(1000);
  }

  async logout(name: string): Promise<void> {
    await this.sessionAuthRepository.clean(name);
  }

  async delete(name: string): Promise<void> {
    await this.appsService.removeBySession(this, name);
    this.sessions.delete(name);
    this.sessionConfigMap.delete(name);
    this.eventsMap.delete(name);
    // Remove from worker tracking + disk
    await this.sessionWorkerRepository?.remove(name);
    await this.localSessionConfigRepo.deleteConfig(name);
  }

  getSession(name: string): WhatsappSession {
    const session = this.sessions.get(name);
    if (!session) {
      throw new NotFoundException(
        `Session '${name}' is not running.\n` +
          `Start it via POST /api/sessions/${name}/start`,
      );
    }
    return session;
  }

  async getSessions(all: boolean): Promise<SessionInfo[]> {
    const result: SessionInfo[] = [];
    const tracked = new Set([
      ...this.sessions.keys(),
      ...this.sessionConfigMap.keys(),
    ]);

    for (const name of tracked) {
      const session = this.sessions.get(name);
      const config = this.sessionConfigMap.get(name) ?? null;

      if (!session && !all) continue;

      if (!session) {
        result.push({
          name,
          status: WAHASessionStatus.STOPPED,
          config,
          me: null,
          presence: null,
          timestamps: { activity: null },
        });
      } else {
        result.push({
          name: session.name,
          status: session.status,
          config: session.sessionConfig,
          me: session.getSessionMeInfo(),
          presence: session.presence,
          timestamps: { activity: session.getLastActivityTimestamp() },
        });
      }
    }
    return result;
  }

  async getSessionInfo(name: string): Promise<SessionDetailedInfo | null> {
    const exists = await this.exists(name);
    if (!exists) return null;

    const session = this.sessions.get(name);
    const config = this.sessionConfigMap.get(name) ?? null;

    let engine: any = {};
    if (session) {
      try {
        const info = await promiseTimeout(1000, session.getEngineInfo());
        engine = { engine: session.engine, ...info };
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

    return {
      name: session.name,
      status: session.status,
      config: session.sessionConfig,
      me: session.getSessionMeInfo(),
      presence: session.presence,
      timestamps: { activity: session.getLastActivityTimestamp() },
      engine,
    };
  }

  // ─── Stats ────────────────────────────────────────────────────────────────────
  getSessionsStats() {
    let running = 0;
    let stopped = 0;
    let failed = 0;
    const tracked = new Set([
      ...this.sessions.keys(),
      ...this.sessionConfigMap.keys(),
    ]);
    for (const name of tracked) {
      const session = this.sessions.get(name);
      if (!session) stopped++;
      else if (session.status === WAHASessionStatus.FAILED) failed++;
      else running++;
    }
    return {
      total: tracked.size,
      running,
      stopped,
      failed,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  private resolveWebhooks(config?: SessionConfig | null): WebhookConfig[] {
    let webhooks: WebhookConfig[] = [];
    if (config?.webhooks) webhooks = webhooks.concat(config.webhooks);
    const global = this.config.getWebhookConfig();
    if (global) webhooks.push(global);
    return webhooks;
  }

  private resolveProxy(
    name: string,
    config?: SessionConfig | null,
  ): ProxyConfig | undefined {
    if (config?.proxy) return config.proxy;
    const session = this.sessions.get(name);
    if (!session) return undefined;
    return getProxyConfig(this.config, { [name]: session }, name);
  }

  protected stopEvents() {
    for (const events of this.eventsMap.values()) {
      complete(events);
    }
  }

  // ─── Init & Restart ───────────────────────────────────────────────────────────
  async onModuleInit() {
    await this.init();
    // Wire circular-dependency-free plus services
    if (this.autoReplyService) this.autoReplyService.setManager(this);
    if (this.messageLogService) this.messageLogService.setManager(this);
    if (this.analyticsService) this.analyticsService.setManager(this);
    if (this.settingsService) this.settingsService.setManager(this);
    // Start periodic health check for FAILED session auto-restart
    this.startFailedSessionHealthCheck();
  }

  async onModuleDestroy() {
    if (this._failedSessionCheckTimer) {
      clearInterval(this._failedSessionCheckTimer);
      this._failedSessionCheckTimer = null;
    }
  }

  //
  // Failed Session Health Check
  //
  private startFailedSessionHealthCheck() {
    this._failedSessionCheckTimer = setInterval(
      () => this.checkAndRestartFailedSessions(),
      SessionManagerPlus.FAILED_CHECK_INTERVAL_MS,
    );
    // Allow the process to exit even if the timer is active
    if (this._failedSessionCheckTimer?.unref) {
      this._failedSessionCheckTimer.unref();
    }
  }

  private async checkAndRestartFailedSessions() {
    try {
      const settings = await this.getSessionLifecycleSettings();
      if (!settings.autoRestartFailed) return;

      for (const [name, session] of this.sessions.entries()) {
        if (!session) continue;
        if (session.status !== WAHASessionStatus.FAILED) {
          // Session recovered or moved to another state — reset counter
          this._failedRestartAttempts.delete(name);
          continue;
        }

        const attempts = this._failedRestartAttempts.get(name) ?? 0;
        if (attempts >= SessionManagerPlus.MAX_FAILED_RESTART_ATTEMPTS) {
          this.log.warn(
            { session: name, attempts },
            'Auto-restart for FAILED session reached max attempts — skipping',
          );
          continue;
        }

        this._failedRestartAttempts.set(name, attempts + 1);
        this.log.info(
          { session: name, attempt: attempts + 1, max: SessionManagerPlus.MAX_FAILED_RESTART_ATTEMPTS },
          'Auto-restarting FAILED session...',
        );

        await this.withLock(name, async () => {
          await this.start(name).catch((err) => {
            this.log.error(
              { session: name, error: err?.message ?? err },
              'Auto-restart of FAILED session failed',
            );
          });
        });
      }
    } catch (err) {
      this.log.error({ error: err }, 'Failed session health check error');
    }
  }

  // ─── Plus: Message Event Subscription ────────────────────────────────────────
  private subscribeMessageEvents(name: string) {
    if (
      !this.messageEventService &&
      !this.messageLogService &&
      !this.analyticsService
    )
      return;
    const events = this.eventsMap.get(name);
    if (!events) return;
    const msgObservable = events.get(WAHAEvents.MESSAGE);
    msgObservable.subscribe((event: any) => {
      try {
        const payload = event?.payload ?? event ?? {};
        const fromMe: boolean =
          payload?.fromMe ?? payload?.key?.fromMe ?? false;
        const chatId: string =
          payload?.from ||
          payload?.chatId ||
          payload?.to ||
          payload?.key?.remoteJid ||
          '';
        const text: string =
          payload?.body || payload?.text || payload?.message?.text || '';
        if (!chatId) return;
        const direction: 'incoming' | 'outgoing' = fromMe
          ? 'outgoing'
          : 'incoming';

        // Log message history
        if (this.messageLogService) {
          this.messageLogService
            .log({
              session: name,
              chatId,
              direction,
              type: 'text',
              body: text || null,
              timestamp: Date.now(),
              status: 'received',
              raw: payload,
            })
            .catch(() => {});
        }

        // Analytics counters
        if (this.analyticsService) {
          const metric =
            direction === 'outgoing' ? 'messages_sent' : 'messages_received';
          this.analyticsService.increment(name, metric).catch(() => {});
        }

        // Emit to message event broker (auto-reply, etc.)
        if (this.messageEventService && text) {
          this.messageEventService
            .emit(name, chatId, text, direction, payload)
            .catch(() => {});
        }
      } catch {
        // swallow — never let subscription throw
      }
    });
  }

  async init() {
    await this.store.init();
    const knex = this.store.getWAHADatabase();
    await this.appsService.migrate(knex);
    // Set up worker repository for auto-restart tracking
    this.sessionWorkerRepository = new Sqlite3SessionWorkerRepository(
      this.store,
    );
    await this.sessionWorkerRepository.init();
    // Load all persisted session configs from disk
    await this.loadPersistedSessionConfigs();
  }

  private async loadPersistedSessionConfigs() {
    try {
      const names = await this.localSessionConfigRepo.getAllConfigs();
      for (const name of names) {
        const config = await this.localSessionConfigRepo.getConfig(name);
        this.sessionConfigMap.set(name, config);
        if (!this.sessions.has(name)) {
          this.sessions.set(name, null);
        }
      }
      this.log.info(
        `Loaded ${names.length} persisted session config(s) from disk.`,
      );
    } catch (error) {
      this.log.error({ error }, 'Failed to load persisted sessions');
    }
  }

  private async restartWorkerSessions(lcSettings: {
    autoRestartOnBoot: boolean;
    autoRestartFailed: boolean;
  }) {
    if (!lcSettings.autoRestartOnBoot) {
      this.log.info(
        'Worker session auto-restart is disabled (autoRestartOnBoot=false)',
      );
      return;
    }
    if (!this.sessionWorkerRepository) return;

    try {
      const sessions = await this.sessionWorkerRepository.getSessionsByWorker(
        this.workerId,
      );
      if (!sessions.length) return;
      this.log.info(
        `Auto-restarting ${sessions.length} session(s) for worker '${this.workerId}'...`,
      );
      for (const name of sessions) {
        this.withLock(name, async () => {
          const log = this.log.logger.child({ session: name });
          log.info('Restarting worker session...');
          await this.start(name).catch((err) => {
            log.error(`Failed to restart worker session: ${err}`);
          });
        });
      }
    } catch (error) {
      this.log.error({ error }, 'Failed to restart worker sessions');
    }
  }

  private async restartAllSessions(lcSettings: {
    autoRestartOnBoot: boolean;
    autoRestartFailed: boolean;
  }) {
    if (!lcSettings.autoRestartOnBoot) {
      this.log.info(
        'Session auto-restart is disabled (autoRestartOnBoot=false)',
      );
      return;
    }
    if (!this.sessionWorkerRepository) return;

    try {
      const allWorkers = await this.sessionWorkerRepository.getAll();
      const allSessions = allWorkers.map((w) => w.id);
      if (!allSessions.length) return;
      this.log.info(
        `Auto-restarting ${allSessions.length} session(s) across all workers (restartAllSessions=true)...`,
      );
      for (const name of allSessions) {
        this.withLock(name, async () => {
          const log = this.log.logger.child({ session: name });
          log.info('Restarting session...');
          await this.start(name).catch((err) => {
            log.error(`Failed to restart session: ${err}`);
          });
        });
      }
    } catch (error) {
      this.log.error({ error }, 'Failed to restart all sessions');
    }
  }
}
