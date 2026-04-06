import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DashboardConfigServiceCore } from '@waha/core/config/DashboardConfigServiceCore';
import { makeAuthToken } from '@waha/core/auth/dashboardCookieAuth';
import { Response } from 'express';

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
  login(
    @Body() body: { username?: string; password?: string },
    @Res() res: Response,
  ) {
    const credentials = this.dashboardConfig.credentials;
    if (!credentials) {
      // Auth not configured — grant access freely
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
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
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
}
