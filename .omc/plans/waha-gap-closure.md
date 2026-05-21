# WAHA + Dashboard — Gap Closure Plan (v2)

## Requirements Summary

Close all implementation gaps across waha backend and waha-dashboard frontend. Covers: error handling, dead code, missing engine features, bare Error throws, missing validation pipes, dashboard UX bugs, and accessibility issues.

## Acceptance Criteria

- [ ] Dashboard shows actual API error messages in ALL catch blocks (0 generic messages)
- [ ] All Plus pages handle 403/AvailableInPlusVersion with "Requires WAHA Plus" message
- [ ] API Keys page bug fixed (session dropdown shows session names, not engine names)
- [ ] All bare `throw new Error` in API-facing code replaced with NestJS HTTP exceptions
- [ ] GOWS `cancelEvent()` dead code resolved
- [ ] NOWEB `blockContact()`/`unblockContact()` implemented with correct signature
- [ ] `deleteGroup()` documented as unsupported on GOWS/NOWEB with clear error message
- [ ] ChatWoot `ReportSucceeded()` dead code fixed
- [ ] ChatWoot session.status empty catch block fixed
- [ ] WebSocket reconnect has exponential backoff + retry button
- [ ] `yarn build` passes
- [ ] `yarn test --watchman=false` passes
- [ ] `cd waha-dashboard && npm run generate` passes

---

## Phase 1: Dashboard Error Handling (HIGH)

### Step 1.1 — Create shared error extraction helper

File: `waha-dashboard/composables/useWahaApi.ts`

Add a helper function:
```ts
export function extractApiError(e: any): string {
  const data = e?.response?._data || e?.data || {};
  if (typeof data === 'string') return data;
  return data?.message || data?.error || e?.message || 'Unknown error';
}
```

### Step 1.2 — Fix ALL catch blocks in Sessions.vue

File: `waha-dashboard/pages/Sessions.vue`

Fix all 10 catch blocks (lines ~449, 459, 485, 514, 532, 550, 572, 594, 621-622, 644-645, 665-666, 691-692, 712-713):
- Single-session actions: `catch (e) { error("Failed to X: " + extractApiError(e)); }`
- Bulk operations (lines ~621, 644, 665, 691, 712): collect failures, show count + first error

### Step 1.3 — Fix catch blocks in ALL other pages

Apply same pattern to:
- `pages/index.vue` (~line 133)
- `pages/Workers.vue` (~lines 300, 332)
- `pages/Settings.vue` (~lines 309, 324, 360)
- `pages/plus/index.vue` (~line 123)
- `pages/plus/templates.vue` (~lines 189, 197, 229, 239, 264)
- `pages/plus/autoreply.vue` (~lines 150, 177, 187, 198, 213)
- `pages/plus/schedule.vue` (~lines 170, 200, 210)
- `pages/plus/contacts.vue` (~lines 166, 217)
- `pages/plus/analytics.vue` (~lines 277, 289, 300, 314)
- `pages/plus/apikeys.vue` (~lines 207, 229, 244, 260)
- `pages/plus/engines.vue` (~lines 389, 417, 438, 472)
- `pages/plus/mcp.vue` (~lines 343, 361)
- `pages/plus/skills.vue` (~line 468)

Total: ~50 catch blocks across 14 files.

### Step 1.4 — Handle Plus-only 403 responses

In `useWahaApi.ts`, intercept 403 responses from Plus endpoints. When 403 body contains "AvailableInPlusVersion", show toast: "This feature requires WAHA Plus". Applies to all 7 Plus pages.

### Step 1.5 — Fix API Keys page bug

File: `waha-dashboard/pages/plus/apikeys.vue` (~line 196)

Change: fetch sessions from `/api/sessions?all=true` instead of `/api/engines`. The "Session" dropdown for scoped keys must show actual session names.

---

## Phase 2: Backend — Replace bare Error throws (HIGH)

All bare `throw new Error(...)` in API-facing code produce 500 instead of proper 4xx. Replace with NestJS HTTP exceptions.

### Step 2.1 — ChattingController

File: `waha/src/api/chatting.controller.ts`
- Line ~150: `sendLinkCustomPreview` — change to `BadRequestException`

### Step 2.2 — GOWS engine

File: `waha/src/core/engines/gows/session.gows.core.ts`
- Line ~1536: `setPresence` default case — change to `BadRequestException`

### Step 2.3 — WPP engine

File: `waha/src/core/engines/wpp/session.wpp.core.ts`
- Lines ~472, 533, 542, 578, 603, 1562: "WPP page/client not ready" — change to `ServiceUnavailableException`

