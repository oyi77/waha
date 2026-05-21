<template>
  <div class="page-wrapper">
    <div class="page-header">
      <div class="page-title">🧠 Claude Skills</div>
      <div class="page-subtitle">
        Ready-to-use Claude Code skill definitions for WhatsApp automation
      </div>
    </div>

    <!-- Skill: waha-send -->
    <div class="card" style="margin-bottom: 24px">
      <div
        style="
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        "
      >
        <span
          style="
            font-family: var(--font-mono);
            font-size: 16px;
            color: #4ade80;
            font-weight: 500;
          "
          >/waha-send</span
        >
        <span class="badge badge-active">Send Messages</span>
      </div>
      <p
        style="
          font-size: 13px;
          color: var(--text-muted);
          margin-bottom: 16px;
          line-height: 1.5;
        "
      >
        Send WhatsApp messages directly from Claude. Ask Claude to send a
        message and it will call the WAHA API automatically.
      </p>
      <div style="position: relative">
        <div
          class="code-block"
          style="white-space: pre-wrap; padding-right: 80px"
        >
          {{ skillSend }}
        </div>
        <button
          class="btn-secondary"
          style="
            position: absolute;
            top: 10px;
            right: 10px;
            font-size: 12px;
            padding: 4px 10px;
          "
          @click="copyText(skillSend, 'send')"
        >
          {{ copied.send ? "Copied!" : "Copy" }}
        </button>
      </div>
    </div>

    <!-- Skill: waha-broadcast -->
    <div class="card" style="margin-bottom: 24px">
      <div
        style="
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        "
      >
        <span
          style="
            font-family: var(--font-mono);
            font-size: 16px;
            color: #4ade80;
            font-weight: 500;
          "
          >/waha-broadcast</span
        >
        <span class="badge badge-active">Broadcast</span>
      </div>
      <p
        style="
          font-size: 13px;
          color: var(--text-muted);
          margin-bottom: 16px;
          line-height: 1.5;
        "
      >
        Broadcast a message to multiple WhatsApp contacts at once. Claude will
        ask for the contact list and message, then send to all of them.
      </p>
      <div style="position: relative">
        <div
          class="code-block"
          style="white-space: pre-wrap; padding-right: 80px"
        >
          {{ skillBroadcast }}
        </div>
        <button
          class="btn-secondary"
          style="
            position: absolute;
            top: 10px;
            right: 10px;
            font-size: 12px;
            padding: 4px 10px;
          "
          @click="copyText(skillBroadcast, 'broadcast')"
        >
          {{ copied.broadcast ? "Copied!" : "Copy" }}
        </button>
      </div>
    </div>

    <!-- Skill: waha-status -->
    <div class="card" style="margin-bottom: 24px">
      <div
        style="
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        "
      >
        <span
          style="
            font-family: var(--font-mono);
            font-size: 16px;
            color: #4ade80;
            font-weight: 500;
          "
          >/waha-status</span
        >
        <span class="badge badge-active">Session Status</span>
      </div>
      <p
        style="
          font-size: 13px;
          color: var(--text-muted);
          margin-bottom: 16px;
          line-height: 1.5;
        "
      >
        Check WAHA session status and get the QR code for authentication. Claude
        will report the session state and show the QR code URL if needed.
      </p>
      <div style="position: relative">
        <div
          class="code-block"
          style="white-space: pre-wrap; padding-right: 80px"
        >
          {{ skillStatus }}
        </div>
        <button
          class="btn-secondary"
          style="
            position: absolute;
            top: 10px;
            right: 10px;
            font-size: 12px;
            padding: 4px 10px;
          "
          @click="copyText(skillStatus, 'status')"
        >
          {{ copied.status ? "Copied!" : "Copy" }}
        </button>
      </div>
    </div>

    <!-- How to Install -->
    <div class="card" style="margin-bottom: 24px">
      <div class="section-title">How to Install</div>
      <div
        style="
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-top: 16px;
        "
      >
        <div
          v-for="step in installSteps"
          :key="step.num"
          style="display: flex; gap: 16px; align-items: flex-start"
        >
          <div
            style="
              width: 28px;
              height: 28px;
              border-radius: 50%;
              background: rgba(34, 197, 94, 0.15);
              border: 1px solid rgba(34, 197, 94, 0.3);
              color: #22c55e;
              font-size: 13px;
              font-weight: 600;
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
              margin-top: 2px;
            "
          >
            {{ step.num }}
          </div>
          <div>
            <div
              style="
                font-size: 14px;
                color: var(--text-primary);
                font-weight: 500;
                margin-bottom: 6px;
              "
            >
              {{ step.title }}
            </div>
            <div
              style="
                font-size: 13px;
                color: var(--text-muted);
                line-height: 1.5;
              "
              v-html="step.desc"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Alternative: MCP Connection -->
    <div class="card">
      <div class="section-title">Alternative: WAHA MCP Connection</div>
      <p
        style="
          font-size: 13px;
          color: var(--text-muted);
          margin-bottom: 16px;
          line-height: 1.5;
        "
      >
        Instead of individual skills, connect Claude Code directly to WAHA via
        MCP for full tool access. This gives Claude access to all 15 WAHA tools
        without any skill files.
      </p>
      <div class="form-label" style="margin-bottom: 8px">
        Claude Code Settings (<code
          style="font-family: var(--font-mono); color: var(--accent)"
          >~/.claude/settings.json</code
        >)
      </div>
      <div style="position: relative">
        <div
          class="code-block"
          style="white-space: pre-wrap; padding-right: 80px"
        >
          {{ mcpConfig }}
        </div>
        <button
          class="btn-secondary"
          style="
            position: absolute;
            top: 10px;
            right: 10px;
            font-size: 12px;
            padding: 4px 10px;
          "
          @click="copyText(mcpConfig, 'mcp')"
        >
          {{ copied.mcp ? "Copied!" : "Copy" }}
        </button>
      </div>
      <p
        style="
          font-size: 12px;
          color: rgba(134, 239, 172, 0.5);
          margin-top: 12px;
        "
      >
        After adding this config, restart Claude Code. You'll see all waha_*
        tools available automatically.
      </p>
      <p style="margin-top: 16px">
        <NuxtLink to="/plus/mcp" style="color: var(--accent); font-size: 13px"
          >→ View full MCP documentation</NuxtLink
        >
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
const { init, apiKey } = useWahaApi();
const { error } = useToast();
const origin = computed(() =>
  typeof window !== "undefined" ? window.location.origin : "",
);

