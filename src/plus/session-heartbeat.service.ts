import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SessionManager } from '@waha/core/abc/manager.abc';
import { WAHASessionStatus } from '@waha/structures/enums.dto';

@Injectable()
export class SessionHeartbeatService implements OnModuleInit, OnModuleDestroy {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly HEARTBEAT_INTERVAL_MS = 30_000;
  private readonly MAX_RESTART_ATTEMPTS = 3;
  private readonly RESTART_COOLDOWN_MS = 5 * 60 * 1000;
  private readonly MAX_COOLDOWN_MS = 60 * 60 * 1000;
  private restartAttempts: Map<string, number> = new Map();
  private lastRestartTime: Map<string, number> = new Map();
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
      `Starting session heartbeat (interval: ${this.HEARTBEAT_INTERVAL_MS / 1000}s)`,
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
          this.lastRestartTime.delete(session.name);
        } else if (session.status === WAHASessionStatus.FAILED) {
          if (this.sessionsNeedingQR.has(session.name)) {
            continue;
          }
          await this.handleFailedSession(session.name);
        } else if (session.status === WAHASessionStatus.WORKING) {
          this.sessionsNeedingQR.delete(session.name);
          this.restartAttempts.delete(session.name);
          this.lastRestartTime.delete(session.name);
        }
      }
    } catch (error) {
      this.log.error({ error }, 'Heartbeat check failed');
    }
  }

  private async handleFailedSession(name: string) {
    const attempts = this.restartAttempts.get(name) || 0;
    const lastRestart = this.lastRestartTime.get(name) || 0;
    const now = Date.now();

    if (attempts >= this.MAX_RESTART_ATTEMPTS) {
      const cooldownMs = Math.min(
        this.RESTART_COOLDOWN_MS * Math.pow(2, attempts - this.MAX_RESTART_ATTEMPTS),
        this.MAX_COOLDOWN_MS,
      );
      const timeSinceLastRestart = now - lastRestart;

      if (timeSinceLastRestart < cooldownMs) {
        const remainingSeconds = Math.ceil(
          (cooldownMs - timeSinceLastRestart) / 1000,
        );
        this.log.debug(
          `Session ${name} in cooldown, ${remainingSeconds}s remaining`,
        );
        return;
      }

      this.log.info(
        `Session ${name} cooldown expired, retrying restart`,
      );
      this.restartAttempts.set(name, 0);
    }

    const currentAttempts = this.restartAttempts.get(name) || 0;
    const timeSinceLastRestart = now - lastRestart;
    const minDelay = Math.max(this.RESTART_COOLDOWN_MS / (currentAttempts + 1), 10_000);

    if (timeSinceLastRestart < minDelay) {
      return;
    }

    this.log.info(
      `Session ${name} is FAILED, auto-restarting (attempt ${currentAttempts + 1}/${this.MAX_RESTART_ATTEMPTS})`,
    );

    try {
      await this.manager.start(name);
      this.restartAttempts.delete(name);
      this.lastRestartTime.delete(name);
      this.log.info(`Session ${name} restarted successfully`);
    } catch (error) {
      this.restartAttempts.set(name, currentAttempts + 1);
      this.lastRestartTime.set(name, now);
      this.log.error(
        { error },
        `Failed to restart session ${name} (attempt ${currentAttempts + 1})`,
      );
    }
  }

  getSessionStatus(): Array<{
    name: string;
    needsQR: boolean;
    restartAttempts: number;
    lastRestart: number;
    cooldownRemaining: number;
  }> {
    const status: Array<{
      name: string;
      needsQR: boolean;
      restartAttempts: number;
      lastRestart: number;
      cooldownRemaining: number;
    }> = [];

    for (const [name, attempts] of this.restartAttempts.entries()) {
      const lastRestart = this.lastRestartTime.get(name) || 0;
      const now = Date.now();
      const cooldownMs = attempts >= this.MAX_RESTART_ATTEMPTS
        ? Math.min(
            this.RESTART_COOLDOWN_MS * Math.pow(2, attempts - this.MAX_RESTART_ATTEMPTS),
            this.MAX_COOLDOWN_MS,
          )
        : 0;
      const cooldownRemaining = Math.max(0, cooldownMs - (now - lastRestart));

      status.push({
        name,
        needsQR: this.sessionsNeedingQR.has(name),
        restartAttempts: attempts,
        lastRestart,
        cooldownRemaining,
      });
    }

    return status;
  }

  async forceRestart(sessionName: string): Promise<boolean> {
    this.restartAttempts.delete(sessionName);
    this.lastRestartTime.delete(sessionName);
    this.sessionsNeedingQR.delete(sessionName);

    try {
      await this.manager.start(sessionName);
      this.log.info(`Force restart successful for session ${sessionName}`);
      return true;
    } catch (error) {
      this.log.error(
        { error },
        `Force restart failed for session ${sessionName}`,
      );
      return false;
    }
  }
}
