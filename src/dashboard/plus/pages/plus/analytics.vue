<template>
  <div class="page-wrapper">
    <div class="page-header">
      <div class="page-title">▲ Analytics</div>
      <div class="page-subtitle">Message statistics and session activity</div>
    </div>

    <div style="display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap">
      <select v-model="filterSession" style="width: auto" @change="loadData">
        <option value="">All Sessions</option>
        <option v-for="s in sessions" :key="s" :value="s">{{ s }}</option>
      </select>
      <select v-model="filterRange" style="width: auto" @change="loadData">
        <option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option>
        <option value="90">Last 90 days</option>
      </select>
    </div>

    <div class="grid-4 stagger" style="margin-bottom: 28px">
      <div class="stat-card">
        <div class="stat-card-value">{{ summary.totalSent }}</div>
        <div class="stat-card-label">Sent</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-value">{{ summary.totalReceived }}</div>
        <div class="stat-card-label">Received</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-value">{{ summary.activeSessions }}</div>
        <div class="stat-card-label">Active Sessions</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-value">{{ summary.totalMessages }}</div>
        <div class="stat-card-label">Total Messages</div>
      </div>
    </div>

    <div class="card" style="margin-bottom: 24px">
      <div class="section-title">Daily Activity</div>
      <div
        v-if="chartData.length === 0"
        class="empty-state"
        style="padding: 32px"
      >
        <div class="empty-state-text">No chart data</div>
      </div>
      <svg
        v-else
        :viewBox="`0 0 ${chartW} ${chartH}`"
        style="width: 100%; height: 180px; display: block"
      >
        <defs>
          <linearGradient id="grad-sent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(34,197,94,0.4)" />
            <stop offset="100%" stop-color="rgba(34,197,94,0)" />
          </linearGradient>
          <linearGradient id="grad-recv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(59,130,246,0.3)" />
            <stop offset="100%" stop-color="rgba(59,130,246,0)" />
          </linearGradient>
        </defs>
        <path
          :d="areaPath(chartData.map((d) => d.sent))"
          fill="url(#grad-sent)"
        />
        <path
          :d="areaPath(chartData.map((d) => d.received))"
          fill="url(#grad-recv)"
        />
        <path
          :d="linePath(chartData.map((d) => d.sent))"
          fill="none"
          stroke="#22c55e"
          stroke-width="2"
        />
        <path
          :d="linePath(chartData.map((d) => d.received))"
          fill="none"
          stroke="#3b82f6"
          stroke-width="2"
        />
        <text
          v-for="(d, i) in chartData.filter((_, j) => j % labelStep === 0)"
          :key="i"
          :x="xPos(i * labelStep, chartData.length)"
          :y="chartH - 4"
          text-anchor="middle"
          fill="rgba(134,239,172,0.4)"
          font-size="9"
        >
          {{ d.date }}
        </text>
      </svg>
      <div style="display: flex; gap: 16px; margin-top: 8px">
        <span style="font-size: 12px; color: #22c55e">▬ Sent</span>
        <span style="font-size: 12px; color: #3b82f6">▬ Received</span>
      </div>
    </div>

    <div class="section-title">Message Log</div>
    <div v-if="messages.length === 0" class="empty-state">
      <div class="empty-state-text">No messages</div>
    </div>
    <div v-else class="card" style="padding: 0; overflow: hidden">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Session</th>
            <th>From</th>
            <th>Type</th>
            <th>Preview</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="msg in messages" :key="msg.id">
            <td
              style="
                font-size: 11px;
                color: var(--text-dim);
                white-space: nowrap;
              "
            >
              {{ formatTs(msg.timestamp) }}
            </td>
            <td style="font-size: 12px">{{ msg.session }}</td>
            <td
              style="
                font-family: var(--font-mono);
                font-size: 11px;
                color: var(--text-muted);
              "
            >
              {{ msg.from }}
            </td>
            <td>
              <span class="badge badge-working">{{ msg.type }}</span>
            </td>
            <td
              style="
                font-size: 12px;
                max-width: 240px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
              "
            >
              {{ msgPreview(msg) }}
            </td>
          </tr>
        </tbody>
      </table>
      <div
        style="display: flex; justify-content: center; padding: 12px; gap: 8px"
      >
        <button
          class="btn-ghost"
          :disabled="page === 1"
          @click="
            page--;
            loadMessages();
          "
        >
          ← Prev
        </button>
        <span
          style="color: var(--text-dim); font-size: 13px; padding: 6px 12px"
          >{{ page }}</span
        >
        <button
          class="btn-ghost"
          :disabled="messages.length < pageSize"
          @click="
            page++;
            loadMessages();
          "
        >
          Next →
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface DailyData {
  date: string;
  sent: number;
  received: number;
}
interface Message {
  id: string;
  session: string;
  from: string;
  type: string;
  timestamp: number;
  body?: string;
}

