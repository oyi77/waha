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
import { CheckPolicies } from '../core/auth/policies.decorator';
import { CanServer } from '../core/auth/policies';
import { Action } from '../core/auth/casl.types';
import { WAHAValidationPipe } from '../nestjs/pipes/WAHAValidationPipe';
import { IsOptional, IsString, IsUrl } from 'class-validator';
import { WAHAEvents } from '../structures/enums.dto';
import * as crypto from 'crypto';

import { ConfigService } from '@nestjs/config';
import { GlobalWebhookConfigConfig } from '../core/config/GlobalWebhookConfig';
import { webhookHmacHeaders, WebhookSender } from '../core/integrations/webhooks/WebhookSender';

class WebhookTestRequest {
  @ApiProperty({ description: 'Webhook URL to test' })
  @IsUrl({ require_tld: false })
  url: string;

  @ApiProperty({
    description:
      'Optional HMAC key override; defaults to WHATSAPP_HOOK_HMAC_KEY when set',
    required: false,
  })
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
  constructor(
    private manager: SessionManager,
    private configService: ConfigService,
  ) {}

  @Get('/webhooks')
  @CheckPolicies(CanServer(Action.Read))
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
  @CheckPolicies(CanServer(Action.Manage))
  @UsePipes(new WAHAValidationPipe())
  @ApiOperation({
    summary: 'Send a test event to a webhook URL',
    description:
      'Fires a test payload signed like real deliveries (WHATSAPP_HOOK_HMAC_KEY or the ' +
      'provided secret) so HMAC-verifying receivers accept it.',
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
    const body = JSON.stringify(payload);
    // Sign exactly like real deliveries so HMAC-enforcing endpoints answer 200.
    const globalKey = new GlobalWebhookConfigConfig(this.configService).hmacKey;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Request-Id': crypto.randomUUID().replace(/-/g, ''),
      'X-Webhook-Timestamp': Date.now().toString(),
      ...webhookHmacHeaders(body, request.secret || globalKey),
    };

    const start = Date.now();
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10000),
      });
      // Probe outcome is counted separately (event="test.webhook") so pings are
      // visible in /metrics without polluting real delivery counters.
      WebhookSender.recordDelivery('test.webhook', response.ok);
      return {
        success: response.ok,
        status: response.status,
        responseTime: Date.now() - start,
      };
    } catch (err: any) {
      WebhookSender.recordDelivery('test.webhook', false);
      return {
        success: false,
        error: err?.message ?? String(err),
        responseTime: Date.now() - start,
      };
    }
  }

  @Get('/webhooks/events')
  @CheckPolicies(CanServer(Action.Read))
  @ApiOperation({
    summary: 'List all available webhook event types',
  })
  getAvailableEvents(): { events: string[] } {
    return {
      events: Object.values(WAHAEvents),
    };
  }
}
