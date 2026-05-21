# WAHA Dashboard

Web-based management dashboard for [WAHA Core](https://github.com/oyi77/waha-core) and [WAHA Plus](https://github.com/oyi77/waha-core) — a WhatsApp HTTP API.

## Features

- **Sessions** — Start, stop, restart, and manage WhatsApp sessions with bulk operations
- **Workers** — Multi-worker orchestration for WAHA Plus
- **Templates** — Message template management
- **Auto-Reply** — Automated response rules
- **Scheduling** — Scheduled message sending
- **Contacts** — Contact management
- **Analytics** — Message and session analytics
- **Settings** — Configure session lifecycle, engines, and API credentials

## Screenshots

See the live dashboard at [waha.devlike.pro/dashboard](https://waha.devlike.pro/dashboard)

## Quick Start

```bash
# Install dependencies
yarn install

# Development
yarn dev

# Production build
yarn build

# Preview production build
yarn preview
```

## Configuration

The dashboard connects to WAHA via the REST API. Configure the API URL via the `NUXT_PUBLIC_WAHA_API_URL` environment variable:

```bash
NUXT_PUBLIC_WAHA_API_URL=https://your-waha-server.com
```

## Related

- **WAHA Core** — [oyi77/waha-core](https://github.com/oyi77/waha-core) — Backend REST API
- **Documentation** — [waha.devlike.pro](https://waha.devlike.pro/)
- **Swagger API Docs** — [waha.devlike.pro/swagger](https://waha.devlike.pro/swagger)
