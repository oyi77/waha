import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CheckPolicies } from '@waha/core/auth/policies.decorator';
import { CanServer } from '@waha/core/auth/policies';
import { Action } from '@waha/core/auth/casl.types';
import { PoliciesGuard } from '@waha/core/auth/policies.guard';
import { AnalyticsService } from './analytics.service';

@ApiSecurity('api_key')
@Controller('api/analytics')
@ApiTags('📊 Analytics')
@UseGuards(PoliciesGuard)
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('/daily')
  @CheckPolicies(CanServer(Action.Read))
  @ApiQuery({ name: 'session', required: false })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days to look back (default 30)' })
  @ApiOperation({ summary: 'Daily analytics breakdown' })
  async daily(
    @Query('session') session?: string,
    @Query('days') days?: string,
  ) {
    const daysNum = days ? parseInt(days, 10) : 30;
    return this.analyticsService.getDailyStats(session, daysNum);
  }

  @Get('/summary')
  @CheckPolicies(CanServer(Action.Read))
  @ApiQuery({ name: 'session', required: false })
  @ApiOperation({ summary: 'Total analytics counts' })
  async summary(@Query('session') session?: string) {
    return this.analyticsService.getSummary(session);
  }
}
