import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { SessionManager } from '@waha/core/abc/manager.abc';
import { PoliciesGuard } from '@waha/core/auth/policies.guard';
import { CheckPolicies } from '@waha/core/auth/policies.decorator';
import { CanServer } from '@waha/core/auth/policies';
import { Action } from '@waha/core/auth/casl.types';
import { WAHASessionStatus } from '@waha/structures/enums.dto';

class SessionMetrics {
  @ApiProperty({ description: 'Total sessions' })
  total!: number;

  @ApiProperty({ description: 'Working sessions' })
  working!: number;

  @ApiProperty({ description: 'Failed sessions' })
  failed!: number;

  @ApiProperty({ description: 'Sessions needing QR scan' })
  scanQr!: number;

  @ApiProperty({ description: 'Stopped sessions' })
  stopped!: number;

  @ApiProperty({ description: 'Starting sessions' })
  starting!: number;

  @ApiProperty({ description: 'Health score (0-100)' })
  healthScore!: number;

  @ApiProperty({ description: 'Uptime percentage' })
  uptimePercentage!: number;

  @ApiProperty({ description: 'Average session age in hours' })
  avgSessionAgeHours!: number;

  @ApiProperty({ description: 'Last check timestamp' })
  lastCheck!: string;

  @ApiProperty({ description: 'Auto-restart enabled' })
  autoRestartEnabled!: boolean;
}

class SessionDetail {
  @ApiProperty({ description: 'Session name' })
  name!: string;

  @ApiProperty({ description: 'Session status' })
  status!: string;

  @ApiProperty({ description: 'Engine used' })
  engine!: string;

  @ApiProperty({ description: 'Phone number' })
  phone!: string;

  @ApiProperty({ description: 'Last activity timestamp' })
  lastActivity!: string;

  @ApiProperty({ description: 'Session age in hours' })
  ageHours!: number;

  @ApiProperty({ description: 'Is healthy' })
  isHealthy!: boolean;
}

@Controller('api/dashboard/health')
@ApiTags('📊 Dashboard')
@UseGuards(PoliciesGuard)
export class SessionDashboardController {
  private sessionStartTimes: Map<string, number> = new Map();

  constructor(private readonly manager: SessionManager) {}

  @Get('/metrics')
  @CheckPolicies(CanServer(Action.Read))
  @ApiOperation({
    summary: 'Get session health metrics',
    description: 'Returns comprehensive session health metrics for dashboard.',
  })
  async getMetrics(): Promise<SessionMetrics> {
    const sessions = await this.manager.getSessions(false);

    let working = 0;
    let failed = 0;
    let scanQr = 0;
    let stopped = 0;
    let starting = 0;

    for (const session of sessions) {
      switch (session.status) {
        case WAHASessionStatus.WORKING:
          working++;
          break;
        case WAHASessionStatus.FAILED:
          failed++;
          break;
        case WAHASessionStatus.SCAN_QR_CODE:
          scanQr++;
          break;
        case WAHASessionStatus.STOPPED:
          stopped++;
          break;
        case WAHASessionStatus.STARTING:
          starting++;
          break;
      }

      if (!this.sessionStartTimes.has(session.name)) {
        this.sessionStartTimes.set(session.name, Date.now());
      }
    }

    const total = sessions.length;
    const healthScore = total > 0 ? Math.round((working / total) * 100) : 0;
    const uptimePercentage = total > 0 ? Math.round(((working + scanQr) / total) * 100) : 0;

    let avgSessionAgeHours = 0;
    if (this.sessionStartTimes.size > 0) {
      const totalAge = Array.from(this.sessionStartTimes.values()).reduce(
        (sum, start) => sum + (Date.now() - start),
        0,
      );
      avgSessionAgeHours = Math.round(
        totalAge / this.sessionStartTimes.size / 1000 / 60 / 60,
      );
    }

    return {
      total,
      working,
      failed,
      scanQr,
      stopped,
      starting,
      healthScore,
      uptimePercentage,
      avgSessionAgeHours,
      lastCheck: new Date().toISOString(),
      autoRestartEnabled: true,
    };
  }

  @Get('/sessions')
  @CheckPolicies(CanServer(Action.Read))
  @ApiOperation({
    summary: 'Get detailed session health',
    description: 'Returns detailed health information for each session.',
  })
  async getSessionDetails(): Promise<SessionDetail[]> {
    const sessions = await this.manager.getSessions(false);

    return sessions.map((session) => {
      const startTime = this.sessionStartTimes.get(session.name) || Date.now();
      const ageHours = Math.round(
        (Date.now() - startTime) / 1000 / 60 / 60,
      );

      return {
        name: session.name,
        status: session.status,
        engine: (session as any).engine || 'unknown',
        phone: session.me?.id?.replace('@s.whatsapp.net', '') || 'N/A',
        lastActivity: session.timestamps?.activity
          ? new Date(session.timestamps.activity).toISOString()
          : 'N/A',
        ageHours,
        isHealthy: session.status === WAHASessionStatus.WORKING,
      };
    });
  }

  @Get('/summary')
  @CheckPolicies(CanServer(Action.Read))
  @ApiOperation({
    summary: 'Get health summary',
    description: 'Returns a quick health summary for monitoring.',
  })
  async getSummary() {
    const metrics = await this.getMetrics();

    return {
      status: metrics.healthScore >= 80 ? 'healthy' : metrics.healthScore >= 50 ? 'degraded' : 'unhealthy',
      healthScore: metrics.healthScore,
      working: metrics.working,
      total: metrics.total,
      message:
        metrics.healthScore >= 80
          ? 'All systems operational'
          : metrics.healthScore >= 50
            ? 'Some sessions need attention'
            : 'Critical: Multiple sessions down',
    };
  }
}
