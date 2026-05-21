<template>
  <div class="page-wrapper">
    <div class="page-header">
      <div class="page-title">⬡ MCP Server</div>
      <div class="page-subtitle">
        Use WAHA as an MCP server for Claude AI agents
      </div>
    </div>

    <div class="card" style="margin-bottom: 24px">
      <div class="form-label">MCP Server URL</div>
      <div style="display: flex; gap: 10px; margin-top: 8px">
        <input
          readonly
          :value="mcpUrl"
          style="font-family: var(--font-mono); font-size: 12px"
        />
        <button
          class="btn-secondary"
          style="white-space: nowrap"
          @click="copyUrl"
        >
          Copy
        </button>
      </div>
    </div>

    <div class="tab-row">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tab-btn"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <div
      v-if="activeTab === 'claude-desktop'"
      class="card"
      style="
        margin-top: 0;
        border-top: none;
        border-radius: 0 0 var(--radius-lg) var(--radius-lg);
      "
    >
      <div class="section-title">Claude Desktop Configuration</div>
      <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 16px">
        Add to
        <code style="font-family: var(--font-mono); color: var(--accent)"
          >~/Library/Application Support/Claude/claude_desktop_config.json</code
        >
      </p>
      <div class="code-block">{{ claudeDesktopConfig }}</div>
      <button
        class="btn-secondary"
        style="margin-top: 12px"
        @click="copy(claudeDesktopConfig)"
      >
        Copy Config
      </button>
    </div>

    <div
      v-if="activeTab === 'claude-code'"
      class="card"
      style="
        margin-top: 0;
        border-top: none;
        border-radius: 0 0 var(--radius-lg) var(--radius-lg);
      "
    >
      <div class="section-title">Claude Code / MCP CLI</div>
      <div class="code-block">{{ claudeCodeCmd }}</div>
      <button
        class="btn-secondary"
        style="margin-top: 12px"
        @click="copy(claudeCodeCmd)"
      >
        Copy Command
      </button>
    </div>

    <div
      v-if="activeTab === 'other'"
      class="card"
      style="
        margin-top: 0;
        border-top: none;
        border-radius: 0 0 var(--radius-lg) var(--radius-lg);
      "
    >
      <div class="section-title">Generic MCP Config</div>
      <div class="code-block">{{ genericConfig }}</div>
      <button
        class="btn-secondary"
        style="margin-top: 12px"
        @click="copy(genericConfig)"
      >
        Copy Config
      </button>
    </div>

    <div class="section-title" style="margin-top: 28px">
      Available Tools ({{ tools.length }})
    </div>

    <div class="tools-grid">
      <div v-for="tool in tools" :key="tool.name" class="tool-card card">
        <div class="tool-name">{{ tool.name }}</div>
        <div class="tool-desc">{{ tool.desc }}</div>
      </div>
    </div>

    <div class="card" style="margin-top: 24px">
      <div class="section-title">Live Tool Tester</div>
      <div class="form-group">
        <label class="form-label">Session</label>
        <select v-model="tester.session" style="max-width: 240px">
          <option v-for="s in sessions" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Tool</label>
        <select v-model="tester.tool" style="max-width: 240px">
          <option v-for="t in tools" :key="t.name" :value="t">
            {{ t.name }}
          </option>
        </select>
      </div>
      <div v-if="tester.tool" class="form-group">
        <label class="form-label">Parameters (JSON)</label>
        <textarea
          v-model="tester.params"
          rows="4"
          :placeholder="tester.tool.example"
          style="font-family: var(--font-mono); font-size: 12px"
        />
      </div>
      <button class="btn-primary" @click="runTool">▶ Run Tool</button>
      <div v-if="tester.result !== null" style="margin-top: 16px">
        <div class="form-label">Response</div>
        <div
          class="code-block"
          style="margin-top: 6px; max-height: 240px; overflow-y: auto"
        >
          {{ JSON.stringify(tester.result, null, 2) }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface McpTool {
  name: string;
  desc: string;
  endpoint: string;
  example: string;
}

const { get, post, init, apiKey } = useWahaApi();
const { success, error } = useToast();

const sessions = ref<string[]>([]);
const activeTab = ref("claude-desktop");

const tabs = [
  { id: "claude-desktop", label: "Claude Desktop" },
  { id: "claude-code", label: "Claude Code" },
  { id: "other", label: "Other MCP Client" },
];

const origin = computed(() =>
  typeof window !== "undefined" ? window.location.origin : "",
);

const mcpUrl = computed(() => `${origin.value}/mcp/`);

const claudeDesktopConfig = computed(() =>
  JSON.stringify(
    {
      mcpServers: {
        waha: {
          url: mcpUrl.value,
          headers: { "X-Api-Key": apiKey.value },
        },
      },
    },
    null,
    2,
  ),
);

const claudeCodeCmd = computed(
  () =>
    `claude mcp add --url ${mcpUrl.value} --header "X-Api-Key: ${apiKey.value}" waha`,
);

const genericConfig = computed(() =>
  JSON.stringify(
    {
      name: "waha",
      url: mcpUrl.value,
      transport: "http",
      headers: { "X-Api-Key": apiKey.value },
    },
    null,
    2,
  ),
);

const tools: McpTool[] = [
  {
    name: "waha_send_text",
    desc: "Send a text message",
    endpoint: "/api/{session}/sendText",
    example: '{"chatId":"123@s.whatsapp.net","text":"Hello"}',
  },
  {
    name: "waha_send_image",
    desc: "Send an image message",
    endpoint: "/api/{session}/sendImage",
    example:
      '{"chatId":"123@s.whatsapp.net","file":{"url":"https://example.com/img.jpg"}}',
  },
  {
    name: "waha_send_file",
    desc: "Send a file",
    endpoint: "/api/{session}/sendFile",
    example:
      '{"chatId":"123@s.whatsapp.net","file":{"url":"https://example.com/file.pdf"}}',
  },
  {
    name: "waha_send_buttons",
    desc: "Send a message with buttons",
    endpoint: "/api/{session}/sendButtons",
    example: '{"chatId":"123@s.whatsapp.net","buttons":[]}',
  },
  {
    name: "waha_send_list",
    desc: "Send a list message",
    endpoint: "/api/{session}/sendList",
    example: '{"chatId":"123@s.whatsapp.net","sections":[]}',
  },
  {
    name: "waha_get_chats",
    desc: "Get list of chats",
    endpoint: "/api/{session}/chats",
    example: "{}",
  },
  {
    name: "waha_get_messages",
    desc: "Get messages from a chat",
    endpoint: "/api/{session}/chats/{chatId}/messages",
    example: '{"chatId":"123@s.whatsapp.net"}',
  },
  {
    name: "waha_get_contacts",
    desc: "Get contacts",
    endpoint: "/api/{session}/contacts",
    example: "{}",
  },
  {
    name: "waha_check_number",
    desc: "Check if number is on WhatsApp",
    endpoint: "/api/{session}/contacts/check-exists",
    example: '{"phone":"1234567890"}',
  },
  {
    name: "waha_get_sessions",
    desc: "List all sessions",
    endpoint: "/api/sessions",
    example: "{}",
  },
  {
    name: "waha_start_session",
    desc: "Start a session",
    endpoint: "/api/sessions/{session}/start",
    example: "{}",
  },
  {
    name: "waha_stop_session",
    desc: "Stop a session",
    endpoint: "/api/sessions/{session}/stop",
    example: "{}",
  },
  {
    name: "waha_get_profile",
    desc: "Get own profile info",
    endpoint: "/api/{session}/profile",
    example: "{}",
  },
  {
    name: "waha_set_status",
    desc: "Set WhatsApp status message",
    endpoint: "/api/{session}/profile/status",
    example: '{"status":"Available"}',
  },
  {
    name: "waha_typing",
    desc: "Send typing indicator",
    endpoint: "/api/{session}/startTyping",
    example: '{"chatId":"123@s.whatsapp.net"}',
  },
];

const tester = reactive({
  session: "",
  tool: null as McpTool | null,
  params: "{}",
  result: null as unknown,
});

async function copyUrl() {
  try {
    await navigator.clipboard.writeText(mcpUrl.value);
    success("Copied");
  } catch {
    error("Failed to copy to clipboard");
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    success("Copied");
  } catch {
    error("Failed to copy to clipboard");
  }
}

async function loadSessions() {
  try {
    const data = await get<{ name: string }[]>("/api/sessions?all=true");
    sessions.value = data.map((s) => s.name);
    if (sessions.value.length > 0 && !tester.session) {
      tester.session = sessions.value[0];
    }
  } catch {
    error("Failed to load sessions");
  }
}

async function runTool() {
  if (!tester.tool || !tester.session) return;
  let params: Record<string, unknown>;
  try {
    params = JSON.parse(tester.params);
  } catch {
    error("Invalid JSON params");
    return;
  }
  try {
    const endpoint = tester.tool.endpoint.replace("{session}", tester.session);
    const data = await post<unknown>(endpoint, params);
    tester.result = data;
  } catch (e) {
    tester.result = { error: String(e) };
  }
}

onMounted(async () => {
  await init();
  await loadSessions();
});
</script>
