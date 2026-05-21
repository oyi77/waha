<template>
  <div class="page-wrapper">
    <div class="page-header">
      <div>
        <div class="page-title">⚿ API Keys</div>
        <div class="page-subtitle">Manage API keys for WAHA access</div>
      </div>
      <button class="btn-primary" @click="showCreate = true">+ New Key</button>
    </div>

    <div v-if="loading" class="empty-state">
      <div class="empty-state-icon">⟳</div>
      <div class="empty-state-text">Loading keys…</div>
    </div>

    <div v-else-if="keys.length === 0" class="empty-state">
      <div class="empty-state-icon">⚿</div>
      <div class="empty-state-text">No API keys yet.</div>
    </div>

    <div v-else class="card" style="padding: 0; overflow: hidden">
      <table class="keys-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Key</th>
            <th>Type</th>
            <th>Session</th>
            <th>Active</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="k in keys" :key="k.id">
            <td class="key-id">{{ k.id }}</td>
            <td>
              <span class="key-preview">{{ maskKey(k.key) }}</span>
              <button class="btn-ghost btn-sm" @click="copyKey(k.key)">Copy</button>
            </td>
            <td>
              <span class="badge" :class="k.isAdmin ? 'badge-admin' : 'badge-scoped'">
                {{ k.isAdmin ? 'Admin' : 'Scoped' }}
              </span>
            </td>
            <td class="text-muted text-sm">
              {{ k.session ?? '—' }}
            </td>
            <td>
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  :checked="k.isActive"
                  @change="toggleKey(k)"
                />
                <span class="toggle-slider" />
              </label>
            </td>
            <td>
              <button class="btn-danger btn-sm" @click="confirmDelete(k.id)">✕</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create Modal -->
    <div v-if="showCreate" class="modal-overlay" @click.self="showCreate = false">
      <div class="modal-box">
        <div class="modal-title">Create API Key</div>
        <div class="form-group">
          <label class="form-label">Type</label>
          <div class="radio-group">
            <label class="radio-option">
              <input v-model="form.isAdmin" type="radio" :value="true" />
              <span>
                <strong>Admin</strong>
                <span class="text-dim"> — full access to all sessions</span>
              </span>
            </label>
            <label class="radio-option">
              <input v-model="form.isAdmin" type="radio" :value="false" />
              <span>
                <strong>Scoped</strong>
                <span class="text-dim"> — access to one session only</span>
              </span>
            </label>
          </div>
        </div>
        <div v-if="!form.isAdmin" class="form-group">
          <label class="form-label">Session</label>
          <select v-model="form.session">
            <option value="">Select session…</option>
            <option v-for="s in sessions" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
        <div style="display: flex; gap: 10px; margin-top: 20px">
          <button class="btn-secondary" style="flex: 1" @click="showCreate = false">Cancel</button>
          <button
            class="btn-primary"
            style="flex: 1"
            :disabled="creating || (!form.isAdmin && !form.session)"
            @click="createKey"
          >
            {{ creating ? 'Creating…' : 'Create Key' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Created Key Modal -->
    <div v-if="createdKeyData" class="modal-overlay" @click.self="createdKeyData = null">
      <div class="modal-box">
        <div class="modal-title">✓ API Key Created</div>
        <p class="text-muted" style="font-size: 13px; margin-bottom: 16px">
          Copy this key now — it won't be shown again.
        </p>
        <div class="code-block" style="word-break: break-all; user-select: all">
          {{ createdKeyData.key }}
        </div>
        <div class="key-meta">
          <span class="badge" :class="createdKeyData.isAdmin ? 'badge-admin' : 'badge-scoped'">
            {{ createdKeyData.isAdmin ? 'Admin' : `Scoped: ${createdKeyData.session}` }}
          </span>
        </div>
        <button class="btn-secondary" style="width: 100%; margin-top: 14px" @click="copyKey(createdKeyData.key)">
          Copy Key
        </button>
        <button class="btn-ghost" style="width: 100%; margin-top: 8px" @click="createdKeyData = null">
          Done
        </button>
      </div>
    </div>

    <!-- Delete Confirm -->
    <div v-if="deleteTargetId" class="modal-overlay" @click.self="deleteTargetId = ''">
      <div class="modal-box">
        <div class="modal-title">Delete API Key</div>
        <p class="text-muted" style="font-size: 13px; margin-bottom: 24px">
          Permanently delete this API key? Any clients using it will lose access immediately.
        </p>
        <div style="display: flex; gap: 10px">
          <button class="btn-ghost" style="flex: 1" @click="deleteTargetId = ''">Cancel</button>
          <button class="btn-danger" style="flex: 1" @click="deleteKey">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useWahaApi } from '~/composables/useWahaApi';
import { useToast } from '~/composables/useToast';

interface ApiKey {
  id: string;
  key: string;
  isActive: boolean;
  isAdmin: boolean;
  session: string | null;
}

const { get, post, put, del } = useWahaApi();
const { success, error } = useToast();

const keys = ref<ApiKey[]>([]);
const sessions = ref<string[]>([]);
const loading = ref(true);
const creating = ref(false);
const showCreate = ref(false);
const createdKeyData = ref<ApiKey | null>(null);
const deleteTargetId = ref('');

const form = reactive({
  isAdmin: true,
  session: '',
});

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return `${key.substring(0, 6)}…${key.substring(key.length - 4)}`;
}

