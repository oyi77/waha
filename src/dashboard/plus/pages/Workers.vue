<template>
  <div class="page-wrapper">
    <div
      class="page-header"
      style="display: flex; align-items: center; justify-content: space-between"
    >
      <div>
        <div class="page-title">⚙ Workers</div>
        <div class="page-subtitle">WAHA worker process management</div>
      </div>
      <div>
        <button class="btn-ghost" @click="load">⟳ Refresh</button>
      </div>
    </div>

    <div v-if="loading" class="empty-state">
      <div class="empty-state-icon">⟳</div>
      <div class="empty-state-text">Loading workers…</div>
    </div>

    <div v-else class="grid-4 stagger">
      <div class="worker-card card">
        <div class="worker-card-top">
          <div class="worker-name">{{ workerLabel }}</div>
          <span class="badge badge-working">
            <span class="badge-dot" />RUNNING
          </span>
        </div>
        <div class="worker-meta">
          <div class="detail-row">
            <span class="detail-key">uptime:</span>
            <span class="detail-val">{{ uptimeFormatted }}</span>
          </div>
          <div class="detail-row" style="align-items: flex-start">
            <span class="detail-key">sessions:</span>
            <span class="detail-val">
              <span
                v-for="(count, eng) in engineCounts"
                :key="eng"
                style="display: block; margin-left: 8px"
              >
                {{ eng }}: {{ count }}
              </span>
              <span v-if="Object.keys(engineCounts).length === 0">0</span>
            </span>
          </div>
        </div>
        <div v-if="sessions.length > 0" class="session-list">
          <div
            v-for="session in sessions"
            :key="session.name"
            class="session-row"
            @click="openSessionDetail(session)"
            style="
              cursor: pointer;
              padding: 6px;
              border-radius: var(--radius-sm);
              transition: background 0.2s;
            "
            onmouseover="this.style.background = 'var(--surface-hover)'"
            onmouseout="this.style.background = 'transparent'"
          >
            <span class="session-name">{{ session.name }}</span>
            <div style="display: flex; gap: 6px">
              <span
                v-if="session.engine"
                class="badge"
                :class="
                  resolveEngine(session.engine)
                    ? `engine-${resolveEngine(session.engine).toLowerCase()}`
                    : ''
                "
              >
                {{ resolveEngine(session.engine) || session.engine }}
              </span>
              <span class="badge" :class="sessionStatusClass(session.status)">
                <span class="badge-dot" />{{ session.status }}
              </span>
            </div>
          </div>
        </div>
        <div v-else class="empty-sessions">No sessions assigned</div>
      </div>
    </div>

    <!-- Session Detail Modal -->
    <div
      v-if="selectedSession"
      class="modal-overlay"
      @click.self="closeSessionDetail"
    >
      <div class="modal-box">
        <div
          class="modal-title"
          style="
            display: flex;
            justify-content: space-between;
            align-items: center;
          "
        >
          <span
            >Session:
            <span style="font-family: var(--font-mono)">{{
              selectedSession.name
            }}</span></span
          >
          <button
            class="btn-ghost"
            @click="closeSessionDetail"
            style="padding: 4px 8px"
          >
            ✕
          </button>
        </div>

        <div
          style="
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-bottom: 24px;
          "
        >
          <div class="detail-row">
            <span class="detail-key">Status:</span>
            <span
              class="badge"
              :class="sessionStatusClass(selectedSession.status)"
            >
              <span class="badge-dot" />{{ selectedSession.status }}
            </span>
          </div>
          <div class="detail-row">
            <span class="detail-key">Engine:</span>
            <span
              v-if="resolveEngine(selectedSession.engine)"
              class="badge"
              :class="`engine-${resolveEngine(selectedSession.engine).toLowerCase()}`"
            >
              {{ resolveEngine(selectedSession.engine) }}
            </span>
            <span v-else class="detail-val">Unknown</span>
          </div>
          <div class="detail-row" v-if="selectedSession.me?.pushName">
            <span class="detail-key">Name:</span>
            <span class="detail-val">{{ selectedSession.me.pushName }}</span>
          </div>
          <div class="detail-row" v-if="selectedSession.me?.id">
            <span class="detail-key">Phone:</span>
            <span class="detail-val">{{
              selectedSession.me.id.split("@")[0]
            }}</span>
          </div>
        </div>

        <div class="section-title">Switch Engine</div>
        <div style="display: flex; gap: 10px">
          <select v-model="engineToSwitch" style="flex: 2">
            <option value="NOWEB">NOWEB</option>
            <option value="WEBJS">WEBJS</option>
            <option value="WPP">WPP</option>
            <option value="GOWS">GOWS</option>
          </select>
          <button
            class="btn-primary"
            style="flex: 1"
            @click="switchEngine"
            :disabled="
              isSwitching ||
              !engineToSwitch ||
              engineToSwitch === selectedSession.engine
            "
          >
            {{ isSwitching ? "Switching..." : "Switch" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useWahaApi } from "~/composables/useWahaApi";
import { useToast } from "~/composables/useToast";

interface SessionMe {
  id: string;
  pushName?: string;
}

interface SessionInfo {
  name: string;
  status: string;
  engine?: string | Record<string, unknown>;
  me?: SessionMe | null;
}

function resolveEngine(
  engine: string | Record<string, unknown> | undefined,
): string {
  if (typeof engine === "string" && engine.length > 0) return engine;
  return "";
}

interface ServerStatus {
  startTimestamp: number;
  uptime: number;
  worker: { id: string | null };
}

const { get, post } = useWahaApi();
const { error, success } = useToast();

const loading = ref(true);
const serverStatus = ref<ServerStatus | null>(null);
const sessions = ref<SessionInfo[]>([]);

const selectedSession = ref<SessionInfo | null>(null);
const engineToSwitch = ref<string>("");
const isSwitching = ref(false);

const workerLabel = computed<string>(() => {
  return serverStatus.value?.worker?.id ?? "default";
});

const uptimeFormatted = computed<string>(() => {
  const ms = serverStatus.value?.uptime ?? 0;
  const totalSecs = Math.floor(ms / 1000);
  const days = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
});

const engineCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {};
  for (const s of sessions.value) {
    const eng = resolveEngine(s.engine);
    if (eng) {
      counts[eng] = (counts[eng] || 0) + 1;
    }
  }
  return counts;
});

