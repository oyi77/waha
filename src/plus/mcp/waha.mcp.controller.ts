import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiSecurity } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SessionManager } from '@waha/core/abc/manager.abc';
import { PoliciesGuard } from '@waha/core/auth/policies.guard';
import { CheckPolicies } from '@waha/core/auth/policies.decorator';
import { CanServer } from '@waha/core/auth/policies';
import { Action } from '@waha/core/auth/casl.types';

const TOOLS = [
  {
    name: 'waha_send_text',
    description: 'Send a text message via WhatsApp',
    inputSchema: {
      type: 'object',
      properties: {
        session: { type: 'string', description: 'Session name (e.g. "default")' },
        chatId: { type: 'string', description: 'Chat ID (e.g. "15551234567@c.us")' },
        text: { type: 'string', description: 'Text message to send' },
      },
      required: ['session', 'chatId', 'text'],
    },
  },
  {
    name: 'waha_send_image',
    description: 'Send an image by URL via WhatsApp',
    inputSchema: {
      type: 'object',
      properties: {
        session: { type: 'string', description: 'Session name' },
        chatId: { type: 'string', description: 'Chat ID' },
        url: { type: 'string', description: 'Image URL' },
        caption: { type: 'string', description: 'Optional image caption' },
      },
      required: ['session', 'chatId', 'url'],
    },
  },
  {
    name: 'waha_send_file',
    description: 'Send a file by URL via WhatsApp',
    inputSchema: {
      type: 'object',
      properties: {
        session: { type: 'string', description: 'Session name' },
        chatId: { type: 'string', description: 'Chat ID' },
        url: { type: 'string', description: 'File URL' },
        caption: { type: 'string', description: 'Optional file caption' },
      },
      required: ['session', 'chatId', 'url'],
    },
  },
  {
    name: 'waha_list_sessions',
    description: 'List all WAHA sessions and their status',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'waha_start_session',
    description: 'Start a WAHA session',
    inputSchema: {
      type: 'object',
      properties: {
        session: { type: 'string', description: 'Session name to start' },
        engine: {
          type: 'string',
          description: 'Engine to use: NOWEB, WEBJS, WPP, GOWS',
          enum: ['NOWEB', 'WEBJS', 'WPP', 'GOWS'],
        },
      },
      required: ['session'],
    },
  },
  {
    name: 'waha_stop_session',
    description: 'Stop a WAHA session',
    inputSchema: {
      type: 'object',
      properties: {
        session: { type: 'string', description: 'Session name to stop' },
      },
      required: ['session'],
    },
  },
  {
    name: 'waha_get_session_qr',
    description: 'Get QR code for a session (base64 PNG) to authenticate WhatsApp',
    inputSchema: {
      type: 'object',
      properties: {
        session: { type: 'string', description: 'Session name' },
      },
      required: ['session'],
    },
  },
  {
    name: 'waha_get_chats',
    description: 'Get recent chats for a session',
    inputSchema: {
      type: 'object',
      properties: {
        session: { type: 'string', description: 'Session name' },
        limit: { type: 'number', description: 'Max chats to return (default 20)' },
      },
      required: ['session'],
    },
  },
  {
    name: 'waha_get_messages',
    description: 'Get messages from a chat',
    inputSchema: {
      type: 'object',
      properties: {
        session: { type: 'string', description: 'Session name' },
        chatId: { type: 'string', description: 'Chat ID' },
        limit: { type: 'number', description: 'Max messages to return (default 20)' },
      },
      required: ['session', 'chatId'],
    },
  },
  {
    name: 'waha_check_number',
    description: 'Check if a phone number is registered on WhatsApp',
    inputSchema: {
      type: 'object',
      properties: {
        session: { type: 'string', description: 'Session name' },
        phone: { type: 'string', description: 'Phone number with country code (e.g. "15551234567")' },
      },
      required: ['session', 'phone'],
    },
  },
  {
    name: 'waha_create_schedule',
    description: 'Schedule a text message to be sent at a future time',
    inputSchema: {
      type: 'object',
      properties: {
        session: { type: 'string', description: 'Session name' },
        chatId: { type: 'string', description: 'Chat ID' },
        text: { type: 'string', description: 'Message text' },
        scheduledAt: { type: 'string', description: 'ISO8601 datetime (e.g. "2026-04-12T09:00:00Z")' },
      },
      required: ['session', 'chatId', 'text', 'scheduledAt'],
    },
  },
  {
    name: 'waha_send_from_template',
    description: 'Send a saved template by name to a chat',
    inputSchema: {
      type: 'object',
      properties: {
        session: { type: 'string', description: 'Session name' },
        chatId: { type: 'string', description: 'Chat ID' },
        templateName: { type: 'string', description: 'Template name' },
      },
      required: ['session', 'chatId', 'templateName'],
    },
  },
  {
    name: 'waha_broadcast_text',
    description: 'Broadcast a text message to multiple recipients',
    inputSchema: {
      type: 'object',
      properties: {
        session: { type: 'string', description: 'Session name' },
        chatIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of chat IDs to send to',
        },
        text: { type: 'string', description: 'Text message to broadcast' },
      },
      required: ['session', 'chatIds', 'text'],
    },
  },
  {
    name: 'waha_get_groups',
    description: 'List WhatsApp groups the session has joined',
    inputSchema: {
      type: 'object',
      properties: {
        session: { type: 'string', description: 'Session name' },
      },
      required: ['session'],
    },
  },
  {
    name: 'waha_get_contacts',
    description: 'Get contacts for a session',
    inputSchema: {
      type: 'object',
      properties: {
        session: { type: 'string', description: 'Session name' },
      },
      required: ['session'],
    },
  },
];

