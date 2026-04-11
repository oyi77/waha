/**
 * WAHA Plus — Per-Session Engine Switch Controller
 *
 * POST /api/sessions/:name/switch-engine
 *   Stop the session and restart it with a different WhatsApp engine.
 *
 * GET  /api/sessions/:name/engine
 *   Get the current engine for a session.
 *
 * GET  /api/engines
 *   List all available engines with capabilities.
 */
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiProperty,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { SessionManager } from '@waha/core/abc/manager.abc';
import { Action } from '@waha/core/auth/casl.types';
import { CanServer } from '@waha/core/auth/policies';
import { CheckPolicies } from '@waha/core/auth/policies.decorator';
import { PoliciesGuard } from '@waha/core/auth/policies.guard';
import { WAHAValidationPipe } from '@waha/nestjs/pipes/WAHAValidationPipe';
import { WAHAEngine } from '@waha/structures/enums.dto';
import { IsEnum } from 'class-validator';

class SwitchEngineRequest {
  @ApiProperty({
    description: 'Target engine',
    enum: WAHAEngine,
    example: WAHAEngine.NOWEB,
  })
  @IsEnum(WAHAEngine)
  engine: WAHAEngine;
}

class SwitchEngineResponse {
  @ApiProperty()
  session: string;

  @ApiProperty({ enum: WAHAEngine })
  engine: WAHAEngine;

  @ApiProperty()
  message: string;
}

class EngineCapability {
  @ApiProperty({ enum: WAHAEngine })
  name: WAHAEngine;

  @ApiProperty()
  description: string;

  @ApiProperty()
  library: string;

  @ApiProperty()
  requiresBrowser: boolean;

  @ApiProperty({ type: [String] })
  pros: string[];

  @ApiProperty({ type: [String] })
  cons: string[];

  @ApiProperty()
  recommended: boolean;
}

const ENGINE_CAPABILITIES: EngineCapability[] = [
  {
    name: WAHAEngine.NOWEB,
    description:
      'Pure Node.js engine using Baileys — no browser required. Best for servers.',
    library: '@adiwajshing/baileys (WAHA fork)',
    requiresBrowser: false,
    pros: [
      'No Chromium — very low memory usage (~50MB)',
      'Fast startup',
      'Stable and production-ready',
      'Full media support',
      'Channels, Groups, Labels, Calls',
    ],
    cons: ['May need re-auth after WhatsApp protocol changes'],
    recommended: true,
  },
  {
    name: WAHAEngine.WEBJS,
    description:
      'whatsapp-web.js engine with Chromium browser. Maximum compatibility.',
    library: 'whatsapp-web.js (WAHA fork)',
    requiresBrowser: true,
    pros: [
      'Highest feature coverage',
      'Well-tested in production',
      'Large community',
    ],
    cons: [
      'Requires Chromium (~300MB overhead)',
      'Slower startup',
      'Higher memory usage',
    ],
    recommended: false,
  },
  {
    name: WAHAEngine.WPP,
    description:
      'WPPConnect engine with Chromium browser. Alternative browser-based implementation.',
    library: '@wppconnect/wppconnect',
    requiresBrowser: true,
    pros: [
      'Some unique API features',
      'Active development',
      'Business API support',
    ],
    cons: [
      'Requires Chromium (~300MB overhead)',
      'Slightly less community testing than WEBJS',
    ],
    recommended: false,
  },
  {
    name: WAHAEngine.GOWS,
    description:
      'Experimental Go/Rust-based engine. Fastest but limited features.',
    library: 'whatsapp-rust-bridge',
    requiresBrowser: false,
    pros: [
      'Lowest memory usage',
      'Fastest message throughput',
      'No Node.js WhatsApp libraries',
    ],
    cons: [
      'Beta — some features missing',
      'No Channels',
      'No Calls',
      'Limited media support',
    ],
    recommended: false,
  },
];

@ApiSecurity('api_key')
@Controller('api')
@ApiTags('⚙️ Engines')
@UseGuards(PoliciesGuard)
export class EngineSwitchController {
  constructor(private manager: SessionManager) {}

  @Get('/engines')
  @CheckPolicies(CanServer(Action.Read))
  @ApiOperation({
    summary: 'List all available WhatsApp engines with capabilities',
    description:
      'Returns details for each engine: library, browser requirement, pros/cons, and recommendation.',
  })
  listEngines(): EngineCapability[] {
    return ENGINE_CAPABILITIES;
  }

  @Get('/sessions/:name/engine')
  @CheckPolicies(CanServer(Action.Read))
  @ApiOperation({ summary: 'Get the current engine for a session' })
  async getSessionEngine(
    @Param('name') name: string,
  ): Promise<{ session: string; engine: string }> {
    const sessions = await this.manager.getSessions(true);
    const session = sessions.find((s) => s.name === name);
    if (!session) {
      throw new NotFoundException(`Session not found: ${name}`);
    }
    const engine = (session.config as any)?.engine ?? process.env.WHATSAPP_DEFAULT_ENGINE ?? WAHAEngine.NOWEB;
    return { session: name, engine };
  }

  @Post('/sessions/:name/switch-engine')
  @CheckPolicies(CanServer(Action.Manage))
  @UsePipes(new WAHAValidationPipe())
  @ApiOperation({
    summary: 'Switch WhatsApp engine for a session',
    description:
      'Stops the session, updates its engine, and restarts it. ' +
      'The session will need to re-authenticate (scan QR) unless auth data is compatible between engines.',
  })
  async switchEngine(
    @Param('name') name: string,
    @Body() body: SwitchEngineRequest,
  ): Promise<SwitchEngineResponse> {
    // Stop the session if it's running
    const sessions = await this.manager.getSessions(true);
    const session = sessions.find((s) => s.name === name);
    const oldEngine = (session?.config as any)?.engine;

    try {
      await this.manager.stop(name, true);
    } catch {
      // ignore if not running
    }

    // Save new engine in config, then start with rollback on failure
    try {
      await this.manager.upsert(name, { engine: body.engine } as any);
      await this.manager.start(name);
    } catch (err) {
      try {
        await this.manager.upsert(name, { engine: oldEngine } as any);
      } catch {
        // ignore rollback errors
      }
      throw err;
    }

    return {
      session: name,
      engine: body.engine,
      message: `Session "${name}" restarted with engine ${body.engine}. Scan QR code to re-authenticate if needed.`,
    };
  }
}
