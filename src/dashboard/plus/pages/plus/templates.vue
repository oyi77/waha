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
        <div class="page-title">▣ Templates</div>
        <div class="page-subtitle">Reusable message templates</div>
      </div>
      <button class="btn-primary" @click="showCreate = true">
        + New Template
      </button>
    </div>

    <div v-if="templates.length === 0" class="empty-state">
      <div class="empty-state-icon">▣</div>
      <div class="empty-state-text">No templates yet</div>
    </div>

    <div v-else class="card" style="padding: 0; overflow: hidden">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Tags</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tmpl in templates" :key="tmpl.id">
            <td style="font-weight: 500; color: var(--text)">
              {{ tmpl.name }}
            </td>
            <td>
              <span class="badge badge-working">{{ tmpl.type }}</span>
            </td>
            <td>
              <span
                v-for="tag in tmpl.tags || []"
                :key="tag"
                class="badge badge-stopped"
                style="margin-right: 4px"
                >{{ tag }}</span
              >
            </td>
            <td>
              <div style="display: flex; gap: 6px">
                <button class="btn-secondary" @click="openSend(tmpl)">
                  ▶ Send
                </button>
                <button class="btn-danger" @click="deleteTemplate(tmpl.id)">
                  ✕
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="showCreate"
      class="modal-overlay"
      @click.self="showCreate = false"
    >
      <div class="modal-box">
        <div class="modal-title">New Template</div>
        <div class="form-group">
          <label class="form-label">Name</label>
          <input v-model="createForm.name" placeholder="my-template" />
        </div>
        <div class="form-group">
          <label class="form-label">Type</label>
          <select v-model="createForm.type">
            <option value="text">Text</option>
            <option value="image">Image</option>
            <option value="file">File</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Tags (comma-separated)</label>
          <input v-model="createForm.tags" placeholder="tag1, tag2" />
        </div>
        <div class="form-group">
          <label class="form-label">Payload (JSON)</label>
          <textarea
            v-model="createForm.payload"
            rows="5"
            placeholder='{"text": "Hello, {{name}}!"}'
            style="font-family: var(--font-mono); font-size: 12px"
          />
        </div>
        <div style="display: flex; gap: 10px; margin-top: 20px">
          <button
            class="btn-secondary"
            style="flex: 1"
            @click="showCreate = false"
          >
            Cancel
          </button>
          <button class="btn-primary" style="flex: 1" @click="createTemplate">
            Create
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="sendModal.open"
      class="modal-overlay"
      @click.self="sendModal.open = false"
    >
      <div class="modal-box">
        <div class="modal-title">Send Template — {{ sendModal.name }}</div>
        <div class="form-group">
          <label class="form-label">Session</label>
          <select v-model="sendModal.session">
            <option value="">Select session…</option>
            <option v-for="s in sessions" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Chat ID</label>
          <input
            v-model="sendModal.chatId"
            placeholder="1234567890@s.whatsapp.net"
          />
        </div>
        <div style="display: flex; gap: 10px; margin-top: 20px">
          <button
            class="btn-secondary"
            style="flex: 1"
            @click="sendModal.open = false"
          >
            Cancel
          </button>
          <button class="btn-primary" style="flex: 1" @click="sendTemplate">
            Send
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Template {
  id: string;
  name: string;
  type: string;
  tags?: string[];
}

const { get, post, del } = useWahaApi();
const { success, error } = useToast();

const templates = ref<Template[]>([]);
const sessions = ref<string[]>([]);
const showCreate = ref(false);

const createForm = reactive({
  name: "",
  type: "text",
  tags: "",
  payload: '{"text": "Hello!"}',
});

const sendModal = reactive({
  open: false,
  id: "",
  name: "",
  session: "",
  chatId: "",
});

async function loadTemplates() {
  try {
    const data = await get<Template[]>("/api/templates");
    templates.value = data;
  } catch (e) {
    error("Failed to load templates");
  }
}

async function loadSessions() {
  try {
    const data = await get<{ name: string }[]>("/api/sessions?all=true");
    sessions.value = data.map((s) => s.name);
  } catch {}
}

async function createTemplate() {
  if (!createForm.name) {
    error("Name is required");
    return;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(createForm.payload);
  } catch {
    error("Invalid JSON payload");
    return;
  }
  try {
    await post("/api/templates", {
      name: createForm.name,
      type: createForm.type,
      tags: createForm.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      payload: payload,
    });
    success("Template created");
    showCreate.value = false;
    createForm.name = "";
    createForm.tags = "";
    createForm.payload = '{"text": "Hello!"}';
    await loadTemplates();
  } catch {
    error("Failed to create template");
  }
}

async function deleteTemplate(id: string) {
  try {
    await del(`/api/templates/${id}`);
    success("Deleted");
    await loadTemplates();
  } catch {
    error("Failed to delete template");
  }
}

function openSend(tmpl: Template) {
  sendModal.open = true;
  sendModal.id = tmpl.id;
  sendModal.name = tmpl.name;
  sendModal.session = sessions.value[0] ?? "";
  sendModal.chatId = "";
}

async function sendTemplate() {
  if (!sendModal.session || !sendModal.chatId) {
    error("Session and Chat ID are required");
    return;
  }
  try {
    await post(`/api/templates/${sendModal.id}/send`, {
      session: sendModal.session,
      chatId: sendModal.chatId,
    });
    success("Sent!");
    sendModal.open = false;
  } catch {
    error("Failed to send template");
  }
}

onMounted(async () => {
  await Promise.allSettled([loadTemplates(), loadSessions()]);
});
</script>
