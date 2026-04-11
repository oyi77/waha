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
import { IsArray, IsNumber, IsOptional, IsString, Min } from 'class-validator';

class BroadcastTextRequest {
  @ApiProperty({ description: 'Session name', example: 'default' })
  @IsString()
  session: string;

  @ApiProperty({
    description: 'List of chatIds to send to (e.g. "12132132130@c.us")',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  chatIds: string[];

  @ApiProperty({ description: 'Text message to broadcast' })
  @IsString()
  text: string;

  @ApiProperty({
    description: 'Delay in ms between each message (default: 500)',
    required: false,
    example: 500,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  delayMs?: number;
}

class BroadcastResult {
  @ApiProperty({ description: 'chatIds that received the message', type: [String] })
  sent: string[];

  @ApiProperty({
    description: 'chatIds that failed',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        chatId: { type: 'string' },
        error: { type: 'string' },
      },
    },
  })
  failed: { chatId: string; error: string }[];
}

@ApiSecurity('api_key')
@Controller('api')
@ApiTags('📢 Broadcast')
@UseGuards(PoliciesGuard)
export class BroadcastController {
  constructor(private manager: SessionManager) {}

  @Post('/broadcast/text')
  @HttpCode(200)
  @CheckPolicies(CanSession(Action.Use, FromBody('session')))
  @UsePipes(new WAHAValidationPipe())
  @ApiOperation({
    summary: 'Broadcast text to multiple recipients',
    description:
      'Send a text message to multiple chatIds using a single session. ' +
      'Use delayMs to avoid rate limiting. Returns sent/failed lists.',
  })
  async broadcastText(
    @Body() request: BroadcastTextRequest,
  ): Promise<BroadcastResult> {
    const { session, chatIds, text, delayMs = 500 } = request;
    const whatsapp = await this.manager.getWorkingSession(session);

    const sent: string[] = [];
    const failed: { chatId: string; error: string }[] = [];

    for (let i = 0; i < chatIds.length; i++) {
      const chatId = chatIds[i];
      try {
        await whatsapp.sendText({ chatId, text, session });
        sent.push(chatId);
      } catch (err: any) {
        failed.push({ chatId, error: err?.message ?? String(err) });
      }

      // Delay between messages (skip delay after last message)
      if (delayMs > 0 && i < chatIds.length - 1) {
        await sleep(delayMs);
      }
    }

    return { sent, failed };
  }
}
