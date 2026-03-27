/**
 * WAHA Plus — Webhook Management Controller
 *
 * GET  /api/webhooks          — list all configured webhooks across sessions
 * POST /api/webhooks/test     — send a test payload to a webhook URL
 * GET  /api/webhooks/events   — list all available webhook event types
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { SessionManager } from '../core/abc/manager.abc';
import { PoliciesGuard } from '../core/auth/policies.guard';
import { WAHAValidationPipe } from '../nestjs/pipes/WAHAValidationPipe';
import { IsOptional, IsString, IsUrl } from 'class-validator';
import { WAHAEvents } from '../structures/enums.dto';

class WebhookTestRequest {
  @ApiProperty({ description: 'Webhook URL to test' })
  @IsUrl({ require_tld: false })
  url: string;

  @ApiProperty({ description: 'Optional secret for HMAC validation', required: false })
  @IsOptional()
  @IsString()
  secret?: string;
}

class WebhookInfo {
  @ApiProperty()
  session: string;

  @ApiProperty()
  url: string;

  @ApiProperty({ type: [String] })
  events: string[];

  @ApiProperty({ required: false })
  hmac?: string;
}

@ApiSecurity('api_key')
@Controller('api')
@ApiTags('🔔 Webhooks')
@UseGuards(PoliciesGuard)
export class WebhookPlusController {
  constructor(private manager: SessionManager) {}

  @Get('/webhooks')
  @ApiOperation({
    summary: 'List all configured webhooks across all sessions',
  })
  async listWebhooks(): Promise<WebhookInfo[]> {
    const sessions = await this.manager.getSessions(true);
    const result: WebhookInfo[] = [];

    for (const session of sessions) {
      const webhooks = session.config?.webhooks ?? [];
      for (const wh of webhooks) {
        result.push({
          session: session.name,
          url: wh.url,
          events: wh.events ?? [],
          hmac: wh.hmac?.key ? '***configured***' : undefined,
        });
      }
    }
    return result;
  }

  @Post('/webhooks/test')
  @HttpCode(200)
  @UsePipes(new WAHAValidationPipe())
  @ApiOperation({
    summary: 'Send a test event to a webhook URL',
    description: 'Fires a test payload to verify your webhook endpoint is reachable.',
  })
  async testWebhook(
    @Body() request: WebhookTestRequest,
  ): Promise<{ success: boolean; status?: number; error?: string; responseTime: number }> {
    const { url } = request;
    const payload = {
      event: 'test.webhook',
      session: 'test',
      timestamp: Date.now(),
      payload: { message: 'WAHA Plus webhook test — it works!' },
    };

    const start = Date.now();
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
      return {
        success: response.ok,
        status: response.status,
        responseTime: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message ?? String(err),
        responseTime: Date.now() - start,
      };
    }
  }

  @Get('/webhooks/events')
  @ApiOperation({
    summary: 'List all available webhook event types',
  })
  getAvailableEvents(): { events: string[] } {
    return {
      events: Object.values(WAHAEvents),
    };
  }
}