const copied = reactive<Record<string, boolean>>({
  send: false,
  broadcast: false,
  status: false,
  mcp: false,
});

const skillSend = computed(() => {
  const url = origin.value;
  const key = apiKey.value;
  return `---
name: waha-send
description: Send WhatsApp messages via WAHA API
triggers:
  - send whatsapp
  - whatsapp message
---

Send a WhatsApp message via WAHA.

Steps:
1. Ask the user for:
   - Session name (default: "default")
   - Recipient phone number or chatId (e.g. "15551234567@c.us")
   - Message text to send

2. Call the WAHA API:
   POST ${url}/api/sendText
   Headers:
     Content-Type: application/json
     Authorization: Bearer ${key}
   Body:
     {
       "session": "<session>",
       "chatId": "<phone>@c.us",
       "text": "<message>"
     }

3. Show the API response to the user. If successful, confirm the message was sent.
   If an error occurs, explain what went wrong and suggest checking the session status.`;
});

const skillBroadcast = computed(() => {
  const url = origin.value;
  const key = apiKey.value;
  return `---
name: waha-broadcast
description: Broadcast WhatsApp messages to multiple contacts via WAHA API
triggers:
  - broadcast whatsapp
  - send to multiple
  - bulk whatsapp
---

Broadcast a WhatsApp message to multiple contacts via WAHA.

Steps:
1. Ask the user for:
   - Session name (default: "default")
   - List of recipient phone numbers (comma-separated or one per line)
   - Message text to send
   - Delay between messages in ms (default: 500, to avoid rate limiting)

2. Format the phone numbers as chatIds (add "@c.us" if not already present).

3. Call the WAHA broadcast API:
   POST ${url}/api/broadcast/text
   Headers:
     Content-Type: application/json
     Authorization: Bearer ${key}
   Body:
     {
       "session": "<session>",
       "chatIds": ["<phone1>@c.us", "<phone2>@c.us"],
       "text": "<message>",
       "delayMs": 500
     }

4. Show the result to the user: how many messages were sent successfully and any failures.`;
});

