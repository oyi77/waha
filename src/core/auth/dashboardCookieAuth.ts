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

function parseBasicAuth(header: string): [string, string] | null {
  if (!header || !header.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const colon = decoded.indexOf(':');
    if (colon < 0) return null;
    return [decoded.slice(0, colon), decoded.slice(colon + 1)];
  } catch {
    return null;
  }
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
 * Dashboard auth middleware.
 * - Allows login.html through without auth.
 * - Accepts a valid waha-auth cookie (browser login flow).
 * - Accepts HTTP Basic Auth credentials as a fallback (API / programmatic access).
 * - Browser clients (Accept: text/html) without any auth are redirected to the login page.
 * - Non-browser clients without auth receive 401.
 */
export function DashboardCookieAuthFunction(
  username: string,
  password: string,
) {
  const validToken = makeAuthToken(username, password);

  return function dashboardCookieAuth(req: any, res: any, next: () => void) {
    // Use originalUrl (full path) because NestJS forRoutes() strips the prefix from req.url
    const url: string = req.originalUrl || req.url || '';

    // Allow the login page through without auth
    if (
      url === '/dashboard/login.html' ||
      url.startsWith('/dashboard/login.html?')
    ) {
      return next();
    }

    // Check waha-auth cookie (browser login flow)
    const cookies = parseCookies(req.headers.cookie || '');
    if (cookies['waha-auth'] === validToken) {
      return next();
    }

    // Check HTTP Basic Auth (API / programmatic access)
    const basicCreds = parseBasicAuth(req.headers.authorization || '');
    if (basicCreds) {
      const [u, p] = basicCreds;
      if (u === username && p === password) {
        return next();
      }
      // Wrong credentials supplied explicitly — always 401
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // No credentials at all: redirect browsers, return 401 for API clients
    const accept: string = req.headers.accept || '';
    if (accept.includes('text/html')) {
      return res.redirect('/dashboard/login.html');
    }
    return res.status(401).json({ message: 'Unauthorized' });
  };
}
