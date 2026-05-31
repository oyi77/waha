import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { PoliciesGuard } from '@waha/core/auth/policies.guard';
import { CheckPolicies } from '@waha/core/auth/policies.decorator';
import { CanServer } from '@waha/core/auth/policies';
import { Action } from '@waha/core/auth/casl.types';
import { SessionAlertingService } from './session-alerting.service';
import { SessionGroupsService } from './session-groups.service';
import { SessionAnalyticsService } from './session-analytics.service';
import { SessionCloningService } from './session-cloning.service';
import { WebhookReliabilityService } from './webhook-reliability.service';

@Controller('api/plus/sessions')
@ApiTags('🔧 Session Plus')
@UseGuards(PoliciesGuard)
export class SessionPlusController {
  constructor(
    private readonly alertingService: SessionAlertingService,
    private readonly groupsService: SessionGroupsService,
    private readonly analyticsService: SessionAnalyticsService,
    private readonly cloningService: SessionCloningService,
    private readonly webhookService: WebhookReliabilityService,
  ) {}

  @Get('/alerts')
  @CheckPolicies(CanServer(Action.Read))
  @ApiOperation({ summary: 'Get session alerts' })
  async getAlerts(
    @Query('session') session?: string,
    @Query('acknowledged') acknowledged?: string,
  ) {
    return this.alertingService.getAlerts(
      session,
      acknowledged ? acknowledged === 'true' : undefined,
    );
  }

  @Post('/alerts/:id/acknowledge')
  @CheckPolicies(CanServer(Action.Manage))
  @ApiOperation({ summary: 'Acknowledge alert' })
  async acknowledgeAlert(@Param('id') id: string) {
    return this.alertingService.acknowledgeAlert(id);
  }

  @Delete('/alerts')
  @CheckPolicies(CanServer(Action.Manage))
  @ApiOperation({ summary: 'Clear all alerts' })
  async clearAlerts() {
    return this.alertingService.clearAlerts();
  }

  @Get('/groups')
  @CheckPolicies(CanServer(Action.Read))
  @ApiOperation({ summary: 'Get session groups' })
  async getGroups() {
    return this.groupsService.getGroups();
  }

  @Post('/groups')
  @CheckPolicies(CanServer(Action.Create))
  @ApiOperation({ summary: 'Create session group' })
  async createGroup(
    @Body() body: { name: string; description?: string; metadata?: any },
  ) {
    return this.groupsService.createGroup(body.name, body.description, body.metadata);
  }

  @Get('/groups/:id')
  @CheckPolicies(CanServer(Action.Read))
  @ApiOperation({ summary: 'Get session group' })
  async getGroup(@Param('id') id: string) {
    return this.groupsService.getGroup(id);
  }

  @Put('/groups/:id')
  @CheckPolicies(CanServer(Action.Manage))
  @ApiOperation({ summary: 'Update session group' })
  async updateGroup(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; metadata?: any },
  ) {
    return this.groupsService.updateGroup(id, body);
  }

  @Delete('/groups/:id')
  @CheckPolicies(CanServer(Action.Delete))
  @ApiOperation({ summary: 'Delete session group' })
  async deleteGroup(@Param('id') id: string) {
    return this.groupsService.deleteGroup(id);
  }

  @Post('/groups/:id/sessions/:session')
  @CheckPolicies(CanServer(Action.Manage))
  @ApiOperation({ summary: 'Add session to group' })
  async addSessionToGroup(
    @Param('id') id: string,
    @Param('session') session: string,
  ) {
    return this.groupsService.addSessionToGroup(id, session);
  }

  @Delete('/groups/:id/sessions/:session')
  @CheckPolicies(CanServer(Action.Manage))
  @ApiOperation({ summary: 'Remove session from group' })
  async removeSessionFromGroup(
    @Param('id') id: string,
    @Param('session') session: string,
  ) {
    return this.groupsService.removeSessionFromGroup(id, session);
  }

  @Post('/groups/:id/start')
  @CheckPolicies(CanServer(Action.Manage))
  @ApiOperation({ summary: 'Start all sessions in group' })
  async startGroupSessions(@Param('id') id: string) {
    return this.groupsService.startGroupSessions(id);
  }

  @Post('/groups/:id/stop')
  @CheckPolicies(CanServer(Action.Manage))
  @ApiOperation({ summary: 'Stop all sessions in group' })
  async stopGroupSessions(@Param('id') id: string) {
    return this.groupsService.stopGroupSessions(id);
  }

  @Get('/analytics')
  @CheckPolicies(CanServer(Action.Read))
  @ApiOperation({ summary: 'Get session analytics' })
  async getAnalytics() {
    return this.analyticsService.getAllStats();
  }

  @Get('/analytics/summary')
  @CheckPolicies(CanServer(Action.Read))
  @ApiOperation({ summary: 'Get analytics summary' })
  async getAnalyticsSummary(
    @Query('period') period: 'day' | 'week' | 'month' = 'day',
  ) {
    return this.analyticsService.getSummary(period);
  }

  @Get('/analytics/:session')
  @CheckPolicies(CanServer(Action.Read))
  @ApiOperation({ summary: 'Get session analytics' })
  async getSessionAnalytics(@Param('session') session: string) {
    return this.analyticsService.getSessionStats(session);
  }

  @Post('/clone/:source')
  @CheckPolicies(CanServer(Action.Create))
  @ApiOperation({ summary: 'Clone session' })
  async cloneSession(
    @Param('source') source: string,
    @Body() body: { name: string; copyConfig?: boolean; copyMetadata?: boolean },
  ) {
    return this.cloningService.cloneSession(source, body);
  }

  @Get('/template/:session')
  @CheckPolicies(CanServer(Action.Read))
  @ApiOperation({ summary: 'Get session template' })
  async getSessionTemplate(@Param('session') session: string) {
    return this.cloningService.getSessionTemplate(session);
  }

  @Get('/webhooks/stats')
  @CheckPolicies(CanServer(Action.Read))
  @ApiOperation({ summary: 'Get webhook delivery stats' })
  async getWebhookStats() {
    return this.webhookService.getStats();
  }

  @Get('/webhooks/deliveries')
  @CheckPolicies(CanServer(Action.Read))
  @ApiOperation({ summary: 'Get webhook deliveries' })
  async getWebhookDeliveries(
    @Query('status') status?: 'pending' | 'delivered' | 'failed',
  ) {
    return this.webhookService.getDeliveries(status);
  }

  @Post('/webhooks/:id/retry')
  @CheckPolicies(CanServer(Action.Manage))
  @ApiOperation({ summary: 'Retry webhook delivery' })
  async retryWebhook(@Param('id') id: string) {
    return this.webhookService.retryDelivery(id);
  }
}
