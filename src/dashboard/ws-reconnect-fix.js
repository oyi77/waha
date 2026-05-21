/**
 * WAHA WebSocket Reconnection Fix
 * 
 * Improves event monitor stability with:
 * - Exponential backoff reconnection
 * - Unlimited retry attempts
 * - Proper close code handling
 * - Auth token refresh on 401
 */
(function () {
  'use strict';

  const MAX_BACKOFF_MS = 30000;
  const INITIAL_BACKOFF_MS = 1000;
  const BACKOFF_MULTIPLIER = 1.5;

  const CLOSE_CODES = {
    NORMAL: 1000,
    GOING_AWAY: 1001,
    PROTOCOL_ERROR: 1002,
    UNSUPPORTED_DATA: 1003,
    POLICY_VIOLATION: 1008,
    INTERNAL_ERROR: 1011,
    AUTH_FAILED: 4002,
  };

  const AUTH_ERROR_CODES = [
    CLOSE_CODES.POLICY_VIOLATION,
    CLOSE_CODES.AUTH_FAILED,
  ];

  function patchEventMonitor() {
    const originalConnect = window.connectWebSocket;
    if (!originalConnect) {
      console.log('[WS-Fix] Event monitor not found, will retry...');
      return false;
    }

    let reconnectAttempts = 0;
    let reconnectTimer = null;
    let currentBackoff = INITIAL_BACKOFF_MS;

    window.connectWebSocket = function (apiKey, onMessage, onStatusChange) {
      let ws = null;
      let intentionallyClosed = false;

      function getBackoffDelay() {
        const delay = Math.min(
          currentBackoff * Math.pow(BACKOFF_MULTIPLIER, reconnectAttempts),
          MAX_BACKOFF_MS
        );
        return delay + Math.random() * 1000;
      }

      function scheduleReconnect(reason) {
        if (intentionallyClosed) {
          console.log('[WS-Fix] Intentionally closed, not reconnecting');
          return;
        }

        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
        }

        reconnectAttempts++;
        const delay = getBackoffDelay();

        console.log(
          `[WS-Fix] Scheduling reconnect #${reconnectAttempts} in ${Math.round(delay)}ms (reason: ${reason})`
        );

        if (onStatusChange) {
          onStatusChange('reconnecting', reconnectAttempts, delay);
        }

        reconnectTimer = setTimeout(() => {
          console.log(`[WS-Fix] Attempting reconnect #${reconnectAttempts}...`);
          connect();
        }, delay);
      }

      async function refreshAuthAndReconnect() {
        console.log('[WS-Fix] Auth failed, refreshing token...');
        try {
          const response = await fetch('/api/dashboard/config', {
            credentials: 'same-origin',
          });

          if (response.status === 401) {
            console.error('[WS-Fix] Auth refresh failed, redirecting to login');
            window.location.href = '/dashboard/login.html';
            return;
          }

          const config = await response.json();
          if (config.apiKey) {
            console.log('[WS-Fix] Auth token refreshed, reconnecting...');
            apiKey = config.apiKey;
            scheduleReconnect('auth-refreshed');
          } else {
            console.error('[WS-Fix] No API key in config response');
            scheduleReconnect('auth-failed');
          }
        } catch (error) {
          console.error('[WS-Fix] Auth refresh error:', error);
          scheduleReconnect('auth-error');
        }
      }

      function connect() {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
          console.log('[WS-Fix] Already connected or connecting');
          return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws?x-api-key=${apiKey}&session=*`;

        console.log(`[WS-Fix] Connecting to ${protocol}//${window.location.host}/ws...`);

        try {
          ws = new WebSocket(wsUrl);

          ws.onopen = function () {
            console.log('[WS-Fix] Connected successfully');
            reconnectAttempts = 0;
            currentBackoff = INITIAL_BACKOFF_MS;

            if (onStatusChange) {
              onStatusChange('connected', 0, 0);
            }
          };

          ws.onmessage = function (event) {
            if (onMessage) {
              onMessage(event);
            }
          };

          ws.onerror = function (error) {
            console.error('[WS-Fix] WebSocket error:', error);
          };

          ws.onclose = function (event) {
            const code = event.code;
            const reason = event.reason || 'No reason provided';

            console.log(
              `[WS-Fix] Disconnected - Code: ${code}, Reason: ${reason}`
            );

            if (intentionallyClosed) {
              console.log('[WS-Fix] Connection closed intentionally');
              return;
            }

            if (AUTH_ERROR_CODES.includes(code)) {
              refreshAuthAndReconnect();
            } else if (code === CLOSE_CODES.NORMAL) {
              console.log('[WS-Fix] Normal closure, not reconnecting');
            } else {
              scheduleReconnect(`close-code-${code}`);
            }
          };
        } catch (error) {
          console.error('[WS-Fix] Connection error:', error);
          scheduleReconnect('connection-error');
        }
      }

      connect();

      return {
        close: function () {
          console.log('[WS-Fix] Closing connection intentionally');
          intentionallyClosed = true;
          if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
          }
          if (ws) {
            ws.close(CLOSE_CODES.NORMAL, 'User closed connection');
          }
        },
        send: function (data) {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          } else {
            console.warn('[WS-Fix] Cannot send, not connected');
          }
        },
        get readyState() {
          return ws ? ws.readyState : WebSocket.CLOSED;
        },
      };
    };

    console.log('[WS-Fix] Event monitor patched successfully');
    return true;
  }

  function init() {
    if (window.location.pathname.includes('/event-monitor')) {
      console.log('[WS-Fix] Event monitor page detected, applying patch...');
      
      const maxAttempts = 10;
      let attempts = 0;

      const tryPatch = setInterval(() => {
        attempts++;
        if (patchEventMonitor()) {
          clearInterval(tryPatch);
          console.log('[WS-Fix] Patch applied successfully');
        } else if (attempts >= maxAttempts) {
          clearInterval(tryPatch);
          console.warn('[WS-Fix] Failed to patch after', maxAttempts, 'attempts');
        }
      }, 500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
