/**
 * WAHA Plus — Bulk Messaging Controller
 *
 * POST /api/bulk/send   — Send personalized messages to a list of recipients
 * POST /api/bulk/check  — Check which phone numbers are on WhatsApp
 */
import {
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { SessionManager } from '@waha/core/abc/manager.abc';
import { PoliciesGuard } from '@waha/core/auth/policies.guard';
import { CheckPolicies } from '@waha/core/auth/policies.decorator';
import { CanSession, FromBody } from '@waha/core/auth/policies';
import { Action } from '@waha/core/auth/casl.types';
import { WAHAValidationPipe } from '@waha/nestjs/pipes/WAHAValidationPipe';
import { sleep } from '@waha/utils/promiseTimeout';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// ── DTOs ────────────────────────────────────────────────────────────────────

class BulkRecipient {
  @ApiProperty({ description: 'chatId e.g. 628111@c.us' })
  @IsString()
  chatId: string;

  @ApiProperty({ description: 'Message text for this recipient' })
  @IsString()
  text: string;
}

class BulkSendRequest {
  @ApiProperty({ description: 'Session name', example: 'default' })
  @IsString()
  session: string;

  @ApiProperty({
    description: 'List of recipients with personalized messages',
    type: [BulkRecipient],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkRecipient)
  recipients: BulkRecipient[];

  @ApiProperty({
    description: 'Delay in ms between messages (default: 800)',
    required: false,
    example: 800,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  delayMs?: number;
}

class BulkCheckRequest {
  @ApiProperty({ description: 'Session name', example: 'default' })
  @IsString()
  session: string;

  @ApiProperty({
    description: 'Phone numbers to check (international format, no +)',
    type: [String],
    example: ['6281234567890', '6289876543210'],
  })
  @IsArray()
  @IsString({ each: true })
  phones: string[];

  @ApiProperty({
    description: 'Delay in ms between checks (default: 300)',
    required: false,
    example: 300,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  delayMs?: number;
}

class BulkSendResult {
  @ApiProperty()
  sent: string[];

  @ApiProperty()
  failed: { chatId: string; error: string }[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  successRate: string;
}

class BulkCheckResult {
  @ApiProperty()
  onWhatsApp: string[];

  @ApiProperty()
  notOnWhatsApp: string[];

  @ApiProperty()
  failed: { phone: string; error: string }[];
}

// ── Controller ───────────────────────────────────────────────────────────────

@ApiSecurity('api_key')
@Controller('api')
@ApiTags('📨 Bulk')
@UseGuards(PoliciesGuard)
export class BulkController {
  constructor(private manager: SessionManager) {}

  @Post('/bulk/send')
  @HttpCode(200)
  @CheckPolicies(CanSession(Action.Send, FromBody('session')))
  @UsePipes(new WAHAValidationPipe())
  @ApiOperation({
    summary: 'Send personalized messages to multiple recipients',
    description:
      'Each recipient gets their own custom message text. ' +
      'Use delayMs to avoid rate limiting (default: 800ms).',
  })
  async bulkSend(@Body() request: BulkSendRequest): Promise<BulkSendResult> {
    const { session, recipients, delayMs = 800 } = request;
    const whatsapp = await this.manager.getWorkingSession(session);

    const sent: string[] = [];
    const failed: { chatId: string; error: string }[] = [];
    let consecutiveFailures = 0;

    for (let i = 0; i < recipients.length; i++) {
      const { chatId, text } = recipients[i];
      try {
        await whatsapp.sendText({ chatId, text, session });
        sent.push(chatId);
        consecutiveFailures = 0;
      } catch (err: any) {
        failed.push({ chatId, error: err?.message ?? String(err) });
        consecutiveFailures++;
        if (consecutiveFailures >= 3) {
          for (let j = i + 1; j < recipients.length; j++) {
            failed.push({
              chatId: recipients[j].chatId,
              error: 'Aborted: 3 consecutive failures — session may have died',
            });
          }
          break;
        }
      }
      if (delayMs > 0 && i < recipients.length - 1) {
        await sleep(delayMs);
      }
    }

    const total = recipients.length;
    const successRate = `${Math.round((sent.length / total) * 100)}%`;
    return { sent, failed, total, successRate };
  }

  @Post('/bulk/check')
  @HttpCode(200)
  @CheckPolicies(CanSession(Action.Send, FromBody('session')))
  @UsePipes(new WAHAValidationPipe())
  @ApiOperation({
    summary: 'Check which phone numbers are registered on WhatsApp',
    description:
      'Pass a list of phone numbers (international format, no +) ' +
      'to check which ones have an active WhatsApp account.',
  })
  async bulkCheck(@Body() request: BulkCheckRequest): Promise<BulkCheckResult> {
    const { session, phones, delayMs = 300 } = request;
    const whatsapp = await this.manager.getWorkingSession(session);

    const onWhatsApp: string[] = [];
    const notOnWhatsApp: string[] = [];
    const failed: { phone: string; error: string }[] = [];

    for (let i = 0; i < phones.length; i++) {
      const phone = phones[i];
      try {
        const result = await whatsapp.checkNumberStatus({ phone, session });
        if (result?.numberExists) {
          onWhatsApp.push(phone);
        } else {
          notOnWhatsApp.push(phone);
        }
      } catch (err: any) {
        failed.push({ phone, error: err?.message ?? String(err) });
      }
      if (delayMs > 0 && i < phones.length - 1) {
        await sleep(delayMs);
      }
    }

    return { onWhatsApp, notOnWhatsApp, failed };
  }
}
