import { Controller, Get, Sse, MessageEvent, Query } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { SessionManager } from '@waha/core/abc/manager.abc';
import { Observable, interval, switchMap, from, map } from 'rxjs';

@Controller('api/stream/sessions')
@ApiTags('📡 Real-time')
export class SessionStreamController {
  constructor(private readonly manager: SessionManager) {}

  @Get()
  @Sse()
  @ApiOperation({
    summary: 'Stream session updates via SSE',
    description:
      'Returns a Server-Sent Events stream of session status updates. ' +
      'Updates are pushed every 3 seconds.',
  })
  streamSessions(): Observable<MessageEvent> {
    return interval(3000).pipe(
      switchMap(() => from(this.manager.getSessions(false))),
      map(
        (sessions) =>
          ({
            data: JSON.stringify({
              type: 'sessions',
              sessions: sessions.map((s) => ({
                name: s.name,
                status: s.status,
                me: s.me,
                timestamps: s.timestamps,
              })),
              timestamp: new Date().toISOString(),
            }),
          }) as MessageEvent,
      ),
    );
  }
}
