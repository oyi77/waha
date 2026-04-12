import * as crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';

export const WAHA_AUTH_COOKIE = 'waha-auth';

export function isSecureRequest(req: Request): boolean {
  return (
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production'
  );
}

// Per-process ephemeral secret for development (never used in production).
const _ephemeralSecret = crypto.randomBytes(32).toString('hex');

// Dashboard HMAC signing secret — resolved once at module load.
const _dashboardSecret: string = (() => {
  const s = process.env.WAHA_DASHBOARD_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'WAHA_DASHBOARD_SECRET environment variable must be set in production',
      );
    }
    // Development fallback: ephemeral random secret, invalidated on restart.
    return _ephemeralSecret;
  }
  return s;
})();

export function parseCookies(header: string): Record<string, string> {
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

/**
 * Constant-time string comparison to prevent timing attacks.
 * Always runs in O(max(a.length, b.length)) regardless of where strings differ.
 */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) {
    // Run a dummy compare on equal-length buffers to normalise timing.
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

export function makeAuthToken(username: string, password: string): string {
  return crypto
    .createHmac('sha256', _dashboardSecret)
    .update(`${username}:${password}`)
    .digest('hex');
}

/**
 * Credentials for the dashboard middleware.
 * Either raw [username, password] (token computed on the fly) or a pre-computed
 * HMAC token (used when Plus stores the token in the database instead of the raw password).
 */
export type CredentialEntry =
  | [string, string]        // [username, rawPassword] — token computed via makeAuthToken
  | { authToken: string };  // pre-computed HMAC token — compared directly

export type CredentialResolver = () =>
  | CredentialEntry
  | null
  | Promise<CredentialEntry | null>;

/**
 * Dashboard auth middleware.
 * - Allows login.html through without auth.
 * - Accepts a valid waha-auth cookie (browser login flow).
 * - Accepts HTTP Basic Auth credentials as a fallback when raw credentials are provided.
 * - Browser clients (Accept: text/html) without any auth are redirected to the login page.
 * - Non-browser clients without auth receive 401 with WWW-Authenticate header.
 */
export function DashboardCookieAuthFunction(
  usernameOrResolver: string | CredentialResolver,
  password?: string,
) {
  const resolve: CredentialResolver =
    typeof usernameOrResolver === 'function'
      ? usernameOrResolver
      : () => [usernameOrResolver, password!];

  return function dashboardCookieAuth(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    // Use originalUrl (full path) because NestJS forRoutes() strips the prefix from req.url.
    const url: string = req.originalUrl || req.url || '';
    // Strip query string before comparing to avoid bypass via encoding tricks.
    const path = url.split('?')[0];

    // Allow the login page through without auth.
    if (path === '/dashboard/login.html') {
      return next();
    }

    const result = resolve();
    const handle = (entry: CredentialEntry | null) => {
      if (!entry) {
        return next();
      }

      // Determine the valid token and whether Basic Auth is available.
      const isRawCreds = Array.isArray(entry);
      const validToken = isRawCreds
        ? makeAuthToken(entry[0], entry[1])
        : entry.authToken;

      // Check waha-auth cookie (browser login flow).
      const cookies = parseCookies(req.headers.cookie || '');
      if (safeEqual(cookies[WAHA_AUTH_COOKIE] || '', validToken)) {
        return next();
      }

      // Check HTTP Basic Auth — only available when raw credentials are present.
      if (isRawCreds) {
        const [username, pwd] = entry;
        const basicCreds = parseBasicAuth(req.headers.authorization || '');
        if (basicCreds) {
          const [u, p] = basicCreds;
          if (safeEqual(u, username) && safeEqual(p, pwd)) {
            return next();
          }
          // Wrong credentials supplied explicitly — always 401.
          res.set('WWW-Authenticate', 'Basic realm="waha"');
          return res.status(401).json({ message: 'Unauthorized' });
        }
      }

      // No credentials at all: redirect browsers, return 401 for API clients.
      const accept: string = req.headers.accept || '';
      if (accept.includes('text/html')) {
        return res.redirect('/dashboard/login.html');
      }
      res.set('WWW-Authenticate', 'Basic realm="waha"');
      return res.status(401).json({ message: 'Unauthorized' });
    };

    if (result instanceof Promise) {
      result.then(handle).catch(() => {
        res.status(500).json({ message: 'Internal server error' });
      });
    } else {
      handle(result);
    }
  };
}
