import * as crypto from 'crypto';

function parseCookies(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of (header || '').split(';')) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    result[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return result;
}

export function makeAuthToken(username: string, password: string): string {
  const secret =
    process.env.WAHA_DASHBOARD_SECRET || 'waha-dashboard-hmac-secret-v1';
  return crypto
    .createHmac('sha256', secret)
    .update(`${username}:${password}`)
    .digest('hex');
}

/**
 * Cookie-based dashboard auth middleware.
 * Serves login.html without auth; all other dashboard paths require a valid
 * waha-auth cookie. On failure, redirects to /dashboard/login.html.
 */
export function DashboardCookieAuthFunction(
  username: string,
  password: string,
) {
  const validToken = makeAuthToken(username, password);

  return function dashboardCookieAuth(req: any, res: any, next: () => void) {
    const url: string = req.url || '';

    // Allow the login page through without a cookie
    if (
      url === '/dashboard/login.html' ||
      url.startsWith('/dashboard/login.html?')
    ) {
      return next();
    }

    // Check cookie
    const cookies = parseCookies(req.headers.cookie || '');
    if (cookies['waha-auth'] === validToken) {
      return next();
    }

    // Not authenticated — redirect to the custom login page
    return res.redirect('/dashboard/login.html');
  };
}
