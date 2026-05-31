import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SessionManager } from '@waha/core/abc/manager.abc';
import { WAHASessionStatus } from '@waha/structures/enums.dto';

@Injectable()
export class SessionHeartbeatService implements OnModuleInit, OnModuleDestroy {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly HEARTBEAT_INTERVAL_MS = 5_000;
  private readonly MAX_RESTART_ATTEMPTS = 3;
  private restartAttempts: Map<string, number> = new Map();
  private sessionsNeedingQR: Set<string> = new Set();

  constructor(
    private readonly manager: SessionManager,
    private readonly log: PinoLogger,
  ) {
    this.log.setContext(SessionHeartbeatService.name);
  }

  onModuleInit() {
    this.startHeartbeat();
  }

  onModuleDestroy() {
    this.stopHeartbeat();
  }

  private startHeartbeat() {
    this.log.info(
      `Starting session heartbeat (interval: ${this.HEARTBEAT_INTERVAL_MS}ms)`,
    );
    this.heartbeatTimer = setInterval(
      () => this.checkSessions(),
      this.HEARTBEAT_INTERVAL_MS,
    );
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async checkSessions() {
    try {
      const sessions = await this.manager.getSessions(false);

      for (const session of sessions) {
        if (session.status === WAHASessionStatus.SCAN_QR_CODE) {
          this.sessionsNeedingQR.add(session.name);
          this.restartAttempts.delete(session.name);
        } else if (session.status === WAHASessionStatus.FAILED) {
          if (this.sessionsNeedingQR.has(session.name)) {
            continue;
          }
          await this.handleFailedSession(session.name);
        } else if (session.status === WAHASessionStatus.WORKING) {
          this.sessionsNeedingQR.delete(session.name);
          this.restartAttempts.delete(session.name);
        }
      }
    } catch (error) {
      this.log.error({ error }, 'Heartbeat check failed');
    }
  }

  private async handleFailedSession(name: string) {
    const attempts = this.restartAttempts.get(name) || 0;

    if (attempts >= this.MAX_RESTART_ATTEMPTS) {
      this.log.warn(
        `Session ${name} failed ${attempts} times, skipping auto-restart`,
      );
      return;
    }

    this.log.info(
      `Session ${name} is FAILED, auto-restarting (attempt ${attempts + 1}/${this.MAX_RESTART_ATTEMPTS})`,
    );

    try {
      await this.manager.start(name);
      this.restartAttempts.delete(name);
      this.log.info(`Session ${name} restarted successfully`);
    } catch (error) {
      this.restartAttempts.set(name, attempts + 1);
      this.log.error(
        { error },
        `Failed to restart session ${name} (attempt ${attempts + 1})`,
      );
    }
  }
}