### Step 2.4 — NOWEB engine

File: `waha/src/core/engines/noweb/session.noweb.core.ts`
- Line ~1743: `getGroup` "Group not found" — change to `NotFoundException`

### Step 2.5 — MCP controller

File: `waha/src/plus/mcp/waha.mcp.controller.ts`
- Lines ~328, 333, 365: template/tool errors — change to appropriate HTTP exceptions

### Step 2.6 — Media manager

File: `waha/src/core/media/MediaManager.ts`
- Line ~150: media download fail — change to appropriate HTTP exception

### Step 2.7 — Schedule service

File: `waha/src/plus/schedule.service.ts`
- Lines ~149, 187: unknown type / invalid date — change to `BadRequestException`

### Step 2.8 — SqlKVRepository

File: `waha/src/core/storage/sql/SqlKVRepository.ts`
- Line ~17: `get schema()` — improve error message to include repository name

---

## Phase 3: GOWS Engine Gaps (MEDIUM)

### Step 3.1 — Fix `cancelEvent()` dead code

File: `waha/src/core/engines/gows/session.gows.core.ts` (~line 1472-1486)

Remove `throw new Error('Method not implemented.')` at line ~1474. The implementation after it (gRPC `CancelEventMessage`) is already written. Verify it compiles and test with GOWS engine.

### Step 3.2 — Document `forwardMessage()` as GOWS-unsupported

File: `waha/src/core/engines/gows/session.gows.core.ts` (~line 1139)

Change error message to: `"Forward message is not supported by GOWS engine. Use WEBJS, NOWEB, or WPP instead."`

### Step 3.3 — Document `deleteGroup()` as GOWS-unsupported

File: `waha/src/core/engines/gows/session.gows.core.ts` (~line 1317)

Change error message to: `"Group deletion is not supported by this engine. Use leaveGroup() instead."`

---

## Phase 4: NOWEB Engine Gaps (MEDIUM)

### Step 4.1 — Implement `blockContact()`/`unblockContact()`

File: `waha/src/core/engines/noweb/session.noweb.core.ts` (~lines 1658-1662)

Use correct signature from `session.abc.ts:915`:
```ts
async blockContact(request: ContactRequest) {
  await this.client.updateBlockStatus(request.contactId, 'block');
}
async unblockContact(request: ContactRequest) {
  await this.client.updateBlockStatus(request.contactId, 'unblock');
}
```

Import `ContactRequest` from `@waha/structures/contacts.dto`.

### Step 4.2 — Document `deleteGroup()` as NOWEB-unsupported

File: `waha/src/core/engines/noweb/session.noweb.core.ts` (~line 1756)

Change error message to: `"Group deletion is not supported by NOWEB engine. Use leaveGroup() instead."`

---

## Phase 5: WEBJS Engine Gaps (MEDIUM)

### Step 5.1 — Document channel operation stubs

File: `waha/src/core/engines/webjs/session.webjs.core.ts`

Methods throwing `NotImplementedByEngineError` (~lines 1567-1603):
- `channelsCreateChannel`, `channelsDeleteChannel`
- `channelsFollowChannel`, `channelsUnfollowChannel`
- `channelsMuteChannel`, `channelsUnmuteChannel`

Update error messages to: `"This channel operation is not supported by WEBJS engine. Use NOWEB or GOWS instead."`

### Step 5.2 — Document `getChatMessages('all')` limitation

File: `waha/src/core/engines/webjs/session.webjs.core.ts` (~line 1055)

Already has clear message. No change needed.

---

## Phase 6: ChatWoot Fixes (MEDIUM)

### Step 6.1 — Fix `ReportSucceeded()` dead code

File: `waha/src/apps/chatwoot/error/ChatWootErrorReporter.ts` (~line 92-94)

Remove `return null;` at line ~94. Add config check:
```ts
if (!this.config.reportSuccess) return null;
```
Then implement the method body following `ReportError` pattern.

### Step 6.2 — Fix session.status empty catch block

File: `waha/src/apps/chatwoot/consumers/waha/session.status.ts` (~line 113)

Change `catch (_) {}` to:
```ts
catch (error) {
  this.logger.warn({ error }, 'Failed to fetch session info for ChatWoot status');
}
```

---

## Phase 7: Dashboard WebSocket Fixes (MEDIUM)

### Step 7.1 — Exponential backoff + retry button

File: `waha-dashboard/pages/event-monitor.vue`

- Change fixed 3s delay to exponential backoff: 1s, 2s, 4s, 8s, 16s
- Increase MAX_RECONNECT from 5 to 10
- Add visible "Reconnect" button when max attempts reached
- Add connection status indicator with color (green=connected, red=disconnected)

