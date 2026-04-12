import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { DashboardConfigServiceCore } from '@waha/core/config/DashboardConfigServiceCore';
import {
  isSecureRequest,
  makeAuthToken,
  parseCookies,
  safeEqual,
  WAHA_AUTH_COOKIE,
} from '@waha/core/auth/dashboardCookieAuth';
import { Request, Response } from 'express';

import { SettingsService } from './settings.service';

class UpdateCredentialsBody {
  @ApiProperty({ required: true })
  currentPassword: string;

  @ApiProperty({ required: true })
  newUsername: string;

  @ApiProperty({ required: true })
  newPassword: string;
}

@Controller('api/dashboard/settings')
@ApiTags('⚙️ Dashboard Settings')
export class SettingsController {
  constructor(
    private settingsService: SettingsService,
    private dashboardConfig: DashboardConfigServiceCore,
  ) {}

  private async verifyAuth(req: Request): Promise<void> {
    const cookies = parseCookies(req.headers.cookie || '');
    const cookieToken = cookies[WAHA_AUTH_COOKIE] || '';

    // Prefer the DB-stored HMAC token when available.
    try {
      const storedToken = await this.settingsService.getStoredAuthToken();
      if (storedToken !== null) {
        if (!safeEqual(cookieToken, storedToken)) {
          throw new UnauthorizedException('Not authenticated');
        }
        return;
      }
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      // DB not ready yet — fall through to env credentials.
    }

    // Fall back to env credentials.
    const envCreds = this.dashboardConfig.credentials;
    if (!envCreds) {
      return; // No auth configured — allow through.
    }
    const [username, password] = envCreds;
    const validToken = makeAuthToken(username, password);
    if (!safeEqual(cookieToken, validToken)) {
      throw new UnauthorizedException('Not authenticated');
    }
  }

  @Get()
  @ApiOperation({
    summary: 'Get dashboard settings',
    description:
      'Returns the current dashboard username and credential source.',
  })
  async getSettings(@Req() req: Request) {
    await this.verifyAuth(req);

    const storedUsername = await this.settingsService.getStoredUsername();
    const envCredentials = this.dashboardConfig.credentials;
    const envUsername = envCredentials ? envCredentials[0] : null;

    return {
      username: storedUsername ?? envUsername ?? '',
      source: storedUsername ? 'database' : 'environment',
    };
  }

  @Put('credentials')
  @ApiOperation({
    summary: 'Update dashboard credentials',
    description:
      'Changes the dashboard username and password. Requires the current password for verification. ' +
      'New credentials are persisted to the database and take priority over environment variables.',
  })
  async updateCredentials(
    @Body() body: UpdateCredentialsBody,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.verifyAuth(req);

    if (!body.currentPassword || !body.newUsername || !body.newPassword) {
      throw new BadRequestException(
        'currentPassword, newUsername, and newPassword are required',
      );
    }

    if (body.newPassword.length < 6) {
      throw new BadRequestException(
        'New password must be at least 6 characters',
      );
    }

    const currentPasswordValid = await this.verifyCurrentPassword(
      body.currentPassword,
    );
    if (!currentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    await this.settingsService.saveCredentials(
      body.newUsername,
      body.newPassword,
    );

    // Refresh the session cookie so the user stays authenticated after the
    // credential change (old cookie token is now invalid).
    const newToken = makeAuthToken(body.newUsername, body.newPassword);
    res.cookie(WAHA_AUTH_COOKIE, newToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: isSecureRequest(req),
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
      success: true,
      username: body.newUsername,
      source: 'database',
    };
  }

  private async verifyCurrentPassword(password: string): Promise<boolean> {
    const dbValid = await this.settingsService.verifyPassword(password);
    if (dbValid) {
      return true;
    }

    const envCredentials = this.dashboardConfig.credentials;
    if (envCredentials) {
      const [, envPassword] = envCredentials;
      return safeEqual(password, envPassword);
    }

    return false;
  }
}