const skillStatus = computed(() => {
  const url = origin.value;
  const key = apiKey.value;
  return `---
name: waha-status
description: Check WAHA session status and get QR code for authentication
triggers:
  - waha status
  - whatsapp status
  - session qr
---

Check the status of a WAHA WhatsApp session.

Steps:
1. Ask the user for the session name (default: "default").

2. Fetch session info:
   GET ${url}/api/sessions/<session>
   Headers:
     Authorization: Bearer ${key}

3. Report the session status to the user:
   - WORKING: Session is connected and ready
   - STARTING: Session is initializing
   - SCAN_QR_CODE: User needs to scan a QR code
   - STOPPED: Session is not running
   - FAILED: Session encountered an error

4. If status is SCAN_QR_CODE, provide the QR code URL:
   ${url}/api/<session>/auth/qr
   Tell the user to open this URL in a browser to scan the QR code with their WhatsApp app.

5. If status is STOPPED or FAILED, offer to start/restart the session by calling:
   POST ${url}/api/sessions/start
   Body: { "name": "<session>" }`;
});

const mcpConfig = computed(() => {
  return JSON.stringify(
    {
      mcpServers: {
        waha: {
          type: "sse",
          url: `${origin.value}/api/mcp`,
          headers: { Authorization: `Bearer ${apiKey.value}` },
        },
      },
    },
    null,
    2,
  );
});

const installSteps = [
  {
    num: 1,
    title: "Copy a skill above",
    desc: 'Click "Copy" on any skill definition to copy the markdown content to your clipboard.',
  },
  {
    num: 2,
    title: "Create the skill file",
    desc: `Save the copied content to <code style="font-family: var(--font-mono); font-size: 12px; background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.2); border-radius: 4px; padding: 1px 6px; color: #4ade80;">~/.claude/skills/waha-send.md</code> (or the appropriate skill name). Create the directory if it doesn't exist: <code style="font-family: var(--font-mono); font-size: 12px; background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.2); border-radius: 4px; padding: 1px 6px; color: #4ade80;">mkdir -p ~/.claude/skills</code>`,
  },
  {
    num: 3,
    title: "Set your WAHA URL",
    desc: `Update the <code style="font-family: var(--font-mono); font-size: 12px; background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.2); border-radius: 4px; padding: 1px 6px; color: #4ade80;">WAHA_URL</code> and <code style="font-family: var(--font-mono); font-size: 12px; background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.2); border-radius: 4px; padding: 1px 6px; color: #4ade80;">API_KEY</code> placeholders in the skill file with your actual WAHA instance URL and API key.`,
  },
  {
    num: 4,
    title: "Use in Claude Code",
    desc: `Run <code style="font-family: var(--font-mono); font-size: 12px; background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.2); border-radius: 4px; padding: 1px 6px; color: #4ade80;">/waha-send</code> in Claude Code to invoke the skill. Claude will ask for the required details and send the message.`,
  },
];

async function copyText(text: string, key: string) {
  try {
    await navigator.clipboard.writeText(text);
    copied[key] = true;
    setTimeout(() => {
      copied[key] = false;
    }, 1500);
  } catch {
    error("Failed to copy to clipboard");
  }
}

onMounted(() => init());
</script>
