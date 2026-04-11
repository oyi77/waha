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
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiProperty,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { CheckPolicies } from '@waha/core/auth/policies.decorator';
import { CanServer } from '@waha/core/auth/policies';
import { Action } from '@waha/core/auth/casl.types';
import { PoliciesGuard } from '@waha/core/auth/policies.guard';
import { WAHAValidationPipe } from '@waha/nestjs/pipes/WAHAValidationPipe';
import { SessionManager } from '@waha/core/abc/manager.abc';
import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { TemplatesService } from './templates.service';

class CreateTemplateRequest {
  @ApiProperty({ description: 'Unique template name', example: 'welcome-message' })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Message type',
    enum: ['text', 'image', 'file', 'video', 'voice'],
  })
  @IsString()
  @IsIn(['text', 'image', 'file', 'video', 'voice'])
  type: string;

  @ApiProperty({
    description: 'Template payload',
    example: { text: 'Hello {{name}}!' },
  })
  @IsObject()
  payload: Record<string, any>;

  @ApiProperty({
    description: 'Tags for categorization',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

class UpdateTemplateRequest {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false, enum: ['text', 'image', 'file', 'video', 'voice'] })
  @IsOptional()
  @IsString()
  @IsIn(['text', 'image', 'file', 'video', 'voice'])
  type?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

class SendTemplateRequest {
  @ApiProperty({ description: 'Session name', example: 'default' })
  @IsString()
  session: string;

  @ApiProperty({ description: 'Target chatId', example: '11111111111@c.us' })
  @IsString()
  chatId: string;
}

@ApiSecurity('api_key')
@Controller('api/templates')
@ApiTags('📋 Templates')
@UseGuards(PoliciesGuard)
export class TemplatesController {
  constructor(
    private templatesService: TemplatesService,
    private manager: SessionManager,
  ) {}

  @Post('/')
  @HttpCode(201)
  @CheckPolicies(CanServer(Action.Manage))
  @UsePipes(new WAHAValidationPipe())
  @ApiOperation({ summary: 'Create a new message template' })
  async create(@Body() dto: CreateTemplateRequest) {
    return this.templatesService.create(dto);
  }

  @Get('/')
  @CheckPolicies(CanServer(Action.Manage))
  @ApiOperation({ summary: 'List all templates' })
  async list() {
    return this.templatesService.list();
  }

  @Get('/:id')
  @CheckPolicies(CanServer(Action.Manage))
  @ApiOperation({ summary: 'Get a template by ID' })
  async getOne(@Param('id') id: string) {
    const tmpl = await this.templatesService.get(id);
    if (!tmpl) throw new NotFoundException(`Template ${id} not found`);
    return tmpl;
  }

  @Put('/:id')
  @HttpCode(200)
  @CheckPolicies(CanServer(Action.Manage))
  @UsePipes(new WAHAValidationPipe())
  @ApiOperation({ summary: 'Update a template' })
  async update(@Param('id') id: string, @Body() dto: UpdateTemplateRequest) {
    const existing = await this.templatesService.get(id);
    if (!existing) throw new NotFoundException(`Template ${id} not found`);
    return this.templatesService.update(id, dto);
  }

  @Delete('/:id')
  @HttpCode(200)
  @CheckPolicies(CanServer(Action.Manage))
  @ApiOperation({ summary: 'Delete a template' })
  async remove(@Param('id') id: string) {
    const existing = await this.templatesService.get(id);
    if (!existing) throw new NotFoundException(`Template ${id} not found`);
    await this.templatesService.delete(id);
    return { id, deleted: true };
  }

  @Post('/:id/send')
  @HttpCode(200)
  @CheckPolicies(CanServer(Action.Manage))
  @UsePipes(new WAHAValidationPipe())
  @ApiOperation({ summary: 'Send a template to a chatId' })
  async send(@Param('id') id: string, @Body() dto: SendTemplateRequest) {
    const tmpl = await this.templatesService.get(id);
    if (!tmpl) throw new NotFoundException(`Template ${id} not found`);

    const whatsapp = await this.manager.getWorkingSession(dto.session);
    const req: any = { chatId: dto.chatId, session: dto.session, ...tmpl.payload };

    switch (tmpl.type) {
      case 'text':
        await whatsapp.sendText(req);
        break;
      case 'image':
        await whatsapp.sendImage(req);
        break;
      case 'file':
        await whatsapp.sendFile(req);
        break;
      case 'video':
        await whatsapp.sendVideo(req);
        break;
      case 'voice':
        await whatsapp.sendVoice(req);
        break;
      default:
        throw new NotFoundException(`Unknown template type: ${tmpl.type}`);
    }

    return { templateId: id, session: dto.session, chatId: dto.chatId, sent: true };
  }
}
