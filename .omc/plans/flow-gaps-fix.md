# Business Flow Gaps Fix Plan

## Phase 1: Critical + High (Core session lifecycle)

### Fix 1: Core `start()` — allow FAILED/SCAN_QR_CODE restart
File: `src/core/manager.core.ts:178-184`
Change: Check session status, stop and restart if not WORKING (same pattern as Plus fix)

### Fix 2: Deprecated start endpoint
File: `src/api/sessions.controller.ts:308-310`
Change: Delegate to `manager.start()` which handles status internally

### Fix 3: Controller `update()` restart logic
File: `src/api/sessions.controller.ts:178-189`
Change: Use status-aware restart instead of `isRunning`

### Fix 4: Controller `logout()` restart logic
File: `src/api/sessions.controller.ts:269-275`
Change: Same as Fix 3

### Fix 5: Apps controller restart logic
File: `src/apps/app_sdk/api/apps.controller.ts:64,115,135`
Change: Delegate to `manager.restart()` which handles status

### Fix 6: Scheduled messages retry
File: `src/plus/schedule.service.ts:125`
Change: On session-not-WORKING failure, revert to `pending` state for retry

### Fix 7: Lifecycle settings hot-reload
File: `src/plus/settings.service.ts` + `src/plus/manager.plus.ts`
Change: Re-read settings on each relevant event instead of only at boot

## Phase 2: Medium (Error messages, guards, optimizations)

### Fix 8: Double `afterSessionStart()`
File: `src/core/manager.core.ts:239-247`
Change: Remove duplicate call at line 247

### Fix 9: `waitUntilStatus` error message
File: `src/core/abc/manager.abc.ts:168-220`
Change: Include current status in error message

### Fix 10: `SessionPipe` status guard
File: `src/nestjs/pipes/SessionPipe.ts:12-18`
Change: Document or add status check

### Fix 11: Static data endpoints ungated
File: `src/api/channels.controller.ts:217-233`
Change: Remove `@WorkingSessionParam` from static data endpoints

### Fix 12: Media conversion ungated
File: `src/api/media.controller.ts:48-73`
Change: Remove `@WorkingSessionParam` for data-based inputs

### Fix 13: Bulk early abort on session death
File: `src/plus/bulk.controller.ts:136-147`
Change: Abort after N consecutive failures

### Fix 14: Bulk check delay
File: `src/plus/bulk.controller.ts:172-183`
Change: Add configurable `delayMs` parameter

## Verification
- `cd /home/openclaw/projects/waha && yarn build` must pass
- `cd /home/openclaw/projects/waha-dashboard && npm run generate` must pass
- Restart test: `POST /api/sessions/Detergen/start` on FAILED session returns STARTING
