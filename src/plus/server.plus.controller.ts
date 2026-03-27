import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { SessionManager } from '@waha/core/abc/manager.abc';
import { PoliciesGuard } from '@waha/core/auth/policies.guard';
import { CheckPolicies } from '@waha/core/auth/policies.decorator';
import { CanServer } from '@waha/core/auth/policies';
import { Action } from '@waha/core/auth/casl.types';
import { SessionManagerPlus } from './manager.plus';

class SessionStatsResponse {
  @ApiProperty({ description: 'Total tracked sessions' })
  total: number;

  @ApiProperty({ description: 'Currently running sessions' })
  running: number;

  @ApiProperty({ description: 'Stopped (but tracked) sessions' })
  stopped: number;

  @ApiProperty({ description: 'Sessions in FAILED state' })
  failed: number;

  @ApiProperty({ description: 'Max sessions allowed (0 = unlimited)' })
  maxAllowed: number;
}

@ApiSecurity('api_key')
@Controller('api/server')
@ApiTags('🔍 Observability')
@UseGuards(PoliciesGuard)
export class ServerPlusController {
  constructor(private manager: SessionManager) {}

  @Get('sessions/stats')
  @ApiOperation({
    summary: 'Get session statistics',
    description: 'Returns counts of total, running, stopped and failed sessions. Plus-only endpoint.',
  })
  @CheckPolicies(CanServer(Action.Read))
  getSessionsStats(): SessionStatsResponse {
    // Only available in Plus mode (manager is SessionManagerPlus)
    if (this.manager instanceof SessionManagerPlus) {
      const stats = this.manager.getSessionsStats();
      return {
        ...stats,
        maxAllowed: parseInt(process.env.WAHA_MAX_SESSIONS || '0', 10),
      };
    }
    // Core fallback: single session
    return { total: 1, running: 0, stopped: 1, failed: 0, maxAllowed: 1 };
  }
}