const { get } = useWahaApi();
const { error } = useToast();

const sessions = ref<string[]>([]);
const filterSession = ref("");
const filterRange = ref("7");
const summary = reactive({
  totalSent: 0,
  totalReceived: 0,
  activeSessions: 0,
  totalMessages: 0,
});
const chartData = ref<DailyData[]>([]);
const messages = ref<Message[]>([]);
const page = ref(1);
const pageSize = 20;

const chartW = 800;
const chartH = 160;
const padT = 10;
const padB = 20;

const labelStep = computed(() =>
  Math.max(1, Math.floor(chartData.value.length / 8)),
);

function maxVal(arr: number[]): number {
  const clean = arr.filter((n) => isFinite(n) && !isNaN(n));
  return Math.max(...clean, 1);
}

function xPos(i: number, n: number): number {
  return n <= 1 ? chartW / 2 : (i / (n - 1)) * (chartW - 40) + 20;
}

function yPos(val: number, maxV: number): number {
  return padT + (1 - val / maxV) * (chartH - padT - padB);
}

function linePath(vals: number[]): string {
  if (vals.length === 0) return "";
  const safe = vals.map((v) => (isFinite(Number(v)) ? Number(v) : 0));
  const maxV = maxVal(safe);
  const n = safe.length;
  return safe
    .map((v, i) => `${i === 0 ? "M" : "L"}${xPos(i, n)},${yPos(v, maxV)}`)
    .join(" ");
}

function areaPath(vals: number[]): string {
  if (vals.length === 0) return "";
  const safe = vals.map((v) => (isFinite(Number(v)) ? Number(v) : 0));
  const maxV = maxVal(safe);
  const n = safe.length;
  const line = safe
    .map((v, i) => `${i === 0 ? "M" : "L"}${xPos(i, n)},${yPos(v, maxV)}`)
    .join(" ");
  const last = safe.length - 1;
  return `${line} L${xPos(last, n)},${chartH - padB} L${xPos(0, n)},${chartH - padB} Z`;
}

function formatTs(ts: number): string {
  if (!ts || ts < 0) return "—";
  const d = new Date(ts * 1000);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function msgPreview(msg: Message): string {
  return msg.body ?? `[${msg.type}]`;
}

async function loadSessions() {
  try {
    const data = await get<{ name: string }[]>("/api/sessions?all=true");
    sessions.value = data.map((s) => s.name);
  } catch {
    error("Failed to load sessions");
  }
}

async function loadSummary() {
  try {
    const params = new URLSearchParams({ days: filterRange.value });
    if (filterSession.value) params.set("session", filterSession.value);
    const data = await get<typeof summary>(`/api/analytics/summary?${params}`);
    Object.assign(summary, data);
  } catch {
    error("Failed to load summary");
  }
}

async function loadChart() {
  try {
    const params = new URLSearchParams({ days: filterRange.value });
    if (filterSession.value) params.set("session", filterSession.value);
    const data = await get<DailyData[]>(`/api/analytics/daily?${params}`);
    chartData.value = data;
  } catch {
    chartData.value = [];
    error("Failed to load chart data");
  }
}

async function loadMessages() {
  try {
    const params = new URLSearchParams({
      page: String(page.value),
      limit: String(pageSize),
    });
    if (filterSession.value) params.set("session", filterSession.value);
    const data = await get<Message[]>(`/api/messages/log?${params}`);
    messages.value = data;
  } catch {
    error("Failed to load messages");
  }
}

async function loadData() {
  page.value = 1;
  await Promise.allSettled([loadSummary(), loadChart(), loadMessages()]);
}

onMounted(async () => {
  await loadSessions();
  await loadData();
});
</script>
