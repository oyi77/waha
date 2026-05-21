<template>
  <div class="page-wrapper">
    <div class="page-header">
      <div class="page-title">◑ Contacts</div>
      <div class="page-subtitle">
        Bulk check and import WhatsApp contacts from CSV
      </div>
    </div>

    <div class="layout-grid">
      <div>
        <div class="card">
          <div class="section-title">Upload CSV</div>
          <div
            class="drop-zone"
            :class="{ 'drop-zone-active': dragOver }"
            @dragover.prevent="dragOver = true"
            @dragleave="dragOver = false"
            @drop.prevent="onDrop"
            @click="fileInput?.click()"
          >
            <div class="drop-icon">⬆</div>
            <div class="drop-text">Drop CSV or click to browse</div>
            <div class="drop-hint">One phone number per line (no header)</div>
          </div>
          <input
            ref="fileInput"
            type="file"
            accept=".csv,.txt"
            style="display: none"
            @change="onFileChange"
          />

          <div v-if="preview.length > 0" style="margin-top: 16px">
            <div class="form-label">Preview ({{ preview.length }} numbers)</div>
            <div
              class="code-block"
              style="max-height: 120px; overflow-y: auto; margin-top: 6px"
            >
              {{ preview.slice(0, 10).join("\n")
              }}{{ preview.length > 10 ? "\n…" : "" }}
            </div>
          </div>
        </div>

        <div class="card" style="margin-top: 16px">
          <div class="section-title">Bulk Check</div>
          <div class="form-group">
            <label class="form-label">Session</label>
            <select v-model="session">
              <option value="">Select session…</option>
              <option v-for="s in sessions" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
          <button
            class="btn-primary"
            style="width: 100%"
            :disabled="!session || preview.length === 0 || checking"
            @click="checkContacts"
          >
            {{ checking ? "Checking…" : `Check ${preview.length} Numbers` }}
          </button>
        </div>
      </div>

      <div>
        <div v-if="results.length === 0" class="empty-state">
          <div class="empty-state-icon">◑</div>
          <div class="empty-state-text">
            Upload a CSV and run check to see results
          </div>
        </div>
        <div v-else>
          <div
            style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin-bottom: 12px;
            "
          >
            <div class="section-title" style="margin-bottom: 0">
              Results — {{ validCount }} valid / {{ results.length }} total
            </div>
            <button class="btn-secondary" @click="exportCsv">
              ↓ Export Valid
            </button>
          </div>
          <div
            class="card"
            style="
              padding: 0;
              overflow: hidden;
              max-height: 500px;
              overflow-y: auto;
            "
          >
            <table>
              <thead>
                <tr>
                  <th>Number</th>
                  <th>WhatsApp ID</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in results" :key="r.number">
                  <td style="font-family: var(--font-mono); font-size: 12px">
                    {{ r.number }}
                  </td>
                  <td
                    style="
                      font-family: var(--font-mono);
                      font-size: 11px;
                      color: var(--text-muted);
                    "
                  >
                    {{ r.id ?? "—" }}
                  </td>
                  <td>
                    <span
                      class="badge"
                      :class="r.valid ? 'badge-working' : 'badge-stopped'"
                    >
                      {{ r.valid ? "✓ Valid" : "✕ Invalid" }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface ContactResult {
  number: string;
  id?: string;
  valid: boolean;
}

const { get, post } = useWahaApi();
const { success, error } = useToast();

const sessions = ref<string[]>([]);
const session = ref("");
const preview = ref<string[]>([]);
const results = ref<ContactResult[]>([]);
const checking = ref(false);
const dragOver = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

const validCount = computed(() => results.value.filter((r) => r.valid).length);

async function loadSessions() {
  try {
    const data = await get<{ name: string }[]>("/api/sessions?all=true");
    sessions.value = data.map((s) => s.name);
    if (sessions.value.length > 0 && !session.value) {
      session.value = sessions.value[0];
    }
  } catch {
    error("Failed to load sessions");
  }
}

function parseNumbers(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((n) => n.trim().replace(/\D/g, ""))
    .filter((n) => n.length >= 7);
}

function onDrop(e: DragEvent) {
  dragOver.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (file) readFile(file);
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) readFile(file);
}

function readFile(file: File) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const result = e.target?.result;
    if (typeof result !== "string") {
      error("Could not read file — please upload a plain text or CSV file");
      return;
    }
    preview.value = parseNumbers(result);
    results.value = [];
  };
  reader.onerror = () => {
    error("Failed to read file");
  };
  reader.readAsText(file);
}

async function checkContacts() {
  if (checking.value) return;
  if (!session.value || preview.value.length === 0) return;
  checking.value = true;
  try {
    const data = await post<ContactResult[]>("/api/bulk/check", {
      session: session.value,
      numbers: preview.value,
    });
    results.value = data;
    success(`Checked ${data.length} numbers — ${validCount.value} valid`);
  } catch {
    error("Failed to check contacts");
  } finally {
    checking.value = false;
  }
}

function exportCsv() {
  const valid = results.value.filter((r) => r.valid);
  const csv = valid.map((r) => r.id ?? r.number).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "valid-contacts.csv";
  a.click();
  URL.revokeObjectURL(url);
}

onMounted(loadSessions);
</script>
