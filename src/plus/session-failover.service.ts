import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SessionManager } from '@waha/core/abc/manager.abc';

@Injectable()
export class SessionFailoverService implements OnModuleInit, OnModuleDestroy {
  private failoverTimer: ReturnType<typeof setInterval> | null = null;
  private readonly FAILOVER_CHECK_INTERVAL_MS = 30_000;

  constructor(
    private readonly manager: SessionManager,
    private readonly log: PinoLogger,
  ) {
    this.log.setContext(SessionFailoverService.name);
  }

  onModuleInit() {
    this.startFailoverCheck();
  }

  onModuleDestroy() {
    this.stopFailoverCheck();
  }

  private startFailoverCheck() {
    this.log.info(
      `Starting failover check (interval: ${this.FAILOVER_CHECK_INTERVAL_MS}ms)`,
    );
    this.failoverTimer = setInterval(
      () => this.checkForOrphanedSessions(),
      this.FAILOVER_CHECK_INTERVAL_MS,
    );
  }

  private stopFailoverCheck() {
    if (this.failoverTimer) {
      clearInterval(this.failoverTimer);
      this.failoverTimer = null;
    }
  }

  private async checkForOrphanedSessions() {
    try {
      const sessions = await this.manager.getSessions(false);

      for (const session of sessions) {
        if (!this.manager.isRunning(session.name)) {
          this.log.info(
            `Found stopped session ${session.name}, attempting restart...`,
          );
          try {
            await this.manager.assign(session.name);
            await this.manager.start(session.name);
            this.log.info(
              `Successfully restarted session ${session.name}`,
            );
          } catch (error) {
            this.log.error(
              { error },
              `Failed to restart session ${session.name}`,
            );
          }
        }
      }
    } catch (error) {
      this.log.error({ error }, 'Failover check failed');
    }
  }
}
