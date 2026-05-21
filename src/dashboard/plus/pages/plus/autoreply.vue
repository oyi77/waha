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
        <div class="page-title">↩ Auto-Reply</div>
        <div class="page-subtitle">Keyword-based automatic reply rules</div>
      </div>
    </div>

    <div class="layout-grid">
      <div>
        <div class="card" style="margin-bottom: 16px">
          <div class="section-title">New Rule</div>
          <div class="form-group">
            <label class="form-label">Keyword</label>
            <input v-model="createForm.keyword" placeholder="hello" />
          </div>
          <div class="form-group">
            <label class="form-label">Reply Type</label>
            <select v-model="createForm.type">
              <option value="text">Text</option>
              <option value="image">Image</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Reply Payload (JSON)</label>
            <textarea
              v-model="createForm.payload"
              rows="4"
              placeholder='{"text": "Hello back!"}'
              style="font-family: var(--font-mono); font-size: 12px"
            />
          </div>
          <button class="btn-primary" style="width: 100%" @click="createRule">
            Create Rule
          </button>
        </div>

        <div class="card">
          <div class="section-title">Test Auto-Reply</div>
          <div class="form-group">
            <label class="form-label">Test Message</label>
            <input v-model="testInput" placeholder="Type a message to test…" />
          </div>
          <button
            class="btn-secondary"
            style="width: 100%; margin-bottom: 12px"
            @click="testRule"
          >
            Test
          </button>
          <div v-if="testResult !== null">
            <div class="form-label">Result</div>
            <div class="code-block" style="margin-top: 6px">
              {{ JSON.stringify(testResult, null, 2) }}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div class="section-title">Rules ({{ rules.length }})</div>
        <div v-if="rules.length === 0" class="empty-state">
          <div class="empty-state-icon">↩</div>
          <div class="empty-state-text">No auto-reply rules</div>
        </div>
        <div v-else class="card" style="padding: 0; overflow: hidden">
          <table>
            <thead>
              <tr>
                <th>Keyword</th>
                <th>Type</th>
                <th>Enabled</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="rule in rules" :key="rule.id">
                <td
                  style="
                    font-weight: 500;
                    color: var(--text);
                    font-family: var(--font-mono);
                    font-size: 12px;
                  "
                >
                  {{ rule.keyword }}
                </td>
                <td>
                  <span class="badge badge-working">{{ rule.type }}</span>
                </td>
                <td>
                  <label class="toggle-switch">
                    <input
                      type="checkbox"
                      :checked="rule.enabled !== false"
                      @change="toggleRule(rule)"
                    />
                    <span class="toggle-slider" />
                  </label>
                </td>
                <td>
                  <button class="btn-danger" @click="deleteRule(rule.id)">
                    ✕
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface AutoReplyRule {
  id: string;
  keyword: string;
  type: string;
  enabled?: boolean;
}

const { get, post, put, del } = useWahaApi();
const { success, error } = useToast();

const rules = ref<AutoReplyRule[]>([]);
const createForm = reactive({
  keyword: "",
  type: "text",
  payload: '{"text": "Hello back!"}',
});
const testInput = ref("");
const testResult = ref<unknown>(null);

async function loadRules() {
  try {
    const data = await get<AutoReplyRule[]>("/api/autoreply");
    rules.value = data;
  } catch (e) {
    error("Failed to load rules");
  }
}

async function createRule() {
  if (!createForm.keyword) {
    error("Keyword is required");
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
    await post("/api/autoreply", {
      keyword: createForm.keyword,
      type: createForm.type,
      payload: payload,
    });
    success("Rule created");
    createForm.keyword = "";
    createForm.payload = '{"text": "Hello back!"}';
    await loadRules();
  } catch {
    error("Failed to create rule");
  }
}

async function deleteRule(id: string) {
  try {
    await del(`/api/autoreply/${id}`);
    success("Deleted");
    await loadRules();
  } catch {
    error("Failed to delete rule");
  }
}

async function toggleRule(rule: AutoReplyRule) {
  try {
    await put(`/api/autoreply/${rule.id}`, {
      enabled: !(rule.enabled !== false),
    });
    await loadRules();
  } catch {
    error("Failed to update rule");
  }
}

async function testRule() {
  if (!testInput.value) {
    error("Enter a test message first");
    return;
  }
  try {
    const data = await post<unknown>("/api/autoreply/test", {
      text: testInput.value,
    });
    testResult.value = data;
  } catch {
    testResult.value = { matched: false };
  }
}

const payloadTemplates: Record<string, string> = {
  text: '{"text": "Hello back!"}',
  image: '{"url": "https://example.com/image.jpg", "caption": ""}',
  video: '{"url": "https://example.com/video.mp4", "caption": ""}',
  audio: '{"url": "https://example.com/audio.mp3"}',
  file: '{"url": "https://example.com/file.pdf", "filename": "file.pdf"}',
};

watch(
  () => createForm.type,
  (newType) => {
    createForm.payload = payloadTemplates[newType] ?? '{"text": ""}';
  },
);

onMounted(loadRules);
</script>
