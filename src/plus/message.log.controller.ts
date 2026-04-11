import {
  Controller,
  Delete,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CheckPolicies } from '@waha/core/auth/policies.decorator';
import { CanServer } from '@waha/core/auth/policies';
import { Action } from '@waha/core/auth/casl.types';
import { PoliciesGuard } from '@waha/core/auth/policies.guard';
import { MessageLogService } from './message.log.service';

@ApiSecurity('api_key')
@Controller('api/messages/log')
@ApiTags('📜 Message Log')
@UseGuards(PoliciesGuard)
export class MessageLogController {
  constructor(private messageLogService: MessageLogService) {}

  @Get('/')
  @CheckPolicies(CanServer(Action.Read))
  @ApiQuery({ name: 'session', required: false })
  @ApiQuery({ name: 'chatId', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  @ApiOperation({ summary: 'List message log entries' })
  async list(
    @Query('session') session?: string,
    @Query('chatId') chatId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const offsetNum = offset ? parseInt(offset, 10) : 0;
    return this.messageLogService.list(session, chatId, limitNum, offsetNum);
  }

  @Get('/stats')
  @CheckPolicies(CanServer(Action.Read))
  @ApiQuery({ name: 'session', required: false })
  @ApiOperation({ summary: 'Message log statistics' })
  async stats(@Query('session') session?: string) {
    return this.messageLogService.stats(session);
  }

  @Delete('/')
  @CheckPolicies(CanServer(Action.Manage))
  @ApiQuery({ name: 'session', required: false })
  @ApiQuery({ name: 'olderThan', required: false, description: 'Unix ms timestamp — delete entries older than this' })
  @ApiOperation({ summary: 'Cleanup (delete) message log entries' })
  async cleanup(
    @Query('session') session?: string,
    @Query('olderThan') olderThan?: string,
  ) {
    const olderThanNum = olderThan ? parseInt(olderThan, 10) : undefined;
    const deleted = await this.messageLogService.cleanup(session, olderThanNum);
    return { deleted };
  }
}
