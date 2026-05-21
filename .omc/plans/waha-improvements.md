# WAHA Improvements Plan

## 1. Session Auto-Restart on Failure
- Fix `autoRestartFailed` DI issue in SessionLifecycleController
- Wire up periodic check for FAILED sessions
- Configurable retry interval and max retries
- Files: `src/plus/manager.plus.ts`, `src/plus/settings.service.ts`

## 2. Sessions Page Redesign
- Redesign like Workers page: stat cards, better layout
- Status badges with color coding
- Quick actions: start/stop/restart/delete with tooltips
- QR code modal improvements
- Engine column visible
- Responsive mobile layout
- Files: `pages/Sessions.vue`

## 3. Volume Cleanup + Backup
- Remove old unused volumes (waha_waha_sessions, waha_waha_media, waha-plus-data)
- Add backup script for waha_sessions
- Update systemd service with volume mounts
- Files: systemd service, new backup script

## 4. Health Monitoring
- Health check endpoint improvements
- Session status polling with alerts
- Failed session notification
- Files: `src/plus/health.controller.ts` (new or existing)

## 5. Settings Page Layout
- Better organized sections
- Toggle descriptions
- Responsive layout
- Files: `pages/Settings.vue`

## Verification
- `cd waha && yarn build` passes
- `cd waha-dashboard && npm run generate` passes
- Docker rebuild + restart works
- Auto-restart triggers for FAILED sessions
