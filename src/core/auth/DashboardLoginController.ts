import {
  Body,
  Controller,
  Get,
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

class LoginBody {
  @ApiProperty({ required: true })
  username: string;

  @ApiProperty({ required: true })
  password: string;
}

@Controller('api/dashboard')
@ApiTags('🔐 Dashboard Auth')
export class DashboardLoginController {
  constructor(private dashboardConfig: DashboardConfigServiceCore) {}

  @Post('login')
  @ApiOperation({
    summary: 'Dashboard login',
    description:
      'Validates username/password and sets waha-auth session cookie. No API key required.',
  })
  login(@Body() body: LoginBody, @Req() req: Request, @Res() res: Response) {
    const credentials = this.dashboardConfig.credentials;
    if (!credentials) {
      return res.json({ success: true, message: 'No auth configured' });
    }

    const [username, password] = credentials;
    if (
      !safeEqual(body.username || '', username) ||
      !safeEqual(body.password || '', password)
    ) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = makeAuthToken(username, password);
    res.cookie(WAHA_AUTH_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: isSecureRequest(req),
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
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
  getConfig(@Req() req: Request, @Res() res: Response) {
    const credentials = this.dashboardConfig.credentials;

    if (credentials) {
      const [username, password] = credentials;
      const validToken = makeAuthToken(username, password);
      const cookies = parseCookies(req.headers.cookie || '');
      if (!safeEqual(cookies[WAHA_AUTH_COOKIE] || '', validToken)) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
    }

    const plainKey = Auth.keyplain?.value || '';
    return res.json({ apiKey: plainKey });
  }
}
