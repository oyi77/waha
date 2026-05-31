import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SessionManager } from '@waha/core/abc/manager.abc';
import { SessionCreateRequest } from '@waha/structures/sessions.dto';

interface CloneOptions {
  name: string;
  copyConfig?: boolean;
  copyMetadata?: boolean;
  startImmediately?: boolean;
}

@Injectable()
export class SessionCloningService {
  constructor(
    private readonly manager: SessionManager,
    private readonly log: PinoLogger,
  ) {
    this.log.setContext(SessionCloningService.name);
  }

  async cloneSession(
    sourceSession: string,
    options: CloneOptions,
  ): Promise<{ success: boolean; message: string; session?: string }> {
    this.log.info(
      `Cloning session ${sourceSession} to ${options.name}`,
    );

    try {
      const sourceInfo = await this.manager.getSessionInfo(sourceSession);
      if (!sourceInfo) {
        return {
          success: false,
          message: `Source session ${sourceSession} not found`,
        };
      }

      const exists = await this.manager.exists(options.name);
      if (exists) {
        return {
          success: false,
          message: `Target session ${options.name} already exists`,
        };
      }

      const config: SessionCreateRequest = {
        name: options.name,
        config: options.copyConfig !== false ? sourceInfo.config : undefined,
      };

      await this.manager.upsert(options.name, config.config);

      if (options.startImmediately !== false) {
        await this.manager.assign(options.name);
        await this.manager.start(options.name);
      }

      this.log.info(
        `Successfully cloned session ${sourceSession} to ${options.name}`,
      );

      return {
        success: true,
        message: `Session cloned successfully`,
        session: options.name,
      };
    } catch (error) {
      this.log.error(
        { error },
        `Failed to clone session ${sourceSession}`,
      );
      return {
        success: false,
        message: `Failed to clone session: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async cloneWithModifications(
    sourceSession: string,
    targetName: string,
    modifications: Partial<SessionCreateRequest['config']>,
  ): Promise<{ success: boolean; message: string; session?: string }> {
    this.log.info(
      `Cloning session ${sourceSession} to ${targetName} with modifications`,
    );

    try {
      const sourceInfo = await this.manager.getSessionInfo(sourceSession);
      if (!sourceInfo) {
        return {
          success: false,
          message: `Source session ${sourceSession} not found`,
        };
      }

      const exists = await this.manager.exists(targetName);
      if (exists) {
        return {
          success: false,
          message: `Target session ${targetName} already exists`,
        };
      }

      const mergedConfig = {
        ...sourceInfo.config,
        ...modifications,
      };

      await this.manager.upsert(targetName, mergedConfig);
      await this.manager.assign(targetName);
      await this.manager.start(targetName);

      this.log.info(
        `Successfully cloned session ${sourceSession} to ${targetName} with modifications`,
      );

      return {
        success: true,
        message: `Session cloned with modifications`,
        session: targetName,
      };
    } catch (error) {
      this.log.error(
        { error },
        `Failed to clone session ${sourceSession} with modifications`,
      );
      return {
        success: false,
        message: `Failed to clone session: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async getSessionTemplate(session: string): Promise<SessionCreateRequest | null> {
    const info = await this.manager.getSessionInfo(session);
    if (!info) return null;

    return {
      name: info.name,
      config: info.config,
    };
  }

  async createFromTemplate(
    template: SessionCreateRequest,
    name: string,
  ): Promise<{ success: boolean; message: string; session?: string }> {
    try {
      const exists = await this.manager.exists(name);
      if (exists) {
        return {
          success: false,
          message: `Session ${name} already exists`,
        };
      }

      await this.manager.upsert(name, template.config);
      await this.manager.assign(name);
      await this.manager.start(name);

      return {
        success: true,
        message: `Session created from template`,
        session: name,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to create session from template: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}
