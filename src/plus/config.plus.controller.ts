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
  saveStorageConfig(@Body() body: Record<string, string>) {
    const existing = readConfigFile();

    for (const key of ALLOWED_STORAGE_KEYS) {
      if (body[key] === undefined || body[key] === null) continue;
      if (body[key] === '') {
        delete existing[key];
      } else {
        existing[key] = body[key];
      }
    }

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(existing, null, 2));
    return {
      saved: true,
      message: 'Configuration saved. Restart WAHA to apply changes.',
      config: existing,
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
    @Body() body: { deploy?: boolean },
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
