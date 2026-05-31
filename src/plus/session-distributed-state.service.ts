import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SessionManager } from '@waha/core/abc/manager.abc';

interface DistributedSessionState {
  sessionId: string;
  workerId: string;
  status: string;
  lastHeartbeat: number;
  metadata: Record<string, unknown>;
}

@Injectable()
export class SessionDistributedStateService
  implements OnModuleInit, OnModuleDestroy
{
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private readonly SYNC_INTERVAL_MS = 10_000;
  private stateCache: Map<string, DistributedSessionState> = new Map();

  constructor(
    private readonly manager: SessionManager,
    private readonly log: PinoLogger,
  ) {
    this.log.setContext(SessionDistributedStateService.name);
  }

  onModuleInit() {
    this.startStateSync();
  }

  onModuleDestroy() {
    this.stopStateSync();
  }

  private startStateSync() {
    this.log.info(
      `Starting distributed state sync (interval: ${this.SYNC_INTERVAL_MS}ms)`,
    );
    this.syncTimer = setInterval(
      () => this.syncState(),
      this.SYNC_INTERVAL_MS,
    );
  }

  private stopStateSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  private async syncState() {
    try {
      const sessions = await this.manager.getSessions(false);
      const currentWorkerId = this.manager.workerId;

      for (const session of sessions) {
        const state: DistributedSessionState = {
          sessionId: session.name,
          workerId: currentWorkerId,
          status: session.status,
          lastHeartbeat: Date.now(),
          metadata: {
            me: session.me,
            timestamps: session.timestamps,
          },
        };

        this.stateCache.set(session.name, state);

        try {
          await this.manager.assign(session.name);
        } catch (error) {
          this.log.debug(
            { error },
            `Failed to sync state for session ${session.name}`,
          );
        }
      }
    } catch (error) {
      this.log.error({ error }, 'State sync failed');
    }
  }

  async getSessionState(
    sessionId: string,
  ): Promise<DistributedSessionState | null> {
    return this.stateCache.get(sessionId) || null;
  }

  async getAllSessionStates(): Promise<DistributedSessionState[]> {
    return Array.from(this.stateCache.values());
  }
}
