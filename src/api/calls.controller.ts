import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import {
  SessionApiParam,
  WorkingSessionParam,
} from '@waha/nestjs/params/SessionApiParam';

import { SessionManager } from '../core/abc/manager.abc';
import { WhatsappSession } from '../core/abc/session.abc';
import {
  AcceptCallRequest,
  CallData,
  OfferCallRequest,
  RejectCallRequest,
  TerminateCallRequest,
} from '../structures/calls.dto';
import { PoliciesGuard } from '@waha/core/auth/policies.guard';
import { CheckPolicies } from '@waha/core/auth/policies.decorator';
import { CanSession, FromParam } from '@waha/core/auth/policies';

import { Action } from '@waha/core/auth/casl.types';

@ApiSecurity('api_key')
@Controller('api/:session/calls')
@ApiTags('📞 Calls')
@UseGuards(PoliciesGuard)
@CheckPolicies(CanSession(Action.Use, FromParam('session')))
export class CallsController {
  constructor(private manager: SessionManager) {}

  @Post('offer')
  @SessionApiParam
  @ApiOperation({ summary: 'Initiate a voice or video call' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  offerCall(
    @WorkingSessionParam session: WhatsappSession,
    @Body() request: OfferCallRequest,
  ): Promise<CallData> {
    return session.offerCall(request.chatId, request.isVideo ?? false);
  }

  @Post('accept')
  @SessionApiParam
  @ApiOperation({ summary: 'Accept an incoming call' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  acceptCall(
    @WorkingSessionParam session: WhatsappSession,
    @Body() request: AcceptCallRequest,
  ): Promise<void> {
    return session.acceptCall(request.id);
  }

  @Post('reject')
  @SessionApiParam
  @ApiOperation({ summary: 'Reject incoming call' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  rejectCall(
    @WorkingSessionParam session: WhatsappSession,
    @Body() request: RejectCallRequest,
  ) {
    return session.rejectCall(request.from, request.id);
  }

  @Post('terminate')
  @SessionApiParam
  @ApiOperation({ summary: 'Terminate an active call' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  terminateCall(
    @WorkingSessionParam session: WhatsappSession,
    @Body() request: TerminateCallRequest,
  ): Promise<void> {
    return session.terminateCall(request.id);
  }

  @Get()
  @SessionApiParam
  @ApiOperation({ summary: 'Get active calls' })
  getActiveCalls(@WorkingSessionParam session: WhatsappSession): CallData[] {
    return session.getActiveCalls();
  }

  @Get(':callId')
  @SessionApiParam
  @ApiOperation({ summary: 'Get call state' })
  getCall(
    @WorkingSessionParam session: WhatsappSession,
    @Param('callId') callId: string,
  ): CallData {
    return session.getCall(callId);
  }
}
