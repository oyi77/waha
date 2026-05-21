<template>
  <div class="page-wrapper">
    <div
      class="page-header"
      style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;
      "
    >
      <div>
        <div class="page-title">◉ Event Monitor</div>
        <div class="page-subtitle">Live webhook event stream</div>
      </div>
      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap">
        <span
          class="badge"
          :class="connected ? 'badge-working' : 'badge-failed'"
        >
          <span class="badge-dot" />{{
            connected ? "Connected" : "Disconnected"
          }}
        </span>
        <span
          class="connection-dot"
          :class="connected ? 'dot-connected' : 'dot-disconnected'"
        />
        <button class="btn-ghost" @click="togglePause">
          {{ paused ? "▶ Resume" : "⏸ Pause" }}
        </button>
        <button class="btn-ghost" @click="clearEvents">⎑ Clear</button>
      </div>
    </div>

    <div class="terminal-container">
      <div class="terminal-header">
        <div class="terminal-dots" aria-hidden="true">
          <span class="dot red"></span>
          <span class="dot yellow"></span>
          <span class="dot green"></span>
        </div>
        <div class="terminal-title">bash — WAHA Event Stream</div>
      </div>
      <div class="terminal-body font-mono" ref="terminalBody">
        <div v-if="showReconnectButton" class="terminal-empty">
          > Connection lost after {{ MAX_RECONNECT }} attempts.
          <button class="btn-secondary" style="margin-left: 8px; font-size: 13px" @click="manualReconnect">
            Reconnect
          </button>
        </div>
        <div v-else-if="events.length === 0" class="terminal-empty">
          > Waiting for incoming events...
        </div>
        <div v-for="(evt, idx) in events" :key="idx" class="event-row">
          <span class="event-time">[{{ evt.time }}]</span>
          <span class="event-session">[{{ evt.session }}]</span>
          <span class="event-type">{{ evt.type }}</span>
          <span
            class="event-payload"
            :class="{ 'event-payload-truncated': evt.payload.length > 200 && !evt.expanded }"
            @click="evt.expanded = !evt.expanded"
            :role="evt.payload.length > 200 ? 'button' : undefined"
            :tabindex="evt.payload.length > 200 ? 0 : undefined"
            @keydown.enter="evt.expanded = !evt.expanded"
          >{{ evt.expanded || evt.payload.length <= 200 ? evt.payload : evt.payload.slice(0, 200) + '...' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">


interface EventItem {
  time: string;
  session: string;
  type: string;
  payload: string;
  expanded?: boolean;
}

const { init, apiKey } = useWahaApi();
const { error } = useToast();

const events = ref<EventItem[]>([]);
const connected = ref(false);
const paused = ref(false);
const terminalBody = ref<HTMLElement | null>(null);

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let unmounted = false;
let reconnectAttempts = 0;
const MAX_RECONNECT = 10;

function formatTime(date: Date) {
  return date.toTimeString().split(" ")[0];
}

async function connect() {
  if (typeof window === "undefined" || unmounted) return;
  // Ensure API key is loaded before connecting
  await init();
  if (unmounted) return;

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  // Get API key for auth
  const key = apiKey.value;
  const authUrl = key
    ? `${wsUrl}${wsUrl.includes("?") ? "&" : "?"}x-api-key=${encodeURIComponent(key)}`
    : wsUrl;

  try {
    ws = new WebSocket(authUrl);

    ws.onopen = () => {
      if (unmounted) {
        ws?.close();
        return;
      }
      connected.value = true;
      reconnectAttempts = 0;
      pushLog("system", "connection", `Connected to ${wsUrl}`);
    };

    ws.onmessage = (message) => {
      if (paused.value || unmounted) return;

      try {
        const data = JSON.parse(message.data);
        const eventName = data.event || "unknown";
        const sessionName = data.session || "system";
        const payloadStr = data.payload ? JSON.stringify(data.payload) : "{}";
        const truncated =
          payloadStr.length > 200
            ? payloadStr.substring(0, 200) + "..."
            : payloadStr;

        pushLog(sessionName, eventName, truncated);
      } catch (e) {
        pushLog(
          "system",
          "error",
          "Failed to parse incoming WebSocket message",
        );
      }
    };

    ws.onclose = (event) => {
      connected.value = false;
      if (unmounted) return;
      // Don't reconnect if auth failed
      if (event.code === 1008 || event.code === 4002) {
        pushLog(
          "system",
          "error",
          `WebSocket auth failed (code ${event.code}). Check API key.`,
        );
        return;
      }
      pushLog("system", "connection", "Disconnected. Reconnecting with backoff...");
      scheduleReconnect();
    };

    ws.onerror = () => {
      // Let onclose handle the reconnect
    };
  } catch (err) {
    error("Failed to initialize WebSocket");
    if (!unmounted) scheduleReconnect();
  }
}

const showReconnectButton = ref(false);

function scheduleReconnect() {
  if (unmounted) return;
  if (reconnectAttempts >= MAX_RECONNECT) {
    showReconnectButton.value = true;
    return;
  }
  reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 16000);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    connect();
  }, delay);
}

function manualReconnect() {
  showReconnectButton.value = false;
  reconnectAttempts = 0;
  connect();
}

function pushLog(session: string, type: string, payload: string) {
  const now = new Date();
  events.value.push({
    time: formatTime(now),
    session,
    type,
    payload,
    expanded: false,
  });

  if (events.value.length > 100) {
    events.value.shift();
  }

  if (!paused.value) {
    nextTick(() => {
      if (terminalBody.value) {
        terminalBody.value.scrollTop = terminalBody.value.scrollHeight;
      }
    });
  }
}

function togglePause() {
  paused.value = !paused.value;
  if (!paused.value) {
    nextTick(() => {
      if (terminalBody.value) {
        terminalBody.value.scrollTop = terminalBody.value.scrollHeight;
      }
    });
  }
}

function clearEvents() {
  events.value = [];
}

onMounted(() => {
  connect();
});

onUnmounted(() => {
  unmounted = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (ws) {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null; // prevent reconnect loop
    // Only close if not already closed/closing
    if (
      ws.readyState === WebSocket.OPEN ||
      ws.readyState === WebSocket.CONNECTING
    ) {
      ws.close();
    }
    ws = null;
  }
});
</script>

<style scoped>
.terminal-container {
  background: #000;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 300px;
}

.terminal-header {
  background: var(--surface);
  padding: 12px 16px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--border);
}

.terminal-dots {
  display: flex;
  gap: 8px;
  margin-right: 16px;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.dot.red {
  background: #ef4444;
}
.dot.yellow {
  background: #eab308;
}
.dot.green {
  background: #22c55e;
}

.terminal-title {
  color: var(--text-dim);
  font-size: 13px;
  font-family: var(--font-mono, monospace);
}

.terminal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-muted);
}

.terminal-empty {
  color: var(--text-dim);
  font-style: italic;
}

.event-row {
  margin-bottom: 8px;
  word-break: break-all;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.event-time {
  color: #8b5cf6;
  white-space: nowrap;
}

.event-session {
  color: #3b82f6;
  white-space: nowrap;
}

.event-type {
  color: var(--accent);
  font-weight: 600;
  white-space: nowrap;
}

.event-payload {
  color: var(--text-muted);
  flex: 1;
}

.event-payload-truncated {
  cursor: pointer;
  text-decoration: underline dotted;
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  display: inline-block;
  margin-right: 6px;
}

.connection-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.dot-connected {
  background: #22c55e;
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
}

.dot-disconnected {
  background: #ef4444;
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.6);
}
</style>
