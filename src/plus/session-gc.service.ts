import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SessionManager } from '@waha/core/abc/manager.abc';
import { WAHASessionStatus } from '@waha/structures/enums.dto';

@Injectable()
export class SessionGarbageCollectorService
  implements OnModuleInit, OnModuleDestroy
{
  private gcTimer: ReturnType<typeof setInterval> | null = null;
  private readonly GC_INTERVAL_MS = 60 * 60 * 1000;
  private readonly FAILED_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  private readonly STOPPED_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

  constructor(
    private readonly manager: SessionManager,
    private readonly log: PinoLogger,
  ) {
    this.log.setContext(SessionGarbageCollectorService.name);
  }

  onModuleInit() {
    this.startGarbageCollection();
  }

  onModuleDestroy() {
    this.stopGarbageCollection();
  }

  private startGarbageCollection() {
    this.log.info(
      `Starting garbage collector (interval: ${this.GC_INTERVAL_MS / 1000 / 60} minutes)`,
    );
    this.gcTimer = setInterval(
      () => this.runGarbageCollection(),
      this.GC_INTERVAL_MS,
    );
  }

  private stopGarbageCollection() {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
  }

  private async runGarbageCollection() {
    this.log.info('Running garbage collection...');

    try {
      const sessions = await this.manager.getSessions(true);
      let cleaned = 0;

      for (const session of sessions) {
        if (session.status === WAHASessionStatus.FAILED) {
          const lastActivity = session.timestamps?.activity;
          if (lastActivity) {
            const age = Date.now() - lastActivity;
            if (age > this.FAILED_SESSION_MAX_AGE_MS) {
              this.log.info(
                `Cleaning up failed session ${session.name} (age: ${Math.round(age / 1000 / 60 / 60)}h)`,
              );
              try {
                await this.manager.stop(session.name, true).catch(() => {});
                await this.manager.logout(session.name).catch(() => {});
                cleaned++;
              } catch (error) {
                this.log.error(
                  { error },
                  `Failed to clean up session ${session.name}`,
                );
              }
            }
          }
        }
      }

      this.log.info(`Garbage collection completed: ${cleaned} sessions cleaned`);
    } catch (error) {
      this.log.error({ error }, 'Garbage collection failed');
    }
  }
}
