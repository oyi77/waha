/**
 * Jest setupFiles entry for e2e tests.
 * Runs before any module imports, so Auth singleton picks up these values.
 */
process.env.WAHA_API_KEY = '666';
process.env.WAHA_DASHBOARD_PASSWORD = '666';
process.env.WAHA_DASHBOARD_USERNAME = 'admin';
process.env.WHATSAPP_SWAGGER_USERNAME = 'admin';
process.env.WHATSAPP_SWAGGER_PASSWORD = '666';
