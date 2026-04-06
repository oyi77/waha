import { Injectable } from '@nestjs/common';
import { HealthCheckResult } from '@nestjs/terminus';

import { WAHAHealthCheckService } from '../abc/WAHAHealthCheckService';

@Injectable()
export class WAHAHealthCheckServiceCore extends WAHAHealthCheckService {
  async check(): Promise<HealthCheckResult> {
    const sessions = await this.sessionManager.getSessions(false);
    const running = sessions.length;
    return {
      status: 'ok',
      info: {
        sessions: {
          status: 'up',
          running: running,
        },
      },
      error: {},
      details: {
        sessions: {
          status: 'up',
          running: running,
        },
      },
    };
  }
}