function sessionStatusClass(status: string): string {
  const s = (status ?? "").toUpperCase();
  if (s === "WORKING" || s === "ONLINE" || s === "RUNNING")
    return "badge-working";
  if (s === "STARTING") return "badge-starting";
  if (s === "SCAN_QR_CODE") return "badge-scan";
  if (s === "STOPPED" || s === "OFFLINE") return "badge-stopped";
  if (s === "FAILED" || s === "ERROR") return "badge-failed";
  return "badge-stopped";
}

async function load(): Promise<void> {
  try {
    const [status, sessionList] = await Promise.all([
      get<ServerStatus>("/api/server/status"),
      get<SessionInfo[]>("/api/sessions?all=true"),
    ]);

    serverStatus.value = status;

    const list = Array.isArray(sessionList) ? sessionList : [];

    const detailsResults = await Promise.allSettled(
      list.map((s) => get<SessionInfo>(`/api/sessions/${s.name}`)),
    );

    const detailedSessions: SessionInfo[] = [];
    for (let i = 0; i < list.length; i++) {
      const res = detailsResults[i];
      if (res.status === "fulfilled" && res.value) {
        detailedSessions.push(res.value);
      } else {
        detailedSessions.push(list[i]);
      }
    }

    sessions.value = detailedSessions;

    if (selectedSession.value) {
      const updated = detailedSessions.find(
        (s) => s.name === selectedSession.value?.name,
      );
      if (updated) {
        selectedSession.value = updated;
      } else {
        selectedSession.value = null;
      }
    }
  } catch (err: unknown) {
    error("Failed to load worker info");
  } finally {
    loading.value = false;
  }
}

function openSessionDetail(session: SessionInfo) {
  selectedSession.value = session;
  engineToSwitch.value = resolveEngine(session.engine);
}

function closeSessionDetail() {
  selectedSession.value = null;
  engineToSwitch.value = "";
}

async function switchEngine() {
  const newEngine = engineToSwitch.value;
  const name = selectedSession.value?.name;
  if (
    !newEngine ||
    !name ||
    newEngine === resolveEngine(selectedSession.value?.engine)
  )
    return;

  isSwitching.value = true;
  try {
    await post(`/api/sessions/${name}/switch-engine`, { engine: newEngine });
    success(`Successfully switched engine for ${name}`);
    await load();
  } catch (err: unknown) {
    error("Failed to switch engine");
  } finally {
    isSwitching.value = false;
    closeSessionDetail();
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
  await load();
  pollTimer = setInterval(load, 15000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<style scoped>
.worker-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.worker-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.worker-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  word-break: break-all;
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  display: inline-block;
  margin-right: 6px;
}

.worker-meta {
  border-top: 1px solid var(--border);
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  align-items: center;
}

.detail-key {
  color: var(--text-dim);
  text-transform: capitalize;
}

.detail-val {
  color: var(--text-muted);
  font-family: var(--font-mono, monospace);
  word-break: break-all;
  max-width: 60%;
  text-align: right;
}

.session-list {
  border-top: 1px solid var(--border);
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.session-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.session-name {
  font-size: 13px;
  color: var(--text);
  font-family: var(--font-mono, monospace);
  word-break: break-all;
}

.empty-sessions {
  font-size: 13px;
  color: var(--text-dim);
  font-style: italic;
}
</style>
