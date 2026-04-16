import {
  BeforeApplicationShutdown,
  Injectable,
  Logger,
  LoggerService,
  OnModuleInit,
} from '@nestjs/common';
import { SessionManager } from '@waha/core/abc/manager.abc';
import { WAHAEngine, WAHASessionStatus } from '@waha/structures/enums.dto';
import { WhatsappSessionWPPCore } from '@waha/core/engines/wpp/session.wpp.core';
import { CallAudioBridge } from '@waha/core/engines/wpp/call-audio/CallAudioBridge';
import { WebSocketAuth } from '@waha/core/auth/WebSocketAuth';
import { WebSocket } from '@waha/nestjs/ws/ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import { WebSocketServer } from 'ws';

//
// WebSocket audio streaming gateway for voice calls.
//
// WS path: /ws/calls/audio?session=<name>&callId=<id>&x-api-key=<key>
// Protocol: base64 text frames
//   Client → Server: outgoing audio (PCM signed 16-bit LE 16kHz mono, base64)
//   Server → Client: incoming audio (webm/opus chunks, base64)
//
const AUDIO_WS_PATH = '/ws/calls/audio';

@Injectable()
export class CallAudioGateway
  implements OnModuleInit, BeforeApplicationShutdown
{
  private readonly logger: LoggerService;
  private wss: WebSocketServer | null = null;

  constructor(
    private readonly manager: SessionManager,
    private readonly auth: WebSocketAuth,
  ) {
    this.logger = new Logger('CallAudioGateway');
  }

  onModuleInit() {
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on('connection', this.handleConnection.bind(this));
    this.logger.log(`Audio WS server ready on upgrade path ${AUDIO_WS_PATH}`);
  }

  handleUpgrade(request: IncomingMessage, socket: any, head: Buffer): boolean {
    const url = new URL(request.url || '/', 'http://localhost');
    if (url.pathname !== AUDIO_WS_PATH) {
      return false;
    }
    if (!this.wss) {
      return false;
    }
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss!.emit('connection', ws, request);
    });
    return true;
  }

  private async handleConnection(ws: WebSocket, request: IncomingMessage) {
    const url = new URL(request.url || '/', 'http://localhost');
    const sessionName = url.searchParams.get('session');
    const callId = url.searchParams.get('callId');

    const user = await this.auth.validateRequest(request);
    if (!user) {
      ws.close(4003, 'Unauthorized');
      this.logger.warn('Unauthorized audio WS connection attempt');
      return;
    }

    if (!sessionName || !callId) {
      ws.close(4001, 'Missing session or callId query parameter');
      return;
    }

    const session = this.manager.getSession(sessionName);
    if (!session) {
      ws.close(4004, `Session '${sessionName}' not found`);
      return;
    }
    if (session.status !== WAHASessionStatus.WORKING) {
      ws.close(4009, `Session '${sessionName}' is not in WORKING state`);
      return;
    }
    if (session.engine !== WAHAEngine.WPP) {
      ws.close(4010, 'Voice calls require the WPP engine');
      return;
    }

    const wppSession = session as WhatsappSessionWPPCore;
    const audioBridge = wppSession.audioBridge;
    if (!audioBridge) {
      ws.close(4011, 'Audio bridge not initialized');
      return;
    }

    const activeCallId = audioBridge.getActiveCallId();
    if (activeCallId !== callId) {
      ws.close(4004, `Call '${callId}' not found or not active`);
      return;
    }

    this.bindAudioBridge(ws, audioBridge, callId, sessionName);
  }

  private bindAudioBridge(
    ws: WebSocket,
    audioBridge: CallAudioBridge,
    callId: string,
    sessionName: string,
  ): void {
    this.logger.log(
      { callId: callId, session: sessionName },
      'Audio WS connected',
    );

    const onChunk = (id: string, base64Chunk: string) => {
      if (id !== callId) {
        return;
      }
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(base64Chunk);
      }
    };

    audioBridge.on('chunk', onChunk);

    ws.on('message', (data: Buffer) => {
      if (!audioBridge.getActiveCallId()) {
        ws.close(1001, 'Call ended');
        return;
      }
      const base64Data = data.toString('utf-8');
      audioBridge.feedAudio(base64Data).catch((error) => {
        this.logger.warn(
          { error: error, callId: callId },
          'Failed to feed audio to bridge',
        );
      });
    });

    ws.on('close', () => {
      audioBridge.off('chunk', onChunk);
      this.logger.log(
        { callId: callId, session: sessionName },
        'Audio WS disconnected',
      );
    });

    ws.on('error', (error: Error) => {
      this.logger.error({ error: error, callId: callId }, 'Audio WS error');
    });
  }

  async beforeApplicationShutdown() {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}
