import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { SessionManager } from '@waha/core/abc/manager.abc';
import { PoliciesGuard } from '@waha/core/auth/policies.guard';
import { CheckPolicies } from '@waha/core/auth/policies.decorator';
import { CanServer } from '@waha/core/auth/policies';
import { Action } from '@waha/core/auth/casl.types';
import { SettingsService } from './settings.service';

class SessionHealthSummary {
  @ApiProperty({ description: 'Total tracked sessions' })
  total!: number;

  @ApiProperty({ description: 'Sessions in WORKING state' })
  working!: number;

  @ApiProperty({ description: 'Sessions in FAILED state' })
  failed!: number;

  @ApiProperty({ description: 'Sessions in SCAN_QR_CODE state' })
  scan_qr!: number;

  @ApiProperty({ description: 'Sessions in STOPPED state' })
  stopped!: number;

  @ApiProperty({ description: 'ISO timestamp of last health check' })
  lastCheck!: string;

  @ApiProperty({ description: 'Whether autoRestartFailed is enabled' })
  autoRestartEnabled!: boolean;
}

@ApiSecurity('api_key')
@Controller('api/health/sessions')
@ApiTags('🔍 Observability')
@UseGuards(PoliciesGuard)
export class SessionHealthController {
  constructor(
    private manager: SessionManager,
    private settingsService: SettingsService,
  ) {}

  @Get()
  @CheckPolicies(CanServer(Action.Read))
  @ApiOperation({
    summary: 'Get session health summary',
    description:
      'Returns a breakdown of sessions by status, auto-restart configuration, ' +
      'and the timestamp of the health check. Plus-only endpoint.',
  })
  async getHealth(): Promise<SessionHealthSummary> {
    const sessions = await this.manager.getSessions(false);

    let working = 0;
    let failed = 0;
    let scan_qr = 0;
    let stopped = 0;

    for (const session of sessions) {
      switch (session.status) {
        case 'WORKING':
          working++;
          break;
        case 'FAILED':
          failed++;
          break;
        case 'SCAN_QR_CODE':
          scan_qr++;
          break;
        case 'STOPPED':
          stopped++;
          break;
      }
    }

    let autoRestartEnabled = false;
    try {
      const lcSettings = await this.settingsService.getSessionLifecycleSettings();
      autoRestartEnabled = lcSettings.autoRestartFailed;
    } catch {
      // Settings not available
    }

    return {
      total: sessions.length,
      working: working,
      failed: failed,
      scan_qr: scan_qr,
      stopped: stopped,
      lastCheck: new Date().toISOString(),
      autoRestartEnabled: autoRestartEnabled,
    };
  }
}
