<template>
  <div class="page-wrapper">
    <div
      class="page-header"
      style="display: flex; align-items: center; justify-content: space-between"
    >
      <div>
        <div class="page-title">◈ Engines</div>
        <div class="page-subtitle">
          Compare and choose the right WhatsApp engine
        </div>
      </div>
      <div>
        <button class="btn-ghost" @click="loadSessions">⟳ Refresh</button>
      </div>
    </div>

    <div v-if="loadingEngines" class="empty-state">
      <div class="empty-state-icon">⟳</div>
      <div class="empty-state-text">Loading engines…</div>
    </div>

    <div
      v-else
      class="engines-grid stagger"
      style="
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 16px;
      "
    >
      <div
        v-for="eng in engineCards"
        :key="eng.name"
        class="engine-card card"
        style="display: flex; flex-direction: column; gap: 12px"
      >
        <div
          class="engine-header"
          style="
            display: flex;
            justify-content: space-between;
            align-items: center;
          "
        >
          <span class="badge" :class="`engine-${eng.name.toLowerCase()}`">{{
            eng.name
          }}</span>
          <span v-if="eng.recommended" class="badge badge-working"
            >Recommended</span
          >
        </div>
        <div
          class="engine-tagline"
          style="color: var(--text); font-weight: 500"
        >
          {{ eng.description || eng.tagline || "Engine capability" }}
        </div>
        <button
          class="btn-secondary"
          style="width: 100%; margin-top: auto"
          @click="openCreate(eng.name)"
        >
          Create Session
        </button>
      </div>
    </div>

    <div class="section-title" style="margin-top: 32px">Active Sessions</div>
    <div v-if="sessions.length === 0" class="empty-state">
      <div class="empty-state-text">No sessions</div>
    </div>
    <div v-else>
      <div
        v-for="(sessList, engineName) in groupedSessions"
        :key="engineName"
        style="margin-bottom: 20px"
      >
        <div
          style="
            font-size: 14px;
            font-weight: 600;
            color: var(--text);
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
          "
        >
          <span
            class="badge"
            :class="`engine-${String(engineName).toLowerCase()}`"
            >{{ engineName }}</span
          >
          <span style="color: var(--text-dim); font-size: 12px"
            >({{ sessList.length }})</span
          >
        </div>
        <div
          class="sessions-list"
          style="
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 12px;
          "
        >
          <div
            v-for="s in sessList"
            :key="s.name"
            class="session-row card"
            style="
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 12px 16px;
            "
          >
            <div style="display: flex; flex-direction: column; gap: 4px">
              <span
                style="
                  font-weight: 500;
                  color: var(--text);
                  font-family: var(--font-mono);
                "
                >{{ s.name }}</span
              >
              <span
                class="badge"
                :class="statusClass(s.status)"
                style="width: fit-content"
                >{{ s.status }}</span
              >
            </div>
            <button class="btn-ghost" @click="openSwitchEngine(s)">
              Switch
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="section-title" style="margin-top: 32px">Comparison</div>
    <div class="card" style="padding: 0; overflow: hidden; overflow-x: auto">
      <table>
        <thead>
          <tr>
            <th>Feature</th>
            <th v-for="eng in fallbackEngines" :key="eng.name">
              <span class="badge" :class="`engine-${eng.name.toLowerCase()}`">{{
                eng.name
              }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in comparisonRows" :key="row.feature">
            <td>{{ row.feature }}</td>
            <td v-for="eng in fallbackEngines" :key="eng.name">
              <span v-if="row[eng.name] === true">✓</span>
              <span
                v-else-if="row[eng.name] === false"
                style="color: var(--text-dim)"
                >—</span
              >
              <span v-else style="font-size: 12px; color: var(--text-muted)">{{
                row[eng.name]
              }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create Session Modal -->
    <div
      v-if="showCreate"
      class="modal-overlay"
      @click.self="showCreate = false"
    >
      <div class="modal-box">
        <div class="modal-title">
          Create Session with
          <span
            class="badge"
            :class="`engine-${createForm.engine.toLowerCase()}`"
            >{{ createForm.engine }}</span
          >
        </div>
        <div class="form-group">
          <label class="form-label">Session Name</label>
          <input v-model="createForm.name" placeholder="default" />
        </div>
        <div style="display: flex; gap: 10px; margin-top: 20px">
          <button class="btn-ghost" style="flex: 1" @click="showCreate = false">
            Cancel
          </button>
          <button
            class="btn-primary"
            style="flex: 1"
            @click="createSession"
            :disabled="isCreating"
          >
            {{ isCreating ? "Creating..." : "Create" }}
          </button>
        </div>
      </div>
    </div>

    <!-- Switch Engine Modal -->
    <div
      v-if="showSwitch"
      class="modal-overlay"
      @click.self="closeSwitchEngine"
    >
      <div class="modal-box">
        <div class="modal-title">
          Switch Engine for
          <span style="font-family: var(--font-mono)">{{
            sessionToSwitch?.name
          }}</span>
        </div>
        <div class="form-group">
          <label class="form-label">Current Engine</label>
          <div style="margin-bottom: 16px">
            <span
              v-if="resolveEngine(sessionToSwitch?.engine)"
              class="badge"
              :class="`engine-${resolveEngine(sessionToSwitch?.engine).toLowerCase()}`"
            >
              {{ resolveEngine(sessionToSwitch?.engine) }}
            </span>
            <span v-else style="color: var(--text-dim)">Unknown</span>
          </div>

          <label class="form-label">New Engine</label>
          <select v-model="switchForm.engine">
            <option
              v-for="eng in fallbackEngines"
              :key="eng.name"
              :value="eng.name"
            >
              {{ eng.name }}
            </option>
          </select>
        </div>
        <div style="display: flex; gap: 10px; margin-top: 20px">
          <button class="btn-ghost" style="flex: 1" @click="closeSwitchEngine">
            Cancel
          </button>
          <button
            class="btn-primary"
            style="flex: 1"
            @click="switchEngine"
            :disabled="
              isSwitching ||
              switchForm.engine === resolveEngine(sessionToSwitch?.engine)
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
import { useWahaApi } from "~/composables/useWahaApi";
import { useToast } from "~/composables/useToast";

interface Session {
  name: string;
  status: string;
  engine?: string | Record<string, unknown>;
}

function resolveEngine(
  engine: string | Record<string, unknown> | undefined,
): string {
  if (typeof engine === "string" && engine.length > 0) return engine;
  return "";
}

interface EngineCapability {
  name: string;
  description?: string;
  tagline?: string;
  recommended?: boolean;
}

const { get, post } = useWahaApi();
const { success, error } = useToast();

const fallbackEngines: EngineCapability[] = [
  {
    name: "NOWEB",
    description:
      "Lightweight, no browser required. Best for cloud/VPS. Low memory.",
    recommended: true,
  },
  {
    name: "WEBJS",
    description:
      "Chromium-based, battle-tested. High compatibility, mature ecosystem.",
  },
  {
    name: "WPP",
    description:
      "WPPConnect-based engine. Chromium-based with extra API surface.",
  },
  {
    name: "GOWS",
    description: "Go-based, experimental. Minimal footprint, fast startup.",
  },
];

const comparisonRows: Record<string, unknown>[] = [
  { feature: "No Chromium", NOWEB: true, WEBJS: false, WPP: false, GOWS: true },
  {
    feature: "Memory usage",
    NOWEB: "Low",
    WEBJS: "High",
    WPP: "High",
    GOWS: "Very Low",
  },
  {
    feature: "Stability",
    NOWEB: "High",
    WEBJS: "Very High",
    WPP: "Medium",
    GOWS: "Experimental",
  },
  { feature: "Multi-device", NOWEB: true, WEBJS: true, WPP: true, GOWS: true },
  {
    feature: "Voice calls",
    NOWEB: false,
    WEBJS: false,
    WPP: false,
    GOWS: false,
  },
  { feature: "Status", NOWEB: "✓", WEBJS: "✓", WPP: "✓", GOWS: "✓" },
  { feature: "Polls", NOWEB: true, WEBJS: false, WPP: false, GOWS: true },
  { feature: "Reactions", NOWEB: true, WEBJS: true, WPP: true, GOWS: true },
];

const loadingEngines = ref(true);
const engineCards = ref<EngineCapability[]>([]);
const sessions = ref<Session[]>([]);

const showCreate = ref(false);
const isCreating = ref(false);
const createForm = reactive({ name: "", engine: "" });

const showSwitch = ref(false);
const isSwitching = ref(false);
const sessionToSwitch = ref<Session | null>(null);
const switchForm = reactive({ engine: "" });

const groupedSessions = computed(() => {
  const groups: Record<string, Session[]> = {};
  for (const s of sessions.value) {
    const eng = resolveEngine(s.engine) || "Unknown";
    if (!groups[eng]) groups[eng] = [];
    groups[eng].push(s);
  }
  return groups;
});

function statusClass(status: string): string {
  const s = (status ?? "").toUpperCase();
  if (s === "WORKING" || s === "ONLINE" || s === "RUNNING")
    return "badge-working";
  if (s === "STARTING") return "badge-starting";
  if (s === "SCAN_QR_CODE") return "badge-scan";
  if (s === "STOPPED" || s === "OFFLINE") return "badge-stopped";
  if (s === "FAILED" || s === "ERROR") return "badge-failed";
  return "badge-stopped";
}

async function loadEngines() {
  try {
    const data = await get<EngineCapability[]>("/api/engines");
    if (Array.isArray(data) && data.length > 0) {
      engineCards.value = data;
    } else {
      engineCards.value = fallbackEngines;
    }
  } catch {
    engineCards.value = fallbackEngines;
    error("Failed to load engine info — showing defaults");
  } finally {
    loadingEngines.value = false;
  }
}

async function loadSessions() {
  try {
    const data = await get<Session[]>("/api/sessions?all=true");
    const list = Array.isArray(data) ? data : [];

    const detailsResults = await Promise.allSettled(
      list.map((s) => get<Session>(`/api/sessions/${s.name}`)),
    );

    const detailedSessions: Session[] = [];
    for (let i = 0; i < list.length; i++) {
      const res = detailsResults[i];
      if (res.status === "fulfilled" && res.value) {
        detailedSessions.push(res.value);
      } else {
        detailedSessions.push(list[i]);
      }
    }

    sessions.value = detailedSessions;
  } catch {
    // silently fail for sessions poll
  }
}

function openCreate(engine: string) {
  createForm.engine = engine;
  createForm.name = "";
  showCreate.value = true;
}

async function createSession() {
  isCreating.value = true;
  try {
    await post("/api/sessions", {
      name: createForm.name || "default",
      engine: createForm.engine,
    });
    success("Session created");
    showCreate.value = false;
    await loadSessions();
  } catch {
    error("Failed to create session");
  } finally {
    isCreating.value = false;
  }
}

function openSwitchEngine(session: Session) {
  sessionToSwitch.value = session;
  switchForm.engine = resolveEngine(session.engine) || fallbackEngines[0].name;
  showSwitch.value = true;
}

function closeSwitchEngine() {
  showSwitch.value = false;
  sessionToSwitch.value = null;
  switchForm.engine = "";
}

async function switchEngine() {
  if (
    !sessionToSwitch.value ||
    switchForm.engine === resolveEngine(sessionToSwitch.value.engine)
  )
    return;

  isSwitching.value = true;
  try {
    await post(`/api/sessions/${sessionToSwitch.value.name}/switch-engine`, {
      engine: switchForm.engine,
    });
    success(`Successfully switched engine for ${sessionToSwitch.value.name}`);
    showSwitch.value = false;
    await loadSessions();
  } catch {
    error("Failed to switch engine");
  } finally {
    isSwitching.value = false;
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
  await Promise.all([loadEngines(), loadSessions()]);
  pollTimer = setInterval(loadSessions, 15000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<style scoped>
/* Scoped styles are kept minimal as global classes are used */
</style>
