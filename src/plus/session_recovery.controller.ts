import { Controller, Post, UseGuards, HttpCode } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { SessionManager } from '@waha/core/abc/manager.abc';
import { PoliciesGuard } from '@waha/core/auth/policies.guard';
import { CheckPolicies } from '@waha/core/auth/policies.decorator';
import { CanServer } from '@waha/core/auth/policies';
import { Action } from '@waha/core/auth/casl.types';

interface RecoveryResult {
  recovered: number;
  sessions: string[];
  failed: Array<{ name: string; error: string }>;
}

@ApiSecurity('api_key')
@Controller('api/health/sessions')
@ApiTags('🔍 Observability')
@UseGuards(PoliciesGuard)
export class SessionRecoveryController {
  constructor(private manager: SessionManager) {}

  @Post('/recover-all')
  @HttpCode(200)
  @CheckPolicies(CanServer(Action.Manage))
  @ApiOperation({
    summary: 'Recover all failed sessions',
    description:
      'Attempts to restart all sessions in FAILED state. ' +
      'Returns the number of recovered sessions and details of any failures.',
  })
  async recoverAllFailed(): Promise<RecoveryResult> {
    const sessions = await this.manager.getSessions(false);
    const failed = sessions.filter((s) => s.status === 'FAILED');

    const recovered: string[] = [];
    const failedRecovery: Array<{ name: string; error: string }> = [];

    for (const session of failed) {
      try {
        await this.manager.start(session.name);
        recovered.push(session.name);
      } catch (error) {
        failedRecovery.push({
          name: session.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      recovered: recovered.length,
      sessions: recovered,
      failed: failedRecovery,
    };
  }
}
