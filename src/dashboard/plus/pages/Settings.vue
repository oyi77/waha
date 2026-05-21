<template>
  <div class="page-wrapper">
    <div class="page-header">
      <div>
        <div class="page-title">⚙ Settings</div>
        <div class="page-subtitle">WAHA configuration and preferences</div>
      </div>
    </div>

    <div class="settings-sections">
      <!-- Session Lifecycle -->
      <div class="settings-section card">
        <div class="section-title">Session Lifecycle</div>
        <div class="settings-list">
          <div class="settings-row">
            <div class="settings-info">
              <div class="settings-label">Auto-restart on boot</div>
              <div class="settings-desc">
                Automatically restart sessions when WAHA starts
              </div>
            </div>
            <label class="toggle-switch">
              <input v-model="sessionLc.autoRestartOnBoot" type="checkbox" />
              <span class="toggle-slider" />
            </label>
          </div>
          <div class="settings-row">
            <div class="settings-info">
              <div class="settings-label">Auto-restart failed sessions</div>
              <div class="settings-desc">
                Automatically restart sessions that enter FAILED state
              </div>
            </div>
            <label class="toggle-switch">
              <input v-model="sessionLc.autoRestartFailed" type="checkbox" />
              <span class="toggle-slider" />
            </label>
          </div>
          <div class="settings-row">
            <div class="settings-info">
              <div class="settings-label">
                Restart all sessions (not just this worker)
              </div>
              <div class="settings-desc">
                When enabled, restarts every session regardless of worker
                assignment
              </div>
            </div>
            <label class="toggle-switch">
              <input v-model="sessionLc.restartAllSessions" type="checkbox" />
              <span class="toggle-slider" />
            </label>
          </div>
          <div class="settings-row">
            <div class="settings-info">
              <div class="settings-label">Auto-start delay (seconds)</div>
              <div class="settings-desc">
                Wait time before auto-starting sessions on boot
              </div>
            </div>
            <input
              v-model.number="sessionLc.autoStartDelay"
              type="number"
              min="0"
              max="300"
              class="settings-number"
            />
          </div>
          <div class="settings-row">
            <div class="settings-info">
              <div class="settings-label">Default engine</div>
              <div class="settings-desc">
                Engine used when creating sessions without explicit selection
              </div>
            </div>
            <select v-model="settings.defaultEngine" class="settings-select">
              <option value="">Auto (recommended)</option>
              <option v-for="eng in engines" :key="eng" :value="eng">
                {{ eng }}
              </option>
            </select>
          </div>
        </div>
        <div class="settings-actions">
          <button class="btn-primary" :disabled="saving" @click="saveSettings">
            {{ saving ? "Saving…" : "Save Settings" }}
          </button>
        </div>
      </div>

      <!-- Dashboard -->
      <div class="settings-section card">
        <div class="section-title">Dashboard</div>
        <div class="settings-list">
          <div class="settings-row">
            <div class="settings-info">
              <div class="settings-label">Username</div>
              <div class="settings-desc">
                {{ dashboardSettings.username || "—" }} ({{
                  dashboardSettings.source
                }})
              </div>
            </div>
          </div>
          <div class="settings-row">
            <div class="settings-info">
              <div class="settings-label">Change credentials</div>
              <div class="settings-desc">
                Update dashboard username and password
              </div>
            </div>
            <button class="btn-secondary" @click="showCredentials = true">
              Change
            </button>
          </div>
        </div>
      </div>

      <!-- Workers -->
      <div class="settings-section card">
        <div class="section-title">Workers</div>
        <div class="settings-list">
          <div class="settings-row">
            <div class="settings-info">
              <div class="settings-label">Worker ID</div>
              <div class="settings-desc mono">
                {{ serverStatus?.worker?.id ?? "default" }}
              </div>
            </div>
          </div>
          <div class="settings-row">
            <div class="settings-info">
              <div class="settings-label">Uptime</div>
              <div class="settings-desc mono">{{ uptimeFormatted }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- About -->
      <div class="settings-section card">
        <div class="section-title">About</div>
        <div class="settings-list">
          <div class="settings-row">
            <div class="settings-info">
              <div class="settings-label">Version</div>
              <div class="settings-desc mono">
                {{ serverStatus?.version ?? "—" }}
              </div>
            </div>
          </div>
          <div class="settings-row">
            <div class="settings-info">
              <div class="settings-label">Edition</div>
              <div class="settings-desc">
                <span class="badge badge-working">Core</span>
                or
                <span class="badge badge-working">Plus ⚡</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Change Credentials Modal -->
    <div
      v-if="showCredentials"
      class="modal-overlay"
      @click.self="showCredentials = false"
    >
      <div class="modal-box">
        <div class="modal-title">Change Credentials</div>
        <div class="form-group">
          <label class="form-label">Current Password</label>
          <input v-model="credForm.currentPassword" type="password" />
        </div>
        <div class="form-group">
          <label class="form-label">New Username</label>
          <input v-model="credForm.newUsername" />
        </div>
        <div class="form-group">
          <label class="form-label">New Password</label>
          <input v-model="credForm.newPassword" type="password" />
        </div>
        <div style="display: flex; gap: 10px; margin-top: 20px">
          <button
            class="btn-secondary"
            style="flex: 1"
            @click="showCredentials = false"
          >
            Cancel
          </button>
          <button
            class="btn-primary"
            style="flex: 1"
            :disabled="credSaving"
            @click="saveCredentials"
          >
            {{ credSaving ? "Saving…" : "Save" }}
          </button>
        </div>
      </div>
    </div>

    <!-- Toast for errors -->
    <div v-if="credError" class="toast-error">{{ credError }}</div>
    <div v-if="credSuccess" class="toast-success">
      Credentials updated successfully!
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { useWahaApi } from "~/composables/useWahaApi";
import { useToast } from "~/composables/useToast";

interface ServerStatus {
  startTimestamp: number;
  uptime: number;
  worker: { id: string | null };
  version?: string;
}

interface DashboardSettings {
  username: string;
  source: string;
}

interface SessionLcSettings {
  autoRestartOnBoot: boolean;
  autoRestartFailed: boolean;
  restartAllSessions: boolean;
  autoStartDelay: number;
}

const { get, put } = useWahaApi();
const { success, error } = useToast();

const engines = ref<string[]>([]);
const saving = ref(false);
const serverStatus = ref<ServerStatus | null>(null);
const dashboardSettings = ref<DashboardSettings>({ username: "", source: "" });

const showCredentials = ref(false);
const credSaving = ref(false);
const credError = ref("");
const credSuccess = ref(false);

// Session lifecycle settings from API (persisted to DB)
const sessionLc = reactive<SessionLcSettings>({
  autoRestartOnBoot: true,
  autoRestartFailed: false,
  restartAllSessions: false,
  autoStartDelay: 0,
});

// Local UI preferences (not persisted to server)
const settings = reactive({
  defaultEngine: "",
});

const credForm = reactive({
  currentPassword: "",
  newUsername: "",
  newPassword: "",
});

const uptimeFormatted = computed(() => {
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

async function load() {
  try {
    const [status, dashSettings, engList, lcSettings] =
      await Promise.allSettled([
        get<ServerStatus>("/api/server/status"),
        get<DashboardSettings>("/api/dashboard/settings"),
        get<{ name: string }[]>("/api/engines"),
        get<SessionLcSettings>("/api/settings/sessions"),
      ]);

    if (status.status === "fulfilled") {
      serverStatus.value = status.value;
    }
    if (dashSettings.status === "fulfilled") {
      dashboardSettings.value = dashSettings.value;
    }
    if (engList.status === "fulfilled") {
      engines.value = engList.value.map((e) => e.name);
    }
    if (lcSettings.status === "fulfilled") {
      sessionLc.autoRestartOnBoot = lcSettings.value.autoRestartOnBoot;
      sessionLc.autoRestartFailed = lcSettings.value.autoRestartFailed;
      sessionLc.restartAllSessions = lcSettings.value.restartAllSessions;
      sessionLc.autoStartDelay = lcSettings.value.autoStartDelay;
    }
  } catch (err) {
    error("Failed to load settings");
  }
}

async function saveSettings() {
  saving.value = true;
  try {
    await put("/api/settings/sessions", {
      autoRestartOnBoot: sessionLc.autoRestartOnBoot,
      autoRestartFailed: sessionLc.autoRestartFailed,
      restartAllSessions: sessionLc.restartAllSessions,
      autoStartDelay: sessionLc.autoStartDelay,
    });
    success("Settings saved");
  } catch {
    error("Failed to save settings");
  } finally {
    saving.value = false;
  }
}

async function saveCredentials() {
  credError.value = "";
  if (
    !credForm.currentPassword ||
    !credForm.newUsername ||
    !credForm.newPassword
  ) {
    credError.value = "All fields are required";
    return;
  }
  if (credForm.newPassword.length < 6) {
    credError.value = "Password must be at least 6 characters";
    return;
  }
  credSaving.value = true;
  try {
    await put("/api/dashboard/settings/credentials", {
      currentPassword: credForm.currentPassword,
      newUsername: credForm.newUsername,
      newPassword: credForm.newPassword,
    });
    credSuccess.value = true;
    showCredentials.value = false;
    credForm.currentPassword = "";
    credForm.newUsername = "";
    credForm.newPassword = "";
    setTimeout(() => {
      credSuccess.value = false;
    }, 3000);
  } catch (err: unknown) {
    const msg =
      (err as { data?: { message?: string } })?.data?.message ??
      "Failed to update credentials";
    credError.value = msg;
  } finally {
    credSaving.value = false;
  }
}

onMounted(() => {
  load();
});
</script>

<style scoped>
.settings-sections {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 720px;
}

.settings-section {
  padding: 24px;
}

.section-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 16px;
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid var(--border);
}

.settings-row:last-child {
  border-bottom: none;
}

.settings-info {
  flex: 1;
  min-width: 0;
}

.settings-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 2px;
}

.settings-desc {
  font-size: 12px;
  color: var(--text-dim);
}

.settings-desc.mono {
  font-family: var(--font-mono, monospace);
}

.settings-select {
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  min-width: 160px;
}

.settings-select:focus {
  outline: none;
  border-color: var(--accent);
}

.settings-number {
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  min-width: 80px;
  text-align: center;
}

.settings-number:focus {
  outline: none;
  border-color: var(--accent);
}

.settings-actions {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
  flex-shrink: 0;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: var(--border);
  border-radius: 22px;
  transition: 0.2s;
}

.toggle-slider::before {
  content: "";
  position: absolute;
  height: 16px;
  width: 16px;
  left: 3px;
  bottom: 3px;
  background: white;
  border-radius: 50%;
  transition: 0.2s;
}

.toggle-switch input:checked + .toggle-slider {
  background: var(--accent);
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(18px);
}

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
}

.badge-working {
  background: rgba(34, 197, 94, 0.15);
  color: var(--accent);
}

.toast-error {
  position: fixed;
  bottom: 24px;
  right: 24px;
  padding: 12px 20px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
  border-radius: var(--radius);
  font-size: 13px;
  z-index: 999;
}

.toast-success {
  position: fixed;
  bottom: 24px;
  right: 24px;
  padding: 12px 20px;
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: var(--accent);
  border-radius: var(--radius);
  font-size: 13px;
  z-index: 999;
}
</style>
