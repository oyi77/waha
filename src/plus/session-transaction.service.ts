import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SessionManager } from '@waha/core/abc/manager.abc';
import { SessionCreateRequest, SessionDTO } from '@waha/structures/sessions.dto';
import { generatePrefixedId } from '@waha/utils/ids';

@Injectable()
export class SessionTransactionService {
  constructor(
    private readonly manager: SessionManager,
    private readonly log: PinoLogger,
  ) {
    this.log.setContext(SessionTransactionService.name);
  }

  async createAndStart(request: SessionCreateRequest): Promise<SessionDTO> {
    const name = request.name || generatePrefixedId('session');

    this.log.info(`Starting transaction for session ${name}`);

    return this.manager.withLock(name, async () => {
      try {
        if (await this.manager.exists(name)) {
          throw new Error(`Session ${name} already exists`);
        }

        this.log.info(`Creating session ${name}`);
        await this.manager.upsert(name, request.config);

        if (request.start !== false) {
          this.log.info(`Starting session ${name}`);
          await this.manager.assign(name);
          await this.manager.start(name);
        }

        const info = await this.manager.getSessionInfo(name);
        this.log.info(`Transaction completed for session ${name}`);

        return {
          name: info.name,
          status: info.status,
          config: info.config,
        };
      } catch (error) {
        this.log.error(
          { error },
          `Transaction failed for session ${name}, rolling back`,
        );

        try {
          await this.manager.stop(name, true).catch(() => {});
          await this.manager.delete(name).catch(() => {});
          this.log.info(`Rollback completed for session ${name}`);
        } catch (rollbackError) {
          this.log.error(
            { error: rollbackError },
            `Rollback failed for session ${name}`,
          );
        }

        throw error;
      }
    });
  }
}
