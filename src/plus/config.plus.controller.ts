import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  ApiOperation,
  ApiProperty,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { PoliciesGuard } from '../core/auth/policies.guard';
import { CheckPolicies } from '../core/auth/policies.decorator';
import { CanServer } from '../core/auth/policies';
import { Action } from '../core/auth/casl.types';

const CONFIG_FILE = path.join(process.cwd(), 'waha-config.json');
const SYNC_SCRIPT = path.join(process.cwd(), 'scripts/update-from-upstream.sh');

const ALLOWED_STORAGE_KEYS = [
  'WAHA_MEDIA_STORAGE',
  'WAHA_MEDIA_S3_BUCKET',
  'WAHA_MEDIA_S3_REGION',
  'WAHA_MEDIA_S3_ENDPOINT',
  'WAHA_MEDIA_S3_ACCESS_KEY',
  'WAHA_MEDIA_S3_SECRET_KEY',
  'WAHA_MEDIA_PG_URL',
];

function readConfigFile(): Record<string, string> {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

class StorageConfigBody {
  @ApiProperty({ enum: ['LOCAL', 'S3', 'POSTGRESQL'], required: false })
  WAHA_MEDIA_STORAGE?: string;

  @ApiProperty({ required: false })
  WAHA_MEDIA_S3_BUCKET?: string;

  @ApiProperty({ required: false })
  WAHA_MEDIA_S3_REGION?: string;

  @ApiProperty({ required: false })
  WAHA_MEDIA_S3_ENDPOINT?: string;

  @ApiProperty({ required: false })
  WAHA_MEDIA_S3_ACCESS_KEY?: string;

  @ApiProperty({ required: false })
  WAHA_MEDIA_S3_SECRET_KEY?: string;

  @ApiProperty({ required: false })
  WAHA_MEDIA_PG_URL?: string;
}

class AuthConfigBody {
  @ApiProperty({ required: false })
  username?: string;

  @ApiProperty({ required: false })
  password?: string;
}

class UpstreamSyncBody {
  @ApiProperty({ required: false, default: false })
  deploy?: boolean;
}

class StorageConfigResponse {
  @ApiProperty({ description: 'Currently active env var values' })
  current: Record<string, string>;

  @ApiProperty({ description: 'Values saved in waha-config.json (applied on next restart)' })
  saved: Record<string, string>;

  @ApiProperty()
  configFile: string;
}

class UpstreamSyncResponse {
  @ApiProperty()
  updated: boolean;

  @ApiProperty()
  output: string;

  @ApiProperty()
  error?: string;
}

@ApiSecurity('api_key')
@Controller('api/plus')
@ApiTags('⚡ Plus')
@UseGuards(PoliciesGuard)
export class ConfigPlusController {
  // ── Storage config ────────────────────────────────────────────────────────

  @Get('config/storage')
  @CheckPolicies(CanServer(Action.Read))
  @ApiOperation({
    summary: 'Get media storage configuration',
    description:
      'Returns the currently active env vars and any pending overrides saved in waha-config.json.',
  })
  getStorageConfig(): StorageConfigResponse {
    const saved = readConfigFile();
    const current: Record<string, string> = {};
    for (const key of ALLOWED_STORAGE_KEYS) {
      const val = process.env[key] || '';
      // Mask secrets in the response
      if (key.includes('SECRET') || key.includes('URL')) {
        current[key] = val ? '***' : '';
      } else {
        current[key] = val;
      }
    }
    return { current, saved, configFile: CONFIG_FILE };
  }

  @Post('config/storage')
  @CheckPolicies(CanServer(Action.Use))
  @ApiOperation({
    summary: 'Update media storage configuration',
    description:
      'Saves WAHA_MEDIA_* variables to waha-config.json. Changes take effect after restarting WAHA.',
  })
  saveStorageConfig(@Body() body: StorageConfigBody) {
    const existing = readConfigFile();
    const bodyRecord = body as unknown as Record<string, string>;

    for (const key of ALLOWED_STORAGE_KEYS) {
      if (bodyRecord[key] === undefined || bodyRecord[key] === null) continue;
      if (bodyRecord[key] === '') {
        delete existing[key];
      } else {
        existing[key] = bodyRecord[key];
      }
    }

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(existing, null, 2));
    return {
      saved: true,
      message: 'Configuration saved. Restart WAHA to apply changes.',
      config: existing,
    };
  }

  // ── Dashboard auth config ─────────────────────────────────────────────────

  @Get('config/auth')
  @CheckPolicies(CanServer(Action.Read))
  @ApiOperation({
    summary: 'Get dashboard credential configuration',
    description:
      'Returns whether WAHA_DASHBOARD_USERNAME and WAHA_DASHBOARD_PASSWORD are set. ' +
      'Passwords are never returned in plaintext.',
  })
  getAuthConfig() {
    const saved = readConfigFile();
    return {
      usernameSet: !!(
        process.env.WAHA_DASHBOARD_USERNAME || saved.WAHA_DASHBOARD_USERNAME
      ),
      passwordSet: !!(
        process.env.WAHA_DASHBOARD_PASSWORD || saved.WAHA_DASHBOARD_PASSWORD
      ),
      currentUsername:
        process.env.WAHA_DASHBOARD_USERNAME ||
        saved.WAHA_DASHBOARD_USERNAME ||
        '',
      savedUsername: saved.WAHA_DASHBOARD_USERNAME || '',
    };
  }

  @Post('config/auth')
  @CheckPolicies(CanServer(Action.Use))
  @ApiOperation({
    summary: 'Update dashboard username and password',
    description:
      'Saves WAHA_DASHBOARD_USERNAME and WAHA_DASHBOARD_PASSWORD to waha-config.json. ' +
      'Changes take effect after restarting WAHA.',
  })
  saveAuthConfig(@Body() body: AuthConfigBody) {
    const existing = readConfigFile();

    if (body.username !== undefined && body.username !== null) {
      if (body.username === '') {
        delete existing.WAHA_DASHBOARD_USERNAME;
      } else {
        existing.WAHA_DASHBOARD_USERNAME = body.username;
      }
    }

    if (body.password !== undefined && body.password !== null) {
      if (body.password === '') {
        delete existing.WAHA_DASHBOARD_PASSWORD;
      } else {
        existing.WAHA_DASHBOARD_PASSWORD = body.password;
      }
    }

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(existing, null, 2));
    return {
      saved: true,
      message:
        'Credentials saved. Restart WAHA to apply. ' +
        'You will need to log in again with the new credentials.',
    };
  }

  // ── Upstream sync ─────────────────────────────────────────────────────────

  @Post('upstream/sync')
  @CheckPolicies(CanServer(Action.Use))
  @ApiOperation({
    summary: 'Sync from upstream devlikeapro/waha',
    description:
      'Runs the upstream sync script which fetches, rebases, and optionally rebuilds. ' +
      'Requires git and the sync script to be available (works on host; not inside Docker).',
  })
  triggerUpstreamSync(
    @Body() body: UpstreamSyncBody,
  ): UpstreamSyncResponse {
    if (!fs.existsSync(SYNC_SCRIPT)) {
      return {
        updated: false,
        output: '',
        error: `Sync script not found at ${SYNC_SCRIPT}. Run manually: ./scripts/update-from-upstream.sh`,
      };
    }

    try {
      const args = body?.deploy ? '--deploy' : '';
      const output = execSync(`bash "${SYNC_SCRIPT}" ${args}`, {
        timeout: 300_000,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const updated = output.includes('Rebase complete') || output.includes('upstream');
      return { updated, output };
    } catch (err: any) {
      const output = (err.stdout || '') + (err.stderr || '');
      return {
        updated: false,
        output,
        error: err.message,
      };
    }
  }
}