async function copyKey(key: string) {
  try {
    await navigator.clipboard.writeText(key);
    success('Copied to clipboard');
  } catch {
    error('Failed to copy');
  }
}

async function loadAll() {
  loading.value = true;
  try {
    const [keysData, sessionsData] = await Promise.allSettled([
      get<ApiKey[]>('/api/keys'),
      get<{ name: string }[]>('/api/engines'),
    ]);
    if (keysData.status === 'fulfilled') {
      keys.value = keysData.value;
    }
    if (sessionsData.status === 'fulfilled') {
      sessions.value = sessionsData.value.map((e: { name: string }) => e.name);
    }
  } catch (e) {
    error('Failed to load keys');
  } finally {
    loading.value = false;
  }
}

async function createKey() {
  creating.value = true;
  try {
    const body = {
      isAdmin: form.isAdmin,
      isActive: true,
      session: form.isAdmin ? null : (form.session || null),
    };
    const data = await post<ApiKey>('/api/keys', body);
    success('Key created');
    showCreate.value = false;
    createdKeyData.value = data;
    form.isAdmin = true;
    form.session = '';
    await loadAll();
  } catch (e) {
    error('Failed to create key');
  } finally {
    creating.value = false;
  }
}

async function toggleKey(k: ApiKey) {
  try {
    await put<ApiKey>(`/api/keys/${k.id}`, {
      isAdmin: k.isAdmin,
      isActive: !k.isActive,
      session: k.session,
    });
    await loadAll();
  } catch {
    error('Failed to update key');
  }
}

function confirmDelete(id: string) {
  deleteTargetId.value = id;
}

async function deleteKey() {
  const id = deleteTargetId.value;
  deleteTargetId.value = '';
  try {
    await del(`/api/keys/${id}`);
    success('Deleted');
    await loadAll();
  } catch {
    error('Failed to delete key');
  }
}

onMounted(loadAll);
</script>

<style scoped>
.keys-table {
  width: 100%;
  border-collapse: collapse;
}

.keys-table th {
  text-align: left;
  padding: 12px 16px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-dim);
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.keys-table td {
  padding: 12px 16px;
  font-size: 13px;
  color: var(--text);
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}

.keys-table tr:last-child td {
  border-bottom: none;
}

.key-id {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--text-dim);
}

.key-preview {
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--text-muted);
  margin-right: 8px;
}

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 600;
}

.badge-admin {
  background: rgba(234, 179, 8, 0.15);
  color: #eab308;
}

.badge-scoped {
  background: rgba(34, 197, 94, 0.12);
  color: var(--accent);
}

.btn-sm {
  padding: 3px 8px;
  font-size: 11px;
}

.text-muted {
  color: var(--text-muted);
}

.text-dim {
  color: var(--text-dim);
  font-size: 12px;
}

.text-sm {
  font-size: 12px;
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.radio-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s;
}

.radio-option:hover {
  background: var(--surface-hover);
}

.radio-option input {
  margin-top: 3px;
  accent-color: var(--accent);
}

.code-block {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--accent);
  margin-bottom: 12px;
}

.key-meta {
  margin-bottom: 12px;
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
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
  border-radius: 20px;
  transition: 0.2s;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  height: 14px;
  width: 14px;
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
  transform: translateX(16px);
}
</style>
