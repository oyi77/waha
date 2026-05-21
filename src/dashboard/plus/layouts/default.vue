<template>
  <div class="app-shell">
    <nav class="sidebar" :class="{ open: sidebarOpen }">
      <div class="sidebar-logo">
        <span class="logo-icon">🦛</span>
        <span class="logo-text">WAHA</span>
      </div>

      <div class="nav-section">
        <div class="nav-section-label">Overview</div>
        <NuxtLink to="/" class="nav-item" @click="closeSidebar">
          <span class="nav-icon">⊞</span> Dashboard
        </NuxtLink>
        <NuxtLink to="/event-monitor" class="nav-item" @click="closeSidebar">
          <span class="nav-icon">◉</span> Event Monitor
        </NuxtLink>
      </div>

      <div class="nav-section">
        <div class="nav-section-label">Sessions</div>
        <NuxtLink to="/Sessions" class="nav-item" @click="closeSidebar">
          <span class="nav-icon">◎</span> Sessions
        </NuxtLink>
        <NuxtLink to="/Workers" class="nav-item" @click="closeSidebar">
          <span class="nav-icon">⚙</span> Workers
        </NuxtLink>
      </div>

      <div class="nav-section">
        <div class="nav-section-label">Messaging</div>
        <NuxtLink to="/plus/templates" class="nav-item" @click="closeSidebar">
          <span class="nav-icon">▣</span> Templates
        </NuxtLink>
        <NuxtLink to="/plus/autoreply" class="nav-item" @click="closeSidebar">
          <span class="nav-icon">↩</span> Auto-Reply
        </NuxtLink>
        <NuxtLink to="/plus/schedule" class="nav-item" @click="closeSidebar">
          <span class="nav-icon">◷</span> Scheduling
        </NuxtLink>
        <NuxtLink to="/plus/contacts" class="nav-item" @click="closeSidebar">
          <span class="nav-icon">◑</span> Contacts
        </NuxtLink>
      </div>

      <div class="nav-section">
        <div class="nav-section-label">Analytics</div>
        <NuxtLink to="/plus/analytics" class="nav-item" @click="closeSidebar">
          <span class="nav-icon">▲</span> Analytics
        </NuxtLink>
      </div>

      <div class="nav-section">
        <div class="nav-section-label">Settings</div>
        <NuxtLink to="/Settings" class="nav-item" @click="closeSidebar">
          <span class="nav-icon">⚙</span> Settings
        </NuxtLink>
        <NuxtLink to="/plus/apikeys" class="nav-item" @click="closeSidebar">
          <span class="nav-icon">⚿</span> API Keys
        </NuxtLink>
        <NuxtLink to="/plus/engines" class="nav-item" @click="closeSidebar">
          <span class="nav-icon">◈</span> Engines
        </NuxtLink>
        <NuxtLink to="/plus/mcp" class="nav-item" @click="closeSidebar">
          <span class="nav-icon">⬡</span> MCP Server
        </NuxtLink>
        <NuxtLink to="/plus/skills" class="nav-item" @click="closeSidebar">
          <span class="nav-icon">✧</span> Claude Skills
        </NuxtLink>
      </div>
    </nav>

    <div class="content-area">
      <header class="topbar">
        <button class="menu-btn" @click="sidebarOpen = !sidebarOpen">
          <span>☰</span>
        </button>
        <span class="topbar-title">{{ pageTitle }}</span>
        <div class="topbar-spacer" />
        <a
          href="https://waha.devlike.pro/docs"
          target="_blank"
          rel="noopener"
          class="topbar-link"
          >Docs ↗</a
        >
      </header>

      <main>
        <slot />
      </main>
    </div>

    <div v-if="sidebarOpen" class="sidebar-overlay" @click="closeSidebar" />

    <WahaToasts />
  </div>
</template>

<script setup lang="ts">
const route = useRoute();
const sidebarOpen = ref(false);

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/Sessions": "Sessions",
  "/Workers": "Workers",
  "/event-monitor": "Event Monitor",
  "/plus": "Plus Dashboard",
  "/plus/sessions": "Session Manager",
  "/Settings": "Settings",
  "/plus/analytics": "Analytics",
  "/plus/schedule": "Scheduling",
  "/plus/templates": "Templates",
  "/plus/autoreply": "Auto-Reply",
  "/plus/apikeys": "API Keys",
  "/plus/contacts": "Contacts",
  "/plus/mcp": "MCP Server",
  "/plus/engines": "Engines",
  "/plus/skills": "Claude Skills",
};

const pageTitle = computed(() => pageTitles[route.path] ?? "WAHA");

function closeSidebar() {
  sidebarOpen.value = false;
}
</script>

<style scoped>
.app-shell {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: var(--nav-width);
  background: var(--nav-bg);
  border-right: 1px solid var(--border);
  backdrop-filter: blur(12px);
  display: flex;
  flex-direction: column;
  padding: 0 0 24px 0;
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  overflow-y: auto;
  z-index: 200;
  transition: transform 0.25s ease;
}

.content-area {
  margin-left: var(--nav-width);
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 16px;
}

.logo-icon {
  font-size: 22px;
}

.logo-text {
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 1px;
}

.nav-section {
  padding: 0 12px;
  margin-bottom: 8px;
}

.nav-section-label {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 8px 8px 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.plus-badge {
  font-size: 12px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.15s;
  margin-bottom: 2px;
}

.nav-item:hover {
  background: rgba(34, 197, 94, 0.08);
  color: var(--text);
}

.nav-item.router-link-active {
  background: rgba(34, 197, 94, 0.12);
  color: var(--accent);
  border-left: 2px solid var(--accent);
  padding-left: 8px;
}

.nav-icon {
  font-size: 14px;
  width: 18px;
  text-align: center;
}

.topbar {
  height: var(--topbar-height);
  background: rgba(8, 12, 10, 0.9);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 24px;
  gap: 16px;
  position: sticky;
  top: 0;
  z-index: 100;
}

.topbar-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.topbar-spacer {
  flex: 1;
}

.topbar-link {
  font-size: 12px;
  color: var(--text-dim);
}

.topbar-link:hover {
  color: var(--accent);
}

.menu-btn {
  display: none;
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--border);
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  font-size: 16px;
}

.sidebar-overlay {
  display: none;
}

@media (max-width: 768px) {
  .sidebar {
    transform: translateX(-100%);
  }

  .sidebar.open {
    transform: translateX(0);
  }

  .content-area {
    margin-left: 0;
  }

  .menu-btn {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sidebar-overlay {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 150;
  }
}
</style>
