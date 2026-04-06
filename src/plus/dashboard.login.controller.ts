import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { DashboardConfigServiceCore } from '@waha/core/config/DashboardConfigServiceCore';
import { makeAuthToken } from '@waha/core/auth/dashboardCookieAuth';
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
  login(@Body() body: LoginBody, @Res() res: Response) {
    const credentials = this.dashboardConfig.credentials;
    if (!credentials) {
      return res.json({ success: true, message: 'No auth configured' });
    }

    const [username, password] = credentials;
    if (body.username !== username || body.password !== password) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = makeAuthToken(username, password);
    res.cookie('waha-auth', token, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return res.json({ success: true });
  }

  @Get('logout')
  @ApiOperation({
    summary: 'Dashboard logout',
    description: 'Clears the waha-auth session cookie.',
  })
  logout(@Res() res: Response) {
    res.clearCookie('waha-auth', { path: '/' });
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

    // Verify waha-auth cookie when credentials are configured
    if (credentials) {
      const [username, password] = credentials;
      const validToken = makeAuthToken(username, password);
      const cookieHeader: string = (req.headers.cookie as string) || '';
      const cookies: Record<string, string> = {};
      for (const pair of cookieHeader.split(';')) {
        const idx = pair.indexOf('=');
        if (idx < 0) continue;
        cookies[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
      }
      if (cookies['waha-auth'] !== validToken) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
    }

    // Return the plain API key (from WAHA_API_KEY_PLAIN env or the raw key)
    const plainKey = Auth.keyplain?.value || '';
    return res.json({ apiKey: plainKey });
  }
}