### Step 7.2 — Pause polling when tab hidden

File: `waha-dashboard/pages/Sessions.vue`, `Workers.vue`, `engines.vue`

Add `document.visibilityState` check to polling intervals — pause when tab hidden, resume when visible.

---

## Phase 8: Dashboard Missing States (LOW)

### Step 8.1 — Add STARTING to filter tabs

File: `waha-dashboard/pages/Sessions.vue` (~line 361)

Add "Starting" filter tab for sessions in STARTING state.

### Step 8.2 — Add loading states to Plus pages

Files: `templates.vue`, `autoreply.vue`, `schedule.vue`, `contacts.vue`, `analytics.vue`

Add `loading` ref + spinner while initial data loads. Currently shows empty state during load.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| GOWS cancelEvent may have bugs (never tested) | Build-only verification first; runtime test requires GOWS engine |
| NOWEB blockContact Baileys API may differ | Check Baileys source for exact `updateBlockStatus` signature |
| ChatWoot ReportSucceeded was disabled for a reason | Add config flag, default to disabled |
| Dashboard error messages may leak internals | Show user-friendly message; log full error server-side |
| Phase 2 bare Error changes may affect error handling upstream | Grep for catch blocks that check `instanceof Error` before changing |

## Verification Steps

1. `cd waha && yarn build` — must pass
2. `cd waha && yarn test --watchman=false` — must pass
3. `cd waha-dashboard && npm run generate` — must pass
4. Manual: restart session, verify error message is descriptive
5. Manual: test Plus pages on Core instance, verify "Requires WAHA Plus" toast
6. Manual: create scoped API key, verify session dropdown shows session names
7. Manual: disconnect network, verify WebSocket shows reconnect button

## File Change Summary

| File | Change Type | Phase |
|------|------------|-------|
| `waha-dashboard/composables/useWahaApi.ts` | Error helper + 403 handler | 1 |
| `waha-dashboard/pages/Sessions.vue` | Error handling (10 catch blocks) | 1 |
| `waha-dashboard/pages/index.vue` | Error handling | 1 |
| `waha-dashboard/pages/Workers.vue` | Error handling | 1 |
| `waha-dashboard/pages/Settings.vue` | Error handling | 1 |
| `waha-dashboard/pages/event-monitor.vue` | WebSocket reconnect | 7 |
| `waha-dashboard/pages/plus/index.vue` | Error handling | 1 |
| `waha-dashboard/pages/plus/templates.vue` | Error handling + loading state | 1, 8 |
| `waha-dashboard/pages/plus/autoreply.vue` | Error handling + loading state | 1, 8 |
| `waha-dashboard/pages/plus/schedule.vue` | Error handling + loading state | 1, 8 |
| `waha-dashboard/pages/plus/contacts.vue` | Error handling + loading state | 1, 8 |
| `waha-dashboard/pages/plus/analytics.vue` | Error handling + loading state | 1, 8 |
| `waha-dashboard/pages/plus/apikeys.vue` | Error handling + session bug fix | 1 |
| `waha-dashboard/pages/plus/engines.vue` | Error handling | 1 |
| `waha-dashboard/pages/plus/mcp.vue` | Error handling | 1 |
| `waha-dashboard/pages/plus/skills.vue` | Error handling | 1 |
| `waha/src/api/chatting.controller.ts` | bare Error → HTTP exception | 2 |
| `waha/src/core/engines/gows/session.gows.core.ts` | cancelEvent, forwardMessage, deleteGroup, setPresence | 2, 3 |
| `waha/src/core/engines/wpp/session.wpp.core.ts` | bare Error → ServiceUnavailableException | 2 |
| `waha/src/core/engines/noweb/session.noweb.core.ts` | blockContact, deleteGroup, getGroup | 2, 4 |
| `waha/src/core/engines/webjs/session.webjs.core.ts` | Channel stub messages | 5 |
| `waha/src/plus/mcp/waha.mcp.controller.ts` | bare Error → HTTP exception | 2 |
| `waha/src/core/media/MediaManager.ts` | bare Error → HTTP exception | 2 |
| `waha/src/plus/schedule.service.ts` | bare Error → HTTP exception | 2 |
| `waha/src/core/storage/sql/SqlKVRepository.ts` | Improve error message | 2 |
| `waha/src/apps/chatwoot/error/ChatWootErrorReporter.ts` | Fix dead code | 6 |
| `waha/src/apps/chatwoot/consumers/waha/session.status.ts` | Fix empty catch | 6 |
