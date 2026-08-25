import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { safeEqual } from '@waha/core/auth/dashboardCookieAuth';
import { Auth } from '@waha/core/auth/config';
import { SessionManager } from '@waha/core/abc/manager.abc';

/**
 * Prometheus exposition endpoint — GET /metrics.
 *
 * Guarded by the WAHA API key (X-Api-Key) when one is configured; the
 * Prometheus scrape job must send the same key as a header. If no API key is
 * configured the endpoint is open (the container port is bound to localhost).
 */
@ApiTags('⚙️ Metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly manager: SessionManager) {}

  @Get()
  @ApiOperation({
    summary: 'Prometheus metrics',
    description: 'Session status gauges in Prometheus text exposition format.',
  })
  async metrics(@Req() request: Request): Promise<string> {
    const expected = Auth.keyplain?.value;
    if (expected) {
      const provided =
        (request.headers['x-api-key'] as string) ||
        this.bearerToken(request.headers.authorization);
      if (!provided || !safeEqual(provided, expected)) {
        throw new UnauthorizedMetricsError();
      }
    }

    const sessions = await this.manager.getSessions(false);
    const uptime = Math.floor(process.uptime());

    const lines: string[] = [];
    lines.push('# HELP waha_uptime_seconds Process uptime in seconds');
    lines.push('# TYPE waha_uptime_seconds gauge');
    lines.push(`waha_uptime_seconds ${uptime}`);
    lines.push('# HELP waha_sessions_total Number of configured sessions');
    lines.push('# TYPE waha_sessions_total gauge');
    lines.push(`waha_sessions_total ${sessions.length}`);
    lines.push(
      '# HELP waha_session_status Session status, 1 for the current status',
    );
    lines.push('# TYPE waha_session_status gauge');
    for (const session of sessions) {
      const label = MetricsController.escapeLabel(session.name);
      lines.push(
        `waha_session_status{session="${label}",status="${session.status}"} 1`,
      );
    }
    return lines.join('\n') + '\n';
  }

  private static escapeLabel(name: string): string {
    return name
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');
  }

  private bearerToken(header?: string): string | undefined {
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      return undefined;
    }
    return header.slice(7).trim();
  }
}

/** Rendered by the global exception filter as a proper 401 JSON. */
class UnauthorizedMetricsError extends HttpException {
  constructor() {
    super(
      { error: 'Unauthorized', statusCode: HttpStatus.UNAUTHORIZED },
      HttpStatus.UNAUTHORIZED,
    );
  }
}
