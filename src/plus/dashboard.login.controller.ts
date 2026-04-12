import {
  Body,
  Controller,
  Get,
  Logger,
  Optional,
  Post,
  Req,
  Res,
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
import { Auth } from '@waha/core/auth/config';
import { Request, Response } from 'express';

import { SettingsService } from './settings.service';

class LoginBody {
  @ApiProperty({ required: true })
  username: string;

  @ApiProperty({ required: true })
  password: string;
}

function setCookieAuth(res: Response, token: string, req: Request) {
  res.cookie(WAHA_AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: isSecureRequest(req),
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

@Controller('api/dashboard')
@ApiTags('🔐 Dashboard Auth')
export class DashboardLoginController {
  private readonly logger = new Logger(DashboardLoginController.name);

  constructor(
    private dashboardConfig: DashboardConfigServiceCore,
    @Optional() private settingsService?: SettingsService,
  ) {}

  @Post('login')
  @ApiOperation({
    summary: 'Dashboard login',
    description:
      'Validates username/password and sets waha-auth session cookie. No API key required.',
  })
  async login(
    @Body() body: LoginBody,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const submittedUsername = body.username || '';
    const submittedPassword = body.password || '';

    // Try DB-stored credentials first (hash-based — raw password never stored).
    if (this.settingsService) {
      const stored = await this.settingsService
        .getStoredCredentials()
        .catch(() => null);
      if (stored) {
        if (!safeEqual(submittedUsername, stored.username)) {
          return res
            .status(401)
            .json({ error: 'Invalid username or password' });
        }
        const passwordValid = await this.settingsService
          .verifyPassword(submittedPassword)
          .catch(() => false);
        if (!passwordValid) {
          return res
            .status(401)
            .json({ error: 'Invalid username or password' });
        }
        // Recompute and refresh the stored HMAC token so it stays valid across
        // server restarts (ephemeral _dashboardSecret in development).
        const token = makeAuthToken(stored.username, submittedPassword);
        await this.settingsService
          .refreshAuthToken(stored.username, submittedPassword)
          .catch((e) =>
            this.logger.warn(
              `DashboardLogin: failed to refresh auth token: ${e?.message}`,
            ),
          );
        setCookieAuth(res, token, req);
        return res.json({ success: true });
      }
    }

    // Fall back to env-configured credentials.
    const envCreds = this.dashboardConfig.credentials;
    if (!envCreds) {
      return res.json({ success: true, message: 'No auth configured' });
    }
    const [username, password] = envCreds;
    if (
      !safeEqual(submittedUsername, username) ||
      !safeEqual(submittedPassword, password)
    ) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const token = makeAuthToken(username, password);
    setCookieAuth(res, token, req);
    return res.json({ success: true });
  }

  @Post('logout')
  @ApiOperation({
    summary: 'Dashboard logout',
    description: 'Clears the waha-auth session cookie.',
  })
  logout(@Req() req: Request, @Res() res: Response) {
    res.clearCookie(WAHA_AUTH_COOKIE, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: isSecureRequest(req),
    });
    return res.json({ success: true });
  }

  @Get('config')
  @ApiOperation({
    summary: 'Dashboard config for authenticated users',
    description:
      'Returns the plain API key for authenticated dashboard users (verified via waha-auth cookie). ' +
      'No API key required — excluded from API key auth.',
  })
  async getConfig(@Req() req: Request, @Res() res: Response) {
    const cookies = parseCookies(req.headers.cookie || '');
    const cookieToken = cookies[WAHA_AUTH_COOKIE] || '';

    // Resolve the valid token — prefer stored DB token, fall back to env.
    let validToken: string | null = null;
    if (this.settingsService) {
      validToken = await this.settingsService
        .getStoredAuthToken()
        .catch(() => null);
    }
    if (!validToken) {
      const envCreds = this.dashboardConfig.credentials;
      if (envCreds) {
        validToken = makeAuthToken(envCreds[0], envCreds[1]);
      }
    }

    if (validToken && !safeEqual(cookieToken, validToken)) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const plainKey = Auth.keyplain?.value || '';
    return res.json({ apiKey: plainKey });
  }
}