@ApiSecurity('api_key')
@Controller('api')
@ApiTags('🤖 MCP Server')
@UseGuards(PoliciesGuard)
export class WahaMcpController {
  // Shared MCP server + transport (stateless per-request)
  private _mcpServer: Server | null = null;

  constructor(private manager: SessionManager) {}

  private createMcpServer(): Server {
    const server = new Server(
      { name: 'waha-mcp', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOLS,
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      try {
        const result = await this.executeTool(name, args ?? {});
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Error: ${err?.message ?? String(err)}` }],
          isError: true,
        };
      }
    });

    return server;
  }

  private async executeTool(name: string, args: Record<string, any>): Promise<any> {
    switch (name) {
      case 'waha_send_text': {
        const { session, chatId, text } = args;
        const whatsapp = await this.manager.getWorkingSession(session);
        return whatsapp.sendText({ chatId, text, session });
      }

      case 'waha_send_image': {
        const { session, chatId, url, caption } = args;
        const whatsapp = await this.manager.getWorkingSession(session);
        return whatsapp.sendImage({ chatId, session, caption, file: { url } } as any);
      }

      case 'waha_send_file': {
        const { session, chatId, url, caption } = args;
        const whatsapp = await this.manager.getWorkingSession(session);
        return whatsapp.sendFile({ chatId, session, caption, file: { url } } as any);
      }

      case 'waha_list_sessions': {
        const sessions = await this.manager.getSessions(true);
        return sessions.map((s) => ({
          name: s.name,
          status: s.status,
          engine: (s as any).engine ?? 'unknown',
        }));
      }

      case 'waha_start_session': {
        const { session, engine } = args;
        return this.manager.start(session);
      }

      case 'waha_stop_session': {
        const { session } = args;
        await this.manager.stop(session, false);
        return { session, status: 'stopped' };
      }

      case 'waha_get_session_qr': {
        const { session } = args;
        const host = process.env.WAHA_PUBLIC_URL ?? 'http://localhost:3000';
        return { qrUrl: `${host}/api/${session}/auth/qr` };
      }

      case 'waha_get_chats': {
        const { session, limit = 20 } = args;
        const whatsapp = await this.manager.getWorkingSession(session);
        return whatsapp.getChats({ limit, offset: 0 });
      }

      case 'waha_get_messages': {
        const { session, chatId, limit = 20 } = args;
        const whatsapp = await this.manager.getWorkingSession(session);
        return whatsapp.getChatMessages(
          chatId,
          { limit, offset: 0, downloadMedia: false } as any,
          {} as any,
        );
      }

      case 'waha_check_number': {
        const { session, phone } = args;
        const whatsapp = await this.manager.getWorkingSession(session);
        const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
        return whatsapp.checkNumberStatus({ chatId, session } as any);
      }

      case 'waha_create_schedule': {
        const { session, chatId, text, scheduledAt } = args;
        // POST to schedule endpoint via internal fetch
        const host = process.env.WAHA_PUBLIC_URL ?? 'http://localhost:3000';
        const response = await fetch(`${host}/api/schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session, chatId, type: 'text', payload: { text }, scheduledAt }),
        });
        return response.json();
      }

      case 'waha_send_from_template': {
        const { session, chatId, templateName } = args;
        const host = process.env.WAHA_PUBLIC_URL ?? 'http://localhost:3000';
        const response = await fetch(`${host}/api/templates/${encodeURIComponent(templateName)}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session, chatId }),
        });
        return response.json();
      }

      case 'waha_broadcast_text': {
        const { session, chatIds, text } = args;
        const whatsapp = await this.manager.getWorkingSession(session);
        const sent: string[] = [];
        const failed: { chatId: string; error: string }[] = [];
        for (const chatId of chatIds) {
          try {
            await whatsapp.sendText({ chatId, text, session });
            sent.push(chatId);
          } catch (err: any) {
            failed.push({ chatId, error: err?.message ?? String(err) });
          }
        }
        return { sent, failed };
      }

      case 'waha_get_groups': {
        const { session } = args;
        const whatsapp = await this.manager.getWorkingSession(session);
        return whatsapp.getGroups({ limit: 100, offset: 0 });
      }

      case 'waha_get_contacts': {
        const { session } = args;
        const whatsapp = await this.manager.getWorkingSession(session);
        return whatsapp.getContacts({ limit: 100, offset: 0 });
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private getMcpServer(): Server {
    if (!this._mcpServer) {
      this._mcpServer = this.createMcpServer();
    }
    return this._mcpServer;
  }

  @All('/mcp')
  @CheckPolicies(CanServer(Action.Read))
  @ApiOperation({
    summary: 'MCP endpoint — connect AI assistants to WAHA via Streamable HTTP',
    description:
      'Streamable HTTP endpoint for the Model Context Protocol. ' +
      'Connect Claude Desktop, Claude Code, or any MCP-compatible client here. ' +
      'Both GET (SSE stream) and POST (JSON-RPC) are handled on this single endpoint.',
  })
  async mcpHandler(@Req() req: Request, @Res() res: Response) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () =>
        `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });
    const server = this.getMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req as any, res as any, req.body);
  }
}
