/**
 * WAHA Plus — Floating Nav Launcher
 * Injects a "✦ Plus" floating button into any dashboard page.
 * Expands to a mini menu of all Plus feature links.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'waha-plus-nav-open';

  const NAV_ITEMS = [
    { icon: '📱', label: 'Sessions Manager',   href: '/dashboard/plus/sessions.html' },
    { icon: '⏰', label: 'Message Scheduling', href: '/dashboard/plus/schedule.html' },
    { icon: '📋', label: 'Templates',          href: '/dashboard/plus/templates.html' },
    { icon: '🤖', label: 'Auto-Reply Rules',   href: '/dashboard/plus/autoreply.html' },
    { icon: '📊', label: 'Analytics',          href: '/dashboard/plus/analytics.html', badge: 'New' },
    { icon: '🔑', label: 'API Keys',           href: '/dashboard/plus/apikeys.html',   badge: 'New' },
    { icon: '📇', label: 'Contact Import',     href: '/dashboard/plus/contacts.html',  badge: 'New' },
    { icon: '🔌', label: 'MCP Server',         href: '/dashboard/plus/mcp.html' },
    { icon: '⚙️', label: 'Engine Guide',       href: '/dashboard/plus/engines.html' },
  ];

  const CSS = `
    #waha-plus-fab-wrap {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }

    #waha-plus-btn {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 11px 20px;
      background: rgba(10,15,10,0.95);
      border: 1px solid rgba(34,197,94,0.45);
      border-radius: 999px;
      color: #22c55e;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 4px 24px rgba(0,0,0,0.5), 0 0 0 0 rgba(34,197,94,0.3);
      transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
      user-select: none;
      letter-spacing: 0.01em;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }

    #waha-plus-btn:hover {
      border-color: rgba(34,197,94,0.75);
      box-shadow: 0 4px 28px rgba(0,0,0,0.55), 0 0 18px rgba(34,197,94,0.15);
      transform: translateY(-1px);
    }

    #waha-plus-btn:active {
      transform: translateY(0);
    }

    #waha-plus-btn .plus-star {
      font-style: normal;
      display: inline-block;
      transition: transform 0.3s;
    }

    #waha-plus-fab-wrap.open #waha-plus-btn .plus-star {
      transform: rotate(45deg);
    }

    #waha-plus-menu {
      position: absolute;
      bottom: calc(100% + 10px);
      right: 0;
      width: 240px;
      background: rgba(10,15,10,0.97);
      border: 1px solid rgba(34,197,94,0.2);
      border-radius: 16px;
      padding: 8px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(34,197,94,0.05);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);

      opacity: 0;
      pointer-events: none;
      transform: translateY(8px) scale(0.97);
      transform-origin: bottom right;
      transition: opacity 0.18s ease, transform 0.18s ease;
    }

    #waha-plus-fab-wrap.open #waha-plus-menu {
      opacity: 1;
      pointer-events: all;
      transform: translateY(0) scale(1);
    }

    .waha-plus-menu-header {
      padding: 8px 12px 6px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(34,197,94,0.45);
      border-bottom: 1px solid rgba(34,197,94,0.1);
      margin-bottom: 4px;
    }

    .waha-plus-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      border-radius: 9px;
      text-decoration: none;
      color: #e2e8e0;
      font-size: 13px;
      font-weight: 500;
      transition: background 0.13s, color 0.13s;
      position: relative;
    }

    .waha-plus-item:hover {
      background: rgba(34,197,94,0.1);
      color: #f0fdf4;
    }

    .waha-plus-item .item-icon {
      font-size: 15px;
      width: 22px;
      text-align: center;
      flex-shrink: 0;
    }

    .waha-plus-item .item-label {
      flex: 1;
    }

    .waha-plus-badge {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: rgba(34,197,94,0.18);
      color: #22c55e;
      border: 1px solid rgba(34,197,94,0.3);
      border-radius: 4px;
      padding: 1px 5px;
    }

    .waha-plus-item.active-page {
      background: rgba(34,197,94,0.08);
      color: #22c55e;
    }
    .waha-plus-item.active-page::before {
      content: '';
      position: absolute;
      left: 0;
      top: 20%;
      bottom: 20%;
      width: 2px;
      background: #22c55e;
      border-radius: 2px;
    }
  `;

  function buildHTML() {
    const currentPath = window.location.pathname;
    const items = NAV_ITEMS.map(item => {
      const isActive = currentPath === item.href || currentPath.endsWith(item.href);
      const badgeHTML = item.badge ? `<span class="waha-plus-badge">${item.badge}</span>` : '';
      return `<a class="waha-plus-item${isActive ? ' active-page' : ''}" href="${item.href}">
        <span class="item-icon">${item.icon}</span>
        <span class="item-label">${item.label}</span>
        ${badgeHTML}
      </a>`;
    }).join('');

    return `
      <div id="waha-plus-menu">
        <div class="waha-plus-menu-header">WAHA Plus Features</div>
        ${items}
      </div>
      <button id="waha-plus-btn" aria-label="Open WAHA Plus navigation" aria-expanded="false">
        <em class="plus-star">✦</em>
        Plus
      </button>
    `;
  }

  function init() {
    // Inject styles
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // Create wrapper
    const wrap = document.createElement('div');
    wrap.id = 'waha-plus-fab-wrap';
    wrap.innerHTML = buildHTML();
    document.body.appendChild(wrap);

    const btn = document.getElementById('waha-plus-btn');

    // Restore saved state
    if (localStorage.getItem(STORAGE_KEY) === 'true') {
      wrap.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    }

    btn.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = wrap.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(isOpen));
      localStorage.setItem(STORAGE_KEY, String(isOpen));
    });

    // Close on outside click
    document.addEventListener('click', e => {
      if (!wrap.contains(e.target)) {
        wrap.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
        localStorage.setItem(STORAGE_KEY, 'false');
      }
    });

    // Close on Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        wrap.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
        localStorage.setItem(STORAGE_KEY, 'false');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
