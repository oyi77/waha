# WAHA Plus Fork — oyi77/waha

> Multi-session WhatsApp HTTP API with advanced features, no subscription required.

This is a fork of [devlikeapro/waha](https://github.com/devlikeapro/waha) with **WAHA Plus** features implemented open-source.

## 🚀 What's Added

| Feature | Core (original) | This Fork |
|---------|----------------|-----------|
| Sessions | 1 (`default` only) | **Unlimited** |
| Session persistence | ❌ | ✅ Auto-restored on restart |
| Bulk broadcast API | ❌ | ✅ `/api/broadcast/text` |
| Session stats | ❌ | ✅ `/api/server/sessions/stats` |
| Session limit config | ❌ | ✅ `WAHA_MAX_SESSIONS` env |
| Docker Compose Plus | ❌ | ✅ `docker-compose.plus.yml` |

## 🏃 Quick Start

```bash
# Clone
git clone https://github.com/oyi77/waha
cd waha

# Copy env
cp .env.plus.example .env
# Edit .env — set WAHA_API_KEY!

# Run
docker compose -f docker-compose.plus.yml up -d

# Open dashboard
open http://localhost:3000/dashboard
```

## 📡 Multi-Session Usage

```bash
# Start session "account1"
curl -X POST http://localhost:3000/api/sessions \
  -H "X-Api-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"name": "account1"}'

# Start session "account2"
curl -X POST http://localhost:3000/api/sessions \
  -H "X-Api-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"name": "account2"}'

# List all sessions
curl http://localhost:3000/api/sessions?all=true \
  -H "X-Api-Key: your-key"

# Send text from account1
curl -X POST http://localhost:3000/api/sendText \
  -H "X-Api-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"session": "account1", "chatId": "628123456789@c.us", "text": "Hello!"}'
```

## 📢 Bulk Broadcast

Send one message to many contacts at once:

```bash
curl -X POST http://localhost:3000/api/broadcast/text \
  -H "X-Api-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "session": "account1",
    "chatIds": ["628111111111@c.us", "628222222222@c.us", "628333333333@c.us"],
    "text": "Hello everyone!",
    "delayMs": 1000
  }'
```

Response:
```json
{
  "sent": ["628111111111@c.us", "628222222222@c.us"],
  "failed": [{"chatId": "628333333333@c.us", "error": "..."}]
}
```

## 📊 Session Stats

```bash
curl http://localhost:3000/api/server/sessions/stats \
  -H "X-Api-Key: your-key"
```

Response:
```json
{
  "total": 5,
  "running": 3,
  "stopped": 2,
  "failed": 0,
  "maxAllowed": 0
}
```

## ⚙️ Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WAHA_MAX_SESSIONS` | `0` | Max concurrent sessions (0 = unlimited) |
| `WAHA_API_KEY` | _(none)_ | API key for auth |
| `WHATSAPP_DEFAULT_ENGINE` | `NOWEB` | Engine: NOWEB, WEBJS, GOWS |
| `WHATSAPP_START_SESSION` | _(none)_ | Auto-start sessions on boot (comma-separated) |
| `WAHA_DASHBOARD_ENABLED` | `true` | Enable web dashboard |
| `WAHA_LOG_LEVEL` | `info` | Log level |

## 🔧 How It Works

The Core version uses `SessionManagerCore` which enforces a single `default` session. This fork adds `SessionManagerPlus` in `src/plus/` which:

1. Stores sessions in a `Map<string, WhatsappSession>`
2. Persists configs to disk — sessions auto-restore after container restart
3. Enables unlimited sessions by default
4. WAHA's own `version.ts` auto-detects the `src/plus/` directory and loads `AppModulePlus`

## 📁 Files Added

```
src/plus/
├── manager.plus.ts          # Multi-session manager (core logic)
├── app.module.plus.ts       # NestJS module wiring
├── broadcast.controller.ts  # Bulk broadcast API
└── server.plus.controller.ts # Session stats endpoint
docker-compose.plus.yml      # Docker Compose for Plus
.env.plus.example            # Environment template
WAHA_PLUS_FORK.md            # This file
```

## Support the original project

If you find WAHA useful, consider supporting the original authors at https://waha.devlike.pro/support-us

## 🤝 Contributing

### Commit Format

This repo enforces commit message format via `.precommit/validate_commit_message.py`:

| Change touches | Required prefix | Example |
|----------------|----------------|---------|
| `src/plus/**` only | `[PLUS]` | `[PLUS] add voice status endpoint` |
| Everything else | `[core]` | `[core] fix session timeout` |

> ⚠️ Commits with `feat(plus):` or `fix(plus):` style will be **rejected** by the hook. Always use `[PLUS]` or `[core]` prefixes.

To install the hook locally:
```bash
cp .precommit/validate_commit_message.py .git/hooks/commit-msg
chmod +x .git/hooks/commit-msg
```

---

*Fork maintained by [oyi77](https://github.com/oyi77)*
*Support: https://www.tip.md/oyi77*
