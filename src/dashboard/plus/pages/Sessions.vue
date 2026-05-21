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
        <div class="page-title">◎ Sessions</div>
        <div class="page-subtitle">WhatsApp session management</div>
      </div>
      <div
        style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap"
      >
        <button class="btn-ghost" @click="loadSessions">⟳ Refresh</button>
        <button
          class="btn-secondary"
          :disabled="stoppedCount === 0"
          @click="startAllStopped"
        >
          ▶ Start All ({{ stoppedCount }})
        </button>
        <button
          class="btn-ghost"
          :disabled="workingCount === 0"
          @click="stopAllWorking"
        >
          ⏹ Stop All ({{ workingCount }})
        </button>
        <button class="btn-primary" @click="showCreate = true">
          + New Session
        </button>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="filter-bar">
      <div class="filter-tabs">
        <button
          v-for="tab in statusTabs"
          :key="tab.value"
          class="filter-tab"
          :class="{ active: filterStatus === tab.value }"
          @click="filterStatus = tab.value"
        >
          {{ tab.label }}
          <span class="filter-count">{{ tabCount(tab.value) }}</span>
        </button>
      </div>
      <input
        v-model="searchQuery"
        class="filter-search"
        placeholder="Search sessions..."
        type="search"
      />
    </div>

    <!-- Bulk Action Bar -->
    <div v-if="selected.size > 0" class="bulk-bar">
      <span class="bulk-label">{{ selected.size }} selected</span>
      <button class="btn-secondary" @click="bulkStart">▶ Start</button>
      <button class="btn-ghost" @click="bulkStop">⏹ Stop</button>
      <button class="btn-danger" @click="bulkDelete">✕ Delete</button>
      <button
        class="btn-ghost"
        style="margin-left: auto"
        @click="selected.clear()"
      >
        ✕ Clear
      </button>
    </div>

    <div v-if="loading" class="empty-state">
      <div class="empty-state-icon">⟳</div>
      <div class="empty-state-text">Loading sessions…</div>
    </div>

    <div v-else-if="filteredSessions.length === 0" class="empty-state">
      <div class="empty-state-icon">◎</div>
      <div class="empty-state-text">
        {{
          sessions.length === 0
            ? "No sessions yet. Create one to get started."
            : "No sessions match your filter."
        }}
      </div>
    </div>

    <div v-else class="sessions-grid stagger">
      <div
        v-for="session in filteredSessions"
        :key="session.name"
        class="session-card card"
        :class="{ selected: selected.has(session.name) }"
      >
        <div class="session-card-top">
          <div class="session-left">
            <label class="session-checkbox" @click.stop>
              <input
                type="checkbox"
                :checked="selected.has(session.name)"
                @change="toggleSelect(session.name)"
              />
            </label>
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
          <div class="session-actions">
            <button
              v-if="session.status === 'FAILED'"
              class="btn-secondary"
              @click="confirmStart(session.name)"
            >
              ↻
            </button>
            <button
              v-if="session.status === 'STOPPED'"
              class="btn-secondary"
              @click="confirmStart(session.name)"
            >
              ▶
            </button>
            <button
              v-if="session.status === 'WORKING'"
              class="btn-ghost"
              @click="confirmRestart(session.name)"
            >
              ↻
            </button>
            <button
              v-if="session.status === 'SCAN_QR_CODE'"
              class="btn-secondary"
              @click="openQr(session.name)"
            >
              ⊡
            </button>
            <button
              class="btn-ghost"
              style="padding: 4px 8px; font-size: 13px"
              @click="editSession(session)"
            >
              ⚙
            </button>
            <button class="btn-danger" @click="confirmDelete(session.name)">
              ✕
            </button>
          </div>
        </div>

        <!-- Tags -->
        <div v-if="getTags(session).length > 0" class="session-tags">
          <span
            v-for="tag in getTags(session)"
            :key="tag"
            class="tag-pill"
            :class="{ active: filterTag === tag }"
            @click="toggleTagFilter(tag)"
          >
            {{ tag }}
          </span>
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

    <!-- Create / Edit Session Modal -->
    <div
      v-if="showCreate || editTarget !== null"
      class="modal-overlay"
      @click.self="closeModal"
    >
      <div class="modal-box">
        <div class="modal-title">
          {{ editTarget !== null ? "Edit Session" : "Create Session" }}
        </div>
        <div class="form-group">
          <label class="form-label">Session Name</label>
          <input
            v-model="form.name"
            :placeholder="editTarget !== null ? '' : 'default'"
            :disabled="editTarget !== null"
          />
        </div>
        <div class="form-group">
          <label class="form-label">Engine</label>
          <select v-model="form.engine">
            <option value="">Auto</option>
            <option v-for="eng in engines" :key="eng" :value="eng">
              {{ eng }}
            </option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Tags (comma-separated)</label>
          <input v-model="form.tags" placeholder="sales, support, bots" />
        </div>
        <div v-if="editTarget === null" class="form-group">
          <label class="form-label">Start on create</label>
          <label class="toggle-switch">
            <input v-model="form.start" type="checkbox" />
            <span class="toggle-slider" />
          </label>
        </div>
        <div style="display: flex; gap: 10px; margin-top: 20px">
          <button class="btn-secondary" style="flex: 1" @click="closeModal">
            Cancel
          </button>
          <button
            class="btn-primary"
            style="flex: 1"
            @click="editTarget !== null ? saveEdit() : createSession()"
          >
            {{ editTarget !== null ? "Save" : "Create" }}
          </button>
        </div>
      </div>
    </div>

    <!-- QR Modal -->
    <div v-if="qrSession" class="modal-overlay" @click.self="qrSession = ''">
      <div class="modal-box" style="text-align: center">
        <div class="modal-title">Scan QR Code — {{ qrSession }}</div>
        <div
          v-if="qrData === 'pending'"
          class="empty-state-text"
          style="padding: 40px 0"
        >
          Waiting for session to be ready…
        </div>
        <div
          v-else-if="qrData === 'timeout'"
          class="empty-state-text"
          style="padding: 40px 0; color: #f59e0b"
        >
          Session did not enter QR state in time.<br />Please try again.
        </div>
        <div v-else-if="qrData" style="margin: 20px auto">
          <img
            :src="qrData"
            alt="QR Code"
            style="max-width: 260px; border-radius: 8px"
          />
        </div>
        <div v-else class="empty-state-text" style="padding: 40px 0">
          Loading QR…
        </div>
        <button
          class="btn-ghost"
          style="margin-top: 12px"
          @click="qrSession = ''"
        >
          Close
        </button>
      </div>
    </div>

    <!-- Confirm Modal -->
    <div
      v-if="confirmAction"
      class="modal-overlay"
      @click.self="confirmAction = null"
    >
      <div class="modal-box">
        <div class="modal-title">{{ confirmAction.title }}</div>
        <p
          style="color: var(--text-muted); font-size: 13px; margin-bottom: 24px"
        >
          {{ confirmAction.message }}
        </p>
        <div style="display: flex; gap: 10px">
          <button
            class="btn-ghost"
            style="flex: 1"
            @click="confirmAction = null"
          >
            Cancel
          </button>
          <button
            :class="confirmAction.danger ? 'btn-danger' : 'btn-primary'"
            style="flex: 1"
            @click="confirmAction.fn()"
          >
            {{ confirmAction.label }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from "vue";
import { useWahaApi } from "~/composables/useWahaApi";
import { useToast } from "~/composables/useToast";

interface Session {
  name: string;
  status: string;
  engine?: string;
  me?: { id?: string; pushName?: string };
  metadata?: Record<string, string>;
}

interface ConfirmAction {
  title: string;
  message: string;
  label: string;
  danger: boolean;
  fn: () => void;
}

const { get, post, put, del } = useWahaApi();
const { success, error } = useToast();

const sessions = ref<Session[]>([]);
const engines = ref<string[]>([]);
const loading = ref(true);
const showCreate = ref(false);
const qrSession = ref("");
const qrData = ref("");
const confirmAction = ref<ConfirmAction | null>(null);
const editTarget = ref<string | null>(null);
const selected = ref<Set<string>>(new Set());

// Filter state
const filterStatus = ref("ALL");
const searchQuery = ref("");
const filterTag = ref("");

const form = reactive({
  name: "",
  engine: "",
  tags: "",
  start: true,
});

const statusTabs = [
  { label: "All", value: "ALL" },
  { label: "Working", value: "WORKING" },
  { label: "Stopped", value: "STOPPED" },
  { label: "Scan QR", value: "SCAN_QR_CODE" },
  { label: "Failed", value: "FAILED" },
];

const stoppedCount = computed(
  () => sessions.value.filter((s) => s.status === "STOPPED").length,
);
const workingCount = computed(
  () => sessions.value.filter((s) => s.status === "WORKING").length,
);

const allTags = computed(() => {
  const tags = new Set<string>();
  for (const s of sessions.value) {
    for (const tag of getTags(s)) {
      tags.add(tag);
    }
  }
  return Array.from(tags).sort();
});

const filteredSessions = computed(() => {
  let list = sessions.value;

  if (filterStatus.value !== "ALL") {
    list = list.filter((s) => s.status === filterStatus.value);
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter((s) => s.name.toLowerCase().includes(q));
  }

  if (filterTag.value) {
    list = list.filter((s) => getTags(s).includes(filterTag.value));
  }

  return list;
});

function tabCount(status: string): number {
  if (status === "ALL") return sessions.value.length;
  return sessions.value.filter((s) => s.status === status).length;
}

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

function getTags(session: Session): string[] {
  const tags = session.metadata?.tags;
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  if (typeof tags === "string") {
    return tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

function toggleTagFilter(tag: string) {
  filterTag.value = filterTag.value === tag ? "" : tag;
}

// ---- Load ----
async function loadSessions() {
  loading.value = true;
  try {
    const data = await get<Session[]>("/api/sessions?all=true");
    sessions.value = data;
  } catch (e) {
    error("Failed to load sessions");
  } finally {
    loading.value = false;
  }
}

async function loadEngines() {
  try {
    const data = await get<{ name: string }[]>("/api/engines");
    engines.value = data.map((e) => e.name);
  } catch {}
}

// ---- Create ----
async function createSession() {
  try {
    const name = form.name.trim() || "default";
    const body: Record<string, unknown> = { name };
    if (form.engine) body.engine = form.engine;
    if (form.tags.trim()) {
      body.metadata = {
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .join(","),
      };
    }
    await post("/api/sessions", body);
    if (form.start) {
      await post(`/api/sessions/${name}/start`);
    }
    success("Session created");
    closeModal();
    await loadSessions();
  } catch (e) {
    error("Failed to create session");
  }
}

// ---- Edit ----
function editSession(session: Session) {
  editTarget.value = session.name;
  form.name = session.name;
  form.engine = session.engine ?? "";
  form.tags = getTags(session).join(", ");
}

async function saveEdit() {
  if (!editTarget.value) return;
  try {
    const config: Record<string, unknown> = {};
    if (form.engine) config.engine = form.engine;
    config.metadata = {
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .join(","),
    };
    await put(`/api/sessions/${editTarget.value}`, { config });
    success("Session updated");
    closeModal();
    await loadSessions();
  } catch (e) {
    error("Failed to update session");
  }
}

// ---- Start / Stop ----
function confirmStart(name: string) {
  confirmAction.value = {
    title: "Start Session",
    message: `Start session "${name}"?`,
    label: "Start",
    danger: false,
    fn: async () => {
      confirmAction.value = null;
      try {
        await post(`/api/sessions/${name}/start`);
        success(`Session ${name} started`);
        await loadSessions();
      } catch {
        error("Failed to start session");
      }
    },
  };
}

function confirmStop(name: string) {
  confirmAction.value = {
    title: "Stop Session",
    message: `Stop session "${name}"?`,
    label: "Stop",
    danger: true,
    fn: async () => {
      confirmAction.value = null;
      try {
        await post(`/api/sessions/${name}/stop`);
        success(`Session ${name} stopped`);
        await loadSessions();
      } catch {
        error("Failed to stop session");
      }
    },
  };
}

// ---- Restart ----
function confirmRestart(name: string) {
  confirmAction.value = {
    title: "Restart Session",
    message: `Restart session "${name}"? This will stop and start it again.`,
    label: "Restart",
    danger: false,
    fn: async () => {
      confirmAction.value = null;
      try {
        await post(`/api/sessions/${name}/restart`);
        success(`Session ${name} restarting`);
        await loadSessions();
      } catch {
        error("Failed to restart session");
      }
    },
  };
}

// ---- Delete ----
function confirmDelete(name: string) {
  confirmAction.value = {
    title: "Delete Session",
    message: `Permanently delete session "${name}"? This cannot be undone.`,
    label: "Delete",
    danger: true,
    fn: async () => {
      confirmAction.value = null;
      try {
        await del(`/api/sessions/${name}`);
        success(`Session ${name} deleted`);
        selected.value.delete(name);
        await loadSessions();
      } catch {
        error("Failed to delete session");
      }
    },
  };
}

// ---- Bulk ----
function toggleSelect(name: string) {
  if (selected.value.has(name)) {
    selected.value.delete(name);
  } else {
    selected.value.add(name);
  }
}

async function bulkStart() {
  const names = Array.from(selected.value);
  confirmAction.value = {
    title: "Start Sessions",
    message: `Start ${names.length} session(s)?`,
    label: "Start",
    danger: false,
    fn: async () => {
      confirmAction.value = null;
      let ok = 0;
      for (const name of names) {
        try {
          await post(`/api/sessions/${name}/start`);
          ok++;
        } catch {}
      }
      selected.value.clear();
      success(`Started ${ok} session(s)`);
      await loadSessions();
    },
  };
}

async function bulkStop() {
  const names = Array.from(selected.value);
  confirmAction.value = {
    title: "Stop Sessions",
    message: `Stop ${names.length} session(s)?`,
    label: "Stop",
    danger: true,
    fn: async () => {
      confirmAction.value = null;
      let ok = 0;
      for (const name of names) {
        try {
          await post(`/api/sessions/${name}/stop`);
          ok++;
        } catch {}
      }
      selected.value.clear();
      success(`Stopped ${ok} session(s)`);
      await loadSessions();
    },
  };
}

async function bulkDelete() {
  const names = Array.from(selected.value);
  confirmAction.value = {
    title: "Delete Sessions",
    message: `Delete ${names.length} session(s)? This cannot be undone.`,
    label: "Delete",
    danger: true,
    fn: async () => {
      confirmAction.value = null;
      let ok = 0;
      for (const name of names) {
        try {
          await del(`/api/sessions/${name}`);
          ok++;
        } catch {}
      }
      selected.value.clear();
      success(`Deleted ${ok} session(s)`);
      await loadSessions();
    },
  };
}

// ---- Start All / Stop All ----
async function startAllStopped() {
  const stopped = sessions.value.filter((s) => s.status === "STOPPED");
  if (stopped.length === 0) return;
  confirmAction.value = {
    title: "Start All Stopped",
    message: `Start all ${stopped.length} stopped session(s)?`,
    label: "Start All",
    danger: false,
    fn: async () => {
      confirmAction.value = null;
      let ok = 0;
      for (const s of stopped) {
        try {
          await post(`/api/sessions/${s.name}/start`);
          ok++;
        } catch {}
      }
      success(`Started ${ok} session(s)`);
      await loadSessions();
    },
  };
}

async function stopAllWorking() {
  const working = sessions.value.filter((s) => s.status === "WORKING");
  if (working.length === 0) return;
  confirmAction.value = {
    title: "Stop All Working",
    message: `Stop all ${working.length} working session(s)?`,
    label: "Stop All",
    danger: true,
    fn: async () => {
      confirmAction.value = null;
      let ok = 0;
      for (const s of working) {
        try {
          await post(`/api/sessions/${s.name}/stop`);
          ok++;
        } catch {}
      }
      success(`Stopped ${ok} session(s)`);
      await loadSessions();
    },
  };
}

// ---- QR ----
async function openQr(name: string) {
  qrSession.value = name;
  qrData.value = "";
  try {
    // If session is not in SCAN_QR_CODE, it may still be starting up.
    // Poll until it's ready (max 30s)
    const session = sessions.value.find((s) => s.name === name);
    if (session && session.status !== "SCAN_QR_CODE") {
      qrData.value = "pending"; // signals "waiting for session to be ready"
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const updated = sessions.value.find((s) => s.name === name);
        if (updated?.status === "SCAN_QR_CODE") {
          break;
        }
        if (updated?.status === "WORKING" || updated?.status === "FAILED") {
          qrData.value = "";
          error("Session changed status while waiting for QR");
          return;
        }
      }
      if (qrData.value === "pending") {
        qrData.value = "timeout";
        error("Session did not enter SCAN_QR_CODE state in time");
        return;
      }
    }

    const data = await get<{ mimetype?: string; data?: string }>(
      `/api/${name}/auth/qr`,
      { headers: { Accept: "application/json" } } as any,
    );
    qrData.value =
      data?.mimetype && data?.data
        ? `data:${data.mimetype};base64,${data.data}`
        : "";
  } catch (err: unknown) {
    const msg =
      (err as { data?: { message?: string } })?.data?.message ??
      "Failed to load QR code";
    error(msg);
    qrData.value = "";
  }
}

// ---- Modal helpers ----
function closeModal() {
  showCreate.value = false;
  editTarget.value = null;
  form.name = "";
  form.engine = "";
  form.tags = "";
  form.start = true;
}

// ---- Poll ----
let pollTimer: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
  await Promise.allSettled([loadSessions(), loadEngines()]);
  pollTimer = setInterval(loadSessions, 10000);
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
  gap: 10px;
  transition: border-color 0.15s;
}

.session-card.selected {
  border-color: var(--accent);
  background: rgba(34, 197, 94, 0.04);
}

.session-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.session-left {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.session-checkbox {
  margin-top: 2px;
  cursor: pointer;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.session-checkbox input {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--accent);
}

.session-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 6px;
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
  margin-right: 4px;
}

.session-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.session-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-pill {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 99px;
  background: rgba(34, 197, 94, 0.1);
  color: var(--accent);
  border: 1px solid rgba(34, 197, 94, 0.2);
  cursor: pointer;
  transition: all 0.15s;
}

.tag-pill:hover,
.tag-pill.active {
  background: rgba(34, 197, 94, 0.2);
  border-color: var(--accent);
}

.session-me {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-muted);
  border-top: 1px solid var(--border);
  padding-top: 10px;
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

/* Filter Bar */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.filter-tabs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  flex: 1;
}

.filter-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.filter-tab:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.filter-tab.active {
  background: rgba(34, 197, 94, 0.12);
  border-color: var(--accent);
  color: var(--accent);
}

.filter-count {
  font-size: 11px;
  padding: 1px 5px;
  border-radius: 99px;
  background: var(--surface-hover);
  color: var(--text-dim);
}

.filter-tab.active .filter-count {
  background: rgba(34, 197, 94, 0.2);
  color: var(--accent);
}

.filter-search {
  padding: 7px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  min-width: 200px;
}

.filter-search:focus {
  outline: none;
  border-color: var(--accent);
}

/* Bulk Bar */
.bulk-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: rgba(34, 197, 94, 0.08);
  border: 1px solid rgba(34, 197, 94, 0.2);
  border-radius: var(--radius);
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.bulk-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  margin-right: 4px;
}
</style>
