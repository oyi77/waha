import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiProperty,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { CheckPolicies } from '@waha/core/auth/policies.decorator';
import { CanServer } from '@waha/core/auth/policies';
import { Action } from '@waha/core/auth/casl.types';
import { PoliciesGuard } from '@waha/core/auth/policies.guard';
import { WAHAValidationPipe } from '@waha/nestjs/pipes/WAHAValidationPipe';
import {
  IsIn,
  IsObject,
  IsString,
} from 'class-validator';
import { ScheduleService } from './schedule.service';

class ScheduleRequest {
  @ApiProperty({ description: 'Session name', example: 'default' })
  @IsString()
  session: string;

  @ApiProperty({ description: 'Target chatId', example: '11111111111@c.us' })
  @IsString()
  chatId: string;

  @ApiProperty({
    description: 'Message type',
    enum: ['text', 'image', 'file', 'video', 'voice'],
  })
  @IsString()
  @IsIn(['text', 'image', 'file', 'video', 'voice'])
  type: string;

  @ApiProperty({
    description: 'Message payload (text, caption, url, base64, file, etc.)',
    example: { text: 'Hello!' },
  })
  @IsObject()
  payload: Record<string, any>;

  @ApiProperty({
    description: 'ISO 8601 datetime when to send',
    example: '2026-04-12T09:00:00.000Z',
  })
  @IsString()
  scheduledAt: string;
}

@ApiSecurity('api_key')
@Controller('api/schedule')
@ApiTags('⏰ Scheduling')
@UseGuards(PoliciesGuard)
export class ScheduleController {
  constructor(private scheduleService: ScheduleService) {}

  @Post('/')
  @HttpCode(201)
  @CheckPolicies(CanServer(Action.Manage))
  @UsePipes(new WAHAValidationPipe())
  @ApiOperation({ summary: 'Schedule a message for future delivery' })
  async create(@Body() dto: ScheduleRequest) {
    return this.scheduleService.create(dto);
  }

  @Get('/')
  @CheckPolicies(CanServer(Action.Manage))
  @ApiQuery({ name: 'session', required: false, description: 'Filter by session' })
  @ApiOperation({ summary: 'List scheduled messages' })
  async list(@Query('session') session?: string) {
    return this.scheduleService.list(session);
  }

  @Get('/:id')
  @CheckPolicies(CanServer(Action.Manage))
  @ApiOperation({ summary: 'Get a single scheduled message' })
  async getOne(@Param('id') id: string) {
    const msg = await this.scheduleService.get(id);
    if (!msg) throw new NotFoundException(`Scheduled message ${id} not found`);
    return msg;
  }

  @Delete('/:id')
  @HttpCode(200)
  @CheckPolicies(CanServer(Action.Manage))
  @ApiOperation({ summary: 'Cancel a scheduled message' })
  async cancel(@Param('id') id: string) {
    const msg = await this.scheduleService.get(id);
    if (!msg) throw new NotFoundException(`Scheduled message ${id} not found`);
    await this.scheduleService.cancel(id);
    return { id, status: 'cancelled' };
  }
}
