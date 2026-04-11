import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
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
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { AutoReplyService } from './autoreply.service';

class CreateAutoReplyRequest {
  @ApiProperty({ description: 'Session name', example: 'default' })
  @IsString()
  session: string;

  @ApiProperty({ description: 'Keyword to match', example: 'hello' })
  @IsString()
  keyword: string;

  @ApiProperty({
    description: 'Match strategy',
    enum: ['contains', 'exact', 'startsWith', 'regex'],
    required: false,
    default: 'contains',
  })
  @IsOptional()
  @IsString()
  @IsIn(['contains', 'exact', 'startsWith', 'regex'])
  matchType?: string;

  @ApiProperty({ description: 'Reply text to send', example: 'Hi there!' })
  @IsString()
  replyText: string;

  @ApiProperty({ description: 'Whether the rule is active', required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class UpdateAutoReplyRequest {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiProperty({
    required: false,
    enum: ['contains', 'exact', 'startsWith', 'regex'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['contains', 'exact', 'startsWith', 'regex'])
  matchType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  replyText?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class TestAutoReplyRequest {
  @ApiProperty({ description: 'Session name', example: 'default' })
  @IsString()
  session: string;

  @ApiProperty({ description: 'Incoming message text to test', example: 'hello world' })
  @IsString()
  text: string;
}

@ApiSecurity('api_key')
@Controller('api/autoreply')
@ApiTags('🤖 Auto-Reply')
@UseGuards(PoliciesGuard)
export class AutoReplyController {
  constructor(private autoReplyService: AutoReplyService) {}

  @Post('/')
  @HttpCode(201)
  @CheckPolicies(CanServer(Action.Manage))
  @UsePipes(new WAHAValidationPipe())
  @ApiOperation({ summary: 'Create an auto-reply rule' })
  async create(@Body() dto: CreateAutoReplyRequest) {
    return this.autoReplyService.create(dto);
  }

  @Get('/')
  @CheckPolicies(CanServer(Action.Manage))
  @ApiQuery({ name: 'session', required: false, description: 'Filter by session' })
  @ApiOperation({ summary: 'List auto-reply rules' })
  async list(@Query('session') session?: string) {
    return this.autoReplyService.list(session);
  }

  @Put('/:id')
  @HttpCode(200)
  @CheckPolicies(CanServer(Action.Manage))
  @UsePipes(new WAHAValidationPipe())
  @ApiOperation({ summary: 'Update an auto-reply rule' })
  async update(@Param('id') id: string, @Body() dto: UpdateAutoReplyRequest) {
    const existing = await this.autoReplyService.get(id);
    if (!existing) throw new NotFoundException(`Auto-reply rule ${id} not found`);
    return this.autoReplyService.update(id, dto);
  }

  @Delete('/:id')
  @HttpCode(200)
  @CheckPolicies(CanServer(Action.Manage))
  @ApiOperation({ summary: 'Delete an auto-reply rule' })
  async remove(@Param('id') id: string) {
    const existing = await this.autoReplyService.get(id);
    if (!existing) throw new NotFoundException(`Auto-reply rule ${id} not found`);
    await this.autoReplyService.delete(id);
    return { id, deleted: true };
  }

  @Post('/test')
  @HttpCode(200)
  @CheckPolicies(CanServer(Action.Manage))
  @UsePipes(new WAHAValidationPipe())
  @ApiOperation({ summary: 'Test which auto-reply rules match a message' })
  async test(@Body() dto: TestAutoReplyRequest) {
    const matchingRules = await this.autoReplyService.getMatchingRules(dto.session, dto.text);
    return {
      session: dto.session,
      text: dto.text,
      matchCount: matchingRules.length,
      matchingRules,
    };
  }
}
