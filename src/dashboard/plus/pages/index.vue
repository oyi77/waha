<template>
  <div class="page-wrapper">
    <div class="page-header">
      <div>
        <div class="page-title">⊞ Dashboard</div>
        <div class="page-subtitle">WAHA Core — session overview</div>
      </div>
    </div>

    <!-- Stat cards -->
    <div class="grid-4 stagger" style="margin-bottom: 32px">
      <div class="stat-card card">
        <div class="stat-card-label">Total Sessions</div>
        <div class="stat-card-value">{{ sessions.length }}</div>
      </div>
      <div class="stat-card card">
        <div class="stat-card-label">Working</div>
        <div class="stat-card-value" style="color: var(--accent)">
          {{ workingCount }}
        </div>
      </div>
      <div class="stat-card card">
        <div class="stat-card-label">Stopped</div>
        <div class="stat-card-value" style="color: var(--text-dim)">
          {{ stoppedCount }}
        </div>
      </div>
      <div class="stat-card card">
        <div class="stat-card-label">Failed</div>
        <div class="stat-card-value" style="color: #ef4444">
          {{ failedCount }}
        </div>
      </div>
    </div>

    <div class="section-title" style="margin-bottom: 16px">Sessions</div>

    <div v-if="loading && sessions.length === 0" class="empty-state">
      <div class="empty-state-icon">⟳</div>
      <div class="empty-state-text">Loading dashboard…</div>
    </div>

    <div v-else-if="sessions.length === 0" class="empty-state">
      <div class="empty-state-icon">◎</div>
      <div class="empty-state-text">
        No sessions yet. Go to Sessions to create one.
      </div>
    </div>

    <div v-else class="sessions-grid stagger">
      <div
        v-for="session in sessions"
        :key="session.name"
        class="session-card card"
      >
        <div class="session-card-top">
          <div>
            <div class="session-name">{{ session.name }}</div>
            <div class="session-meta">
              <span class="badge" :class="statusClass(session.status)">
                <span class="badge-dot" />{{ session.status }}
              </span>
              <span
                class="badge"
                :class="`engine-${(session.engine || 'noweb').toLowerCase()}`"
              >
                {{ session.engine || "NOWEB" }}
              </span>
            </div>
          </div>
        </div>

        <div v-if="session.me" class="session-me">
          <span class="me-avatar">{{ avatarLetter(session.me.pushName) }}</span>
          <span>{{ session.me.pushName }}</span>
          <span class="text-dim" style="font-size: 12px"
            >+{{ session.me.id?.replace("@s.whatsapp.net", "") }}</span
          >
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useWahaApi } from "~/composables/useWahaApi";
import { useToast } from "~/composables/useToast";

interface Session {
  name: string;
  status: string;
  engine?: string;
  me?: { id?: string; pushName?: string };
}

const { get } = useWahaApi();
const { error } = useToast();

const sessions = ref<Session[]>([]);
const loading = ref(true);

const workingCount = computed(
  () => sessions.value.filter((s) => s.status === "WORKING").length,
);
const stoppedCount = computed(
  () => sessions.value.filter((s) => s.status === "STOPPED").length,
);
const failedCount = computed(
  () => sessions.value.filter((s) => s.status === "FAILED").length,
);

function statusClass(status: string): string {
  const map: Record<string, string> = {
    WORKING: "badge-working",
    STARTING: "badge-starting",
    SCAN_QR_CODE: "badge-scan",
    STOPPED: "badge-stopped",
    FAILED: "badge-failed",
  };
  return map[status] ?? "badge-stopped";
}

function avatarLetter(name?: string): string {
  return (name?.[0] ?? "?").toUpperCase();
}

async function loadSessions() {
  try {
    const data = await get<Session[]>("/api/sessions?all=true");
    sessions.value = data;
  } catch (e) {
    error("Failed to load dashboard data");
  } finally {
    loading.value = false;
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
  await loadSessions();
  pollTimer = setInterval(loadSessions, 15000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<style scoped>
.sessions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.session-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.session-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.session-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 8px;
}

.session-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  display: inline-block;
}

.session-me {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-muted);
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

.me-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(34, 197, 94, 0.15);
  color: var(--accent);
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
}

.text-dim {
  color: var(--text-dim);
}
</style>
