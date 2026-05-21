<template>
  <div class="page-wrapper">
    <div class="page-header">
      <div class="page-title">✦ Plus Hub</div>
      <div class="page-subtitle">WAHA Plus — advanced features overview</div>
    </div>

    <div class="stats-row grid-3 stagger">
      <div class="stat-card">
        <div class="stat-card-value">{{ stats.scheduled }}</div>
        <div class="stat-card-label">Scheduled Messages</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-value">{{ stats.templates }}</div>
        <div class="stat-card-label">Message Templates</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-value">{{ stats.rules }}</div>
        <div class="stat-card-label">Auto-Reply Rules</div>
      </div>
    </div>

    <div class="section-title" style="margin-top: 32px; margin-bottom: 16px">
      Features
    </div>

    <div class="features-grid stagger">
      <NuxtLink
        v-for="feat in features"
        :key="feat.href"
        :to="feat.href"
        class="feature-card"
      >
        <div class="feature-icon">{{ feat.icon }}</div>
        <div class="feature-name">{{ feat.name }}</div>
        <div class="feature-desc">{{ feat.desc }}</div>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
const { get } = useWahaApi();

const stats = reactive({ scheduled: 0, templates: 0, rules: 0 });

const features = [
  {
    href: "/plus/sessions",
    icon: "◎",
    name: "Session Manager",
    desc: "Manage multiple WhatsApp sessions with advanced controls",
  },
  {
    href: "/plus/schedule",
    icon: "◷",
    name: "Scheduling",
    desc: "Schedule messages to be sent at a specific date and time",
  },
  {
    href: "/plus/templates",
    icon: "▣",
    name: "Templates",
    desc: "Create reusable message templates for quick sending",
  },
  {
    href: "/plus/autoreply",
    icon: "↩",
    name: "Auto-Reply",
    desc: "Set up keyword-based automatic reply rules",
  },
  {
    href: "/plus/analytics",
    icon: "▲",
    name: "Analytics",
    desc: "View message statistics and session activity charts",
  },
  {
    href: "/plus/apikeys",
    icon: "⚿",
    name: "API Keys",
    desc: "Manage API keys for accessing WAHA endpoints",
  },
  {
    href: "/plus/contacts",
    icon: "◑",
    name: "Contacts",
    desc: "Bulk-check and import WhatsApp contacts from CSV",
  },
  {
    href: "/plus/mcp",
    icon: "⬡",
    name: "MCP Server",
    desc: "Use WAHA as an MCP server for Claude AI agents",
  },
  {
    href: "/plus/engines",
    icon: "◈",
    name: "Engines",
    desc: "Compare and choose the right WhatsApp engine",
  },
  {
    href: "/plus/skills",
    icon: "✧",
    name: "Claude Skills",
    desc: "Install WAHA skills directly into Claude Desktop",
  },
];

async function loadStats() {
  try {
    const [sched, tmpl, rules] = await Promise.allSettled([
      get<unknown[]>("/api/schedule"),
      get<unknown[]>("/api/templates"),
      get<unknown[]>("/api/autoreply"),
    ]);
    if (sched.status === "fulfilled")
      stats.scheduled = (sched.value as unknown[]).length;
    if (tmpl.status === "fulfilled")
      stats.templates = (tmpl.value as unknown[]).length;
    if (rules.status === "fulfilled")
      stats.rules = (rules.value as unknown[]).length;
  } catch {}
}

onMounted(loadStats);
</script>

<style scoped>
.stats-row {
  margin-bottom: 8px;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.feature-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 22px;
  text-decoration: none;
  transition:
    border-color 0.2s,
    transform 0.2s;
  display: block;
}

.feature-card:hover {
  border-color: var(--border-hover);
  transform: translateY(-2px);
}

.feature-icon {
  font-size: 26px;
  margin-bottom: 10px;
}

.feature-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 6px;
}

.feature-desc {
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.5;
}
</style>
