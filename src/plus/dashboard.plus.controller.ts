/**
 * WAHA Plus — Enhanced Dashboard / Status Controller
 *
 * GET /api/plus/status     — full system overview (sessions + uptime + version)
 * GET /api/plus/sessions   — enriched session list with QR links
 */
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { SessionManager } from '../core/abc/manager.abc';
import { PoliciesGuard } from '../core/auth/policies.guard';
import { CheckPolicies } from '../core/auth/policies.decorator';
import { CanServer } from '../core/auth/policies';
import { Action } from '../core/auth/casl.types';
import { WAHASessionStatus } from '../structures/enums.dto';
import { SessionManagerPlus } from './manager.plus';
import { VERSION } from '../version';

class PlusStatusResponse {
  @ApiProperty()
  version: string;

  @ApiProperty()
  tier: string;

  @ApiProperty()
  engine: string;

  @ApiProperty()
  uptime: number;

  @ApiProperty()
  sessions: {
    total: number;
    running: number;
    stopped: number;
    failed: number;
    maxAllowed: number;
  };

  @ApiProperty()
  features: string[];
}

class EnrichedSession {
  @ApiProperty()
  name: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  phone?: string;

  @ApiProperty()
  pushName?: string;

  @ApiProperty()
  qrUrl: string;

  @ApiProperty()
  pairingUrl: string;
}

@ApiSecurity('api_key')
@Controller('api/plus')
@ApiTags('⚡ Plus')
@UseGuards(PoliciesGuard)
export class DashboardPlusController {
  constructor(private manager: SessionManager) {}

  @Get('/status')
  @CheckPolicies(CanServer(Action.Read))
  @ApiOperation({
    summary: 'Full WAHA Plus system status',
    description: 'Returns version, tier, engine, uptime, session counts, and active features.',
  })
  async getStatus(): Promise<PlusStatusResponse> {
    const uptime = Math.floor(process.uptime() * 1000);

    let sessionStats = { total: 0, running: 0, stopped: 0, failed: 0, maxAllowed: 0 };
    if (this.manager instanceof SessionManagerPlus) {
      const raw = this.manager.getSessionsStats();
      sessionStats = {
        ...raw,
        maxAllowed: parseInt(process.env.WAHA_MAX_SESSIONS || '0', 10),
      };
    }

    return {
      version: VERSION.version,
      tier: VERSION.tier,
      engine: VERSION.engine,
      uptime,
      sessions: sessionStats,
      features: [
        'unlimited-sessions',
        'session-persistence',
        'auto-restart-on-boot',
        'bulk-broadcast',
        'bulk-send-personalized',
        'bulk-check-numbers',
        'webhook-management',
        'session-stats',
        'upstream-sync',
      ],
    };
  }

  @Get('/sessions')
  @CheckPolicies(CanServer(Action.Read))
  @ApiOperation({
    summary: 'Enriched session list with QR and pairing links',
  })
  async getSessions(): Promise<EnrichedSession[]> {
    const sessions = await this.manager.getSessions(true);
    const host = process.env.WAHA_PUBLIC_URL || 'http://localhost:3000';

    return sessions.map((s) => ({
      name: s.name,
      status: s.status,
      phone: s.me?.id?.replace('@c.us', ''),
      pushName: s.me?.pushName ?? undefined,
      qrUrl: `${host}/api/${s.name}/auth/qr`,
      pairingUrl: `${host}/api/${s.name}/auth/request-code`,
    }));
  }
}
