import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { PoliciesGuard } from '@waha/core/auth/policies.guard';
import { CheckPolicies } from '@waha/core/auth/policies.decorator';
import { CanServer } from '@waha/core/auth/policies';
import { Action } from '@waha/core/auth/casl.types';

import { SettingsService } from './settings.service';

class SessionLifecycleDto {
  autoRestartOnBoot: boolean;
  autoRestartFailed: boolean;
  restartAllSessions: boolean;
  autoStartDelay: number;
}

@ApiSecurity('api_key')
@Controller('api/settings/sessions')
@ApiTags('⚙️ Session Settings')
@UseGuards(PoliciesGuard)
export class SessionLifecycleController {
  constructor(private settingsService: SettingsService) {}

  @Get()
  @CheckPolicies(CanServer(Action.Read))
  @ApiOperation({
    summary: 'Get session lifecycle settings',
    description:
      'Returns auto-restart, auto-recovery, and startup delay settings for sessions.',
  })
  async get(): Promise<SessionLifecycleDto> {
    return this.settingsService.getSessionLifecycleSettings();
  }

  @Put()
  @CheckPolicies(CanServer(Action.Use))
  @ApiOperation({
    summary: 'Update session lifecycle settings',
    description:
      'Changes auto-restart, auto-recovery, and startup delay settings. ' +
      'Changes apply immediately — no restart required.',
  })
  async save(
    @Body() body: Partial<SessionLifecycleDto>,
  ): Promise<SessionLifecycleDto> {
    await this.settingsService.saveSessionLifecycleSettings(body);
    return this.settingsService.getSessionLifecycleSettings();
  }
}
