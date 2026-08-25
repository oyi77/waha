/**
 * Paths excluded from ApiKeyAuthMiddleware (see app.module.core.ts configure()).
 *
 * Shared contract with public-api-paths.test.ts, which asserts every dashboard
 * route is either listed here or deliberately API-key protected. Adding a new
 * cookie-authenticated dashboard endpoint requires an entry here — otherwise
 * requests 401 before reaching the controller.
 */
export const PUBLIC_API_KEY_EXCLUDE_PATHS = [
  // Dashboard login/logout/config are public — no API key required
  '/api/dashboard/login',
  '/api/dashboard/logout',
  '/api/dashboard/config',
  '/api/dashboard/settings',
  '/api/dashboard/settings/*path',
  // Prometheus scrape endpoint — MetricsController enforces the key itself
  '/metrics',
];
