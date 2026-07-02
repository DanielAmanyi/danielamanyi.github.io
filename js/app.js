/**
 * app.js
 * -----------------------------------------------------------------------
 * Renders the control panel from data.js, runs the command palette,
 * tracks "recently visited" / "recent documents" in localStorage, and
 * wires up keyboard shortcuts. No frameworks, no build step.
 * -----------------------------------------------------------------------
 */
(function () {
  "use strict";

  const STORAGE_KEYS = {
    visited: "cp_recent_portals",
    documents: "cp_recent_documents",
  };

  /* ----------------------------------------------------------------- *
   * Icons — small inline SVGs, one per portal, keyed by data.js `icon`.
   * ----------------------------------------------------------------- */
  const ICONS = {
    home:      '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 8.5L9 3l6 5.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 7.5V15h9V7.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    docs:      '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="4" y="2.5" width="10" height="13" rx="1.2" stroke="currentColor" stroke-width="1.4"/><path d="M6.5 6H11.5M6.5 8.7H11.5M6.5 11.4H9.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    library:   '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 3.5H7.5V14.5H3V3.5Z" stroke="currentColor" stroke-width="1.3"/><path d="M8.7 4L12.8 3.1L15 13.7L10.9 14.6" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    titan:     '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2.5L15.5 6.2V11.8L9 15.5L2.5 11.8V6.2L9 2.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><circle cx="9" cy="9" r="2.1" stroke="currentColor" stroke-width="1.3"/></svg>',
    pretitan:  '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2.5L15.5 6.2V11.8L9 15.5L2.5 11.8V6.2L9 2.5Z" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2.2 2.2"/></svg>',
    interview: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 4.5H15V11.5H7.3L4.6 14V11.5H3V4.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6 7.5H12M6 9.3H10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
    evaluator: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 14V9.5M9 14V4M14 14V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    meridian:  '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="6.3" stroke="currentColor" stroke-width="1.3"/><path d="M2.7 9H15.3M9 2.7C10.8 4.6 11.7 6.7 11.7 9C11.7 11.3 10.8 13.4 9 15.3C7.2 13.4 6.3 11.3 6.3 9C6.3 6.7 7.2 4.6 9 2.7Z" stroke="currentColor" stroke-width="1.1"/></svg>',
    boss:      '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="6" r="2.6" stroke="currentColor" stroke-width="1.3"/><path d="M3.5 15C3.9 11.7 6.1 10 9 10C11.9 10 14.1 11.7 14.5 15" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    music:     '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M6.5 12.3V4.2L14 2.7V10.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="4.8" cy="12.6" r="1.8" stroke="currentColor" stroke-width="1.3"/><circle cx="12.2" cy="11.1" r="1.8" stroke="currentColor" stroke-width="1.3"/></svg>',
    note:      '<svg width="14" height="14" viewBox="0 0 18 18" fill="none"><rect x="4" y="2.5" width="10" height="13" rx="1.2" stroke="currentColor" stroke-width="1.4"/><path d="M6.5 6H11.5M6.5 8.7H11.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    pdf:       '<svg width="14" height="14" viewBox="0 0 18 18" fill="none"><path d="M5 2H11L14 5V16H5V2Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M11 2V5H14" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    clock:     '<svg width="14" height="14" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.3"/><path d="M9 5.5V9L11.3 10.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    bolt:      '<svg width="14" height="14" viewBox="0 0 18 18" fill="none"><path d="M9.5 2L4 10.5H8.5L7.5 16L14 7H9.5L9.5 2Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  };
  const icon = (name) => ICONS[name] || ICONS.note;

  /* ----------------------------------------------------------------- *
   * Storage helpers
   * ----------------------------------------------------------------- */
  function readList(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function pushRecent(key, entry, max) {
    let list = readList(key).filter((item) => item.id !== entry.id);
    list.unshift({ ...entry, ts: Date.now() });
    list = list.slice(0, max || 8);
    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch (e) {
      /* storage unavailable — degrade silently */
    }
    return list;
  }

  function recordPortalVisit(portal) {
    pushRecent(STORAGE_KEYS.visited, { id: portal.id, name: portal.name, icon: portal.icon, path: portal.path, category: portal.category });
  }

  function recordDocumentVisit(doc) {
    pushRecent(STORAGE_KEYS.documents, { id: doc.id, title: doc.title, source: doc.source, href: doc.href, kind: doc.kind });
  }

  function relativeTime(ts) {
    const diff = Math.max(0, Date.now() - ts);
    const min = Math.floor(diff / 60000);
    if (min < 1) return "just now";
    if (min < 60) return min + "m ago";
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + "h ago";
    const day = Math.floor(hr / 24);
    if (day < 7) return day + "d ago";
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function categoryColor(catId) {
    const cat = CATEGORIES[catId];
    return cat ? cat.color : "var(--cat-core)";
  }

  /* ----------------------------------------------------------------- *
   * Sidebar
   * ----------------------------------------------------------------- */
  function renderSidebar() {
    const nav = document.getElementById("sidebar-nav");
    const isHome = /(^|\/)index\.html$/.test(location.pathname) || location.pathname.endsWith("/");
    nav.innerHTML = PORTALS.map((p) => `
      <li>
        <a class="nav-link ${p.id === 'home' && isHome ? 'is-active' : ''}" href="${p.path}" data-portal="${p.id}">
          <span class="nav-dot" style="background:${categoryColor(p.category)}"></span>
          <span>${p.name}</span>
          <span class="nav-kbd">${p.shortcut}</span>
        </a>
      </li>
    `).join("");

    nav.querySelectorAll("[data-portal]").forEach((el) => {
      el.addEventListener("click", () => {
        const p = PORTALS.find((x) => x.id === el.dataset.portal);
        if (p) recordPortalVisit(p);
      });
    });
  }

  /* ----------------------------------------------------------------- *
   * Quick actions
   * ----------------------------------------------------------------- */
  function renderQuickActions() {
    const wrap = document.getElementById("quick-actions");
    wrap.innerHTML = QUICK_ACTIONS.map((qa) => `
      <button class="quick-action" data-action="${qa.action}" data-target="${qa.target || ''}">
        ${icon('bolt')}
        <span>${qa.label}</span>
        <kbd>${qa.hint}</kbd>
      </button>
    `).join("");

    wrap.querySelectorAll(".quick-action").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.action === "palette") {
          openPalette();
        } else if (btn.dataset.action === "navigate") {
          const p = PORTALS.find((x) => x.id === btn.dataset.target);
          if (p) {
            recordPortalVisit(p);
            location.href = p.path;
          }
        }
      });
    });
  }

  /* ----------------------------------------------------------------- *
   * Portal grid
   * ----------------------------------------------------------------- */
  function renderPortalGrid() {
    const grid = document.getElementById("portal-grid");
    document.getElementById("portals-count").textContent = PORTALS.length + " total";

    grid.innerHTML = PORTALS.map((p) => `
      <a class="portal-card" href="${p.path}" data-portal="${p.id}" style="--card-accent:${categoryColor(p.category)}">
        <div class="portal-card-top">
          <div class="portal-icon">${icon(p.icon)}</div>
          <span class="portal-kbd">${p.shortcut}</span>
        </div>
        <div>
          <h3 class="portal-name">${p.name}</h3>
          <p class="portal-desc">${p.description}</p>
          <div class="portal-path">~/${p.path.replace(/index\.html$/, "").replace(/\/$/, "") || p.id}</div>
        </div>
      </a>
    `).join("");

    grid.querySelectorAll("[data-portal]").forEach((el) => {
      el.addEventListener("click", () => {
        const p = PORTALS.find((x) => x.id === el.dataset.portal);
        if (p) recordPortalVisit(p);
      });
    });
  }

  /* ----------------------------------------------------------------- *
   * Recently visited / recent documents
   * ----------------------------------------------------------------- */
  function renderRecentlyVisited() {
    const wrap = document.getElementById("recently-visited");
    const list = readList(STORAGE_KEYS.visited);

    if (!list.length) {
      wrap.innerHTML = `
        <div class="empty-state">
          <strong>Nothing visited yet</strong>
          Open a portal and it'll show up here for quick return trips.
        </div>`;
      return;
    }

    wrap.innerHTML = list.map((p) => `
      <a class="list-row" href="${p.path}" data-portal="${p.id}">
        <div class="list-icon" style="color:${categoryColor(p.category)}">${icon(p.icon)}</div>
        <div class="list-main">
          <div class="list-title">${p.name}</div>
        </div>
        <div class="list-time">${relativeTime(p.ts)}</div>
      </a>
    `).join("");

    wrap.querySelectorAll("[data-portal]").forEach((el) => {
      el.addEventListener("click", () => {
        const p = PORTALS.find((x) => x.id === el.dataset.portal);
        if (p) recordPortalVisit(p);
      });
    });
  }

  function renderRecentDocuments() {
    const wrap = document.getElementById("recent-documents");
    let list = readList(STORAGE_KEYS.documents);
    let isFallback = false;

    if (!list.length) {
      list = DEFAULT_DOCUMENTS.map((d) => ({ ...d, ts: null }));
      isFallback = true;
    }

    wrap.innerHTML = list.map((d) => `
      <a class="list-row" href="${d.href}" data-doc="${d.id}">
        <div class="list-icon">${icon(d.kind)}</div>
        <div class="list-main">
          <div class="list-title">${d.title}</div>
          <div class="list-sub">${d.source}</div>
        </div>
        <div class="list-time">${d.ts ? relativeTime(d.ts) : "suggested"}</div>
      </a>
    `).join("");

    wrap.querySelectorAll("[data-doc]").forEach((el) => {
      el.addEventListener("click", () => {
        const d = (isFallback ? DEFAULT_DOCUMENTS : list).find((x) => x.id === el.dataset.doc);
        if (d) recordDocumentVisit(d);
      });
    });
  }

  /* ----------------------------------------------------------------- *
   * Clock + greeting
   * ----------------------------------------------------------------- */
  function tickClock() {
    const el = document.getElementById("clock");
    const now = new Date();
    el.textContent = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) +
      " · " + now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }

  function setGreeting() {
    const h = new Date().getHours();
    const el = document.getElementById("greeting");
    el.textContent = h < 5 ? "Still up?" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  }

  /* ----------------------------------------------------------------- *
   * Command palette
   * ----------------------------------------------------------------- */
  const palette = {
    overlay: null,
    input: null,
    results: null,
    items: [],
    selected: 0,
  };

  function buildPaletteIndex(query) {
    const q = query.trim().toLowerCase();
    const match = (text) => !q || text.toLowerCase().includes(q);

    const portalItems = PORTALS
      .filter((p) => match(p.name) || match(p.description))
      .map((p) => ({ type: "portal", data: p }));

    const docItems = DEFAULT_DOCUMENTS
      .filter((d) => match(d.title) || match(d.source))
      .map((d) => ({ type: "document", data: d }));

    const actionItems = QUICK_ACTIONS
      .filter((qa) => match(qa.label))
      .map((qa) => ({ type: "action", data: qa }));

    return { portalItems, docItems, actionItems };
  }

  function renderPaletteResults(query) {
    const { portalItems, docItems, actionItems } = buildPaletteIndex(query);
    palette.items = [...portalItems, ...docItems, ...actionItems];
    palette.selected = 0;

    if (!palette.items.length) {
      palette.results.innerHTML = `<div class="palette-empty">No matches for "${escapeHtml(query)}". Try a portal or document name.</div>`;
      return;
    }

    let html = "";
    if (portalItems.length) {
      html += `<div class="palette-group-label">Portals</div>`;
      html += portalItems.map((it, i) => paletteRow(it, indexOf(it))).join("");
    }
    if (docItems.length) {
      html += `<div class="palette-group-label">Documents</div>`;
      html += docItems.map((it) => paletteRow(it, indexOf(it))).join("");
    }
    if (actionItems.length) {
      html += `<div class="palette-group-label">Quick Actions</div>`;
      html += actionItems.map((it) => paletteRow(it, indexOf(it))).join("");
    }
    palette.results.innerHTML = html;
    highlightSelected();
    attachPaletteRowEvents();
  }

  function indexOf(item) {
    return palette.items.indexOf(item);
  }

  function paletteRow(item, idx) {
    if (item.type === "portal") {
      const p = item.data;
      return `
        <div class="palette-item" data-idx="${idx}" style="--card-accent:${categoryColor(p.category)}">
          <div class="palette-item-icon">${icon(p.icon)}</div>
          <span class="palette-item-title">${p.name}</span>
          <span class="palette-item-sub">${p.shortcut}</span>
        </div>`;
    }
    if (item.type === "document") {
      const d = item.data;
      return `
        <div class="palette-item" data-idx="${idx}">
          <div class="palette-item-icon">${icon(d.kind)}</div>
          <span class="palette-item-title">${d.title}</span>
          <span class="palette-item-sub">${d.source}</span>
        </div>`;
    }
    const qa = item.data;
    return `
      <div class="palette-item" data-idx="${idx}">
        <div class="palette-item-icon">${icon('bolt')}</div>
        <span class="palette-item-title">${qa.label}</span>
        <span class="palette-item-sub">${qa.hint}</span>
      </div>`;
  }

  function attachPaletteRowEvents() {
    palette.results.querySelectorAll(".palette-item").forEach((row) => {
      row.addEventListener("mouseenter", () => {
        palette.selected = Number(row.dataset.idx);
        highlightSelected();
      });
      row.addEventListener("click", () => {
        palette.selected = Number(row.dataset.idx);
        commitSelection();
      });
    });
  }

  function highlightSelected() {
    palette.results.querySelectorAll(".palette-item").forEach((row) => {
      row.classList.toggle("is-selected", Number(row.dataset.idx) === palette.selected);
    });
    const active = palette.results.querySelector(".is-selected");
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  function commitSelection() {
    const item = palette.items[palette.selected];
    if (!item) return;

    if (item.type === "portal") {
      recordPortalVisit(item.data);
      location.href = item.data.path;
    } else if (item.type === "document") {
      recordDocumentVisit(item.data);
      location.href = item.data.href;
    } else if (item.type === "action") {
      const qa = item.data;
      closePalette();
      if (qa.action === "navigate") {
        const p = PORTALS.find((x) => x.id === qa.target);
        if (p) {
          recordPortalVisit(p);
          location.href = p.path;
        }
      }
      // action === "palette" while already open: no-op
    }
  }

  function openPalette() {
    palette.overlay.hidden = false;
    palette.input.value = "";
    renderPaletteResults("");
    requestAnimationFrame(() => palette.input.focus());
  }

  function closePalette() {
    palette.overlay.hidden = true;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function initPalette() {
    palette.overlay = document.getElementById("palette-overlay");
    palette.input = document.getElementById("palette-input");
    palette.results = document.getElementById("palette-results");

    document.getElementById("search-trigger").addEventListener("click", openPalette);

    palette.overlay.addEventListener("click", (e) => {
      if (e.target === palette.overlay) closePalette();
    });

    palette.input.addEventListener("input", () => renderPaletteResults(palette.input.value));

    palette.input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        palette.selected = Math.min(palette.selected + 1, palette.items.length - 1);
        highlightSelected();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        palette.selected = Math.max(palette.selected - 1, 0);
        highlightSelected();
      } else if (e.key === "Enter") {
        e.preventDefault();
        commitSelection();
      } else if (e.key === "Escape") {
        closePalette();
      }
    });
  }

  /* ----------------------------------------------------------------- *
   * Global keyboard shortcuts
   * ----------------------------------------------------------------- */
  function initGlobalShortcuts() {
    document.addEventListener("keydown", (e) => {
      const inPalette = !palette.overlay.hidden;
      const typingElsewhere = ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName) && !inPalette;

      // Cmd/Ctrl+K always opens/toggles the palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inPalette ? closePalette() : openPalette();
        return;
      }

      if (inPalette) return; // let palette's own handler manage keys
      if (typingElsewhere) return;

      if (e.key === "/") {
        e.preventDefault();
        openPalette();
        return;
      }

      if (e.key === "Escape") {
        closeMobileSidebar();
        return;
      }

      // Single-letter portal shortcuts (e.g. "T" -> TITAN)
      const p = PORTALS.find((x) => x.shortcut.toLowerCase() === e.key.toLowerCase());
      if (p && !e.metaKey && !e.ctrlKey && !e.altKey) {
        recordPortalVisit(p);
        location.href = p.path;
      }
    });
  }

  /* ----------------------------------------------------------------- *
   * Mobile sidebar
   * ----------------------------------------------------------------- */
  function initMobileSidebar() {
    const sidebar = document.getElementById("sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    const toggle = document.getElementById("menu-toggle");

    toggle.addEventListener("click", () => {
      const open = sidebar.classList.toggle("is-open");
      backdrop.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
    });
    backdrop.addEventListener("click", closeMobileSidebar);
  }

  function closeMobileSidebar() {
    document.getElementById("sidebar").classList.remove("is-open");
    document.getElementById("sidebar-backdrop").hidden = true;
    document.getElementById("menu-toggle").setAttribute("aria-expanded", "false");
  }

  /* ----------------------------------------------------------------- *
   * Init
   * ----------------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", () => {
    renderSidebar();
    renderQuickActions();
    renderPortalGrid();
    renderRecentlyVisited();
    renderRecentDocuments();
    setGreeting();
    tickClock();
    setInterval(tickClock, 30000);
    initPalette();
    initGlobalShortcuts();
    initMobileSidebar();
  });
})();
