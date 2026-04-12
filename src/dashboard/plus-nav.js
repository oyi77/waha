/**
 * WAHA Plus — Sidebar Injector
 *
 * Appends a "Plus" section to the Nuxt dashboard's left sidebar by
 * observing the DOM until `ul.layout-menu` (rendered by Vue) appears,
 * then inserting a sibling `<ul>` that is never touched by Vue's virtual
 * DOM reconciler.
 *
 * DOM structure produced (mirrors the existing AppMenu markup):
 *
 *   div.layout-sidebar
 *     ul.layout-menu              ← Vue-managed (not touched)
 *     ul.layout-menu#waha-plus-nav  ← our injection (sibling)
 *       li.layout-root-menuitem
 *         div.layout-menuitem-root-text  "Plus"
 *         ul.layout-submenu
 *           li > a[href] > i.pi + span.layout-menuitem-text
 *           ...
 */
(function () {
  'use strict';

  var SECTION_ID = 'waha-plus-nav';
  var OBSERVER_LAYOUT_TIMEOUT_MS = 30000;

  var NAV_ITEMS = [
    { icon: 'pi-whatsapp',  label: 'Sessions',   href: '/dashboard/plus/sessions.html'  },
    { icon: 'pi-clock',     label: 'Scheduling',  href: '/dashboard/plus/schedule.html'  },
    { icon: 'pi-file',      label: 'Templates',   href: '/dashboard/plus/templates.html' },
    { icon: 'pi-bolt',      label: 'Auto-Reply',  href: '/dashboard/plus/autoreply.html' },
    { icon: 'pi-chart-bar', label: 'Analytics',   href: '/dashboard/plus/analytics.html' },
    { icon: 'pi-key',       label: 'API Keys',    href: '/dashboard/plus/apikeys.html'   },
    { icon: 'pi-users',     label: 'Contacts',    href: '/dashboard/plus/contacts.html'  },
    { icon: 'pi-code',      label: 'MCP Server',  href: '/dashboard/plus/mcp.html'       },
    { icon: 'pi-cog',       label: 'Engines',     href: '/dashboard/plus/engines.html'   },
  ];

  function buildSection() {
    var root = document.createElement('ul');
    root.id = SECTION_ID;
    root.className = 'layout-menu';

    var sectionLi = document.createElement('li');
    sectionLi.className = 'layout-root-menuitem';

    var header = document.createElement('div');
    header.className = 'layout-menuitem-root-text';
    header.textContent = 'Plus';

    var submenu = document.createElement('ul');
    submenu.className = 'layout-submenu';
    // Vue's v-show sets display:block for root items; set it explicitly
    // because Vue does not manage this element.
    submenu.style.display = 'block';

    for (var i = 0; i < NAV_ITEMS.length; i++) {
      var item = NAV_ITEMS[i];

      var li = document.createElement('li');

      var a = document.createElement('a');
      a.href = item.href;
      a.tabIndex = 0;

      var icon = document.createElement('i');
      icon.className = 'pi pi-fw ' + item.icon + ' layout-menuitem-icon';

      var text = document.createElement('span');
      text.className = 'layout-menuitem-text';
      text.textContent = item.label;

      a.appendChild(icon);
      a.appendChild(text);
      li.appendChild(a);
      submenu.appendChild(li);
    }

    sectionLi.appendChild(header);
    sectionLi.appendChild(submenu);
    root.appendChild(sectionLi);

    return root;
  }

  function inject() {
    if (document.getElementById(SECTION_ID)) {
      return true;
    }

    var layoutMenu = document.querySelector('.layout-sidebar ul.layout-menu');
    if (!layoutMenu) {
      return false;
    }

    layoutMenu.insertAdjacentElement('afterend', buildSection());
    return true;
  }

  function startObserver() {
    if (inject()) {
      return;
    }

    var observer = new MutationObserver(function () {
      if (inject()) {
        observer.disconnect();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Safety valve: stop watching after 30 s in case the layout never renders.
    setTimeout(function () {
      observer.disconnect();
    }, OBSERVER_LAYOUT_TIMEOUT_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }
}());
