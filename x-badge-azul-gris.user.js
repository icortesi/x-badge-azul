// ==UserScript==
// @name         X: atenuar o colapsar posts de cuentas con badge azul
// @namespace    https://github.com/TU_USUARIO/x-badge-azul
// @version      3.0.0
// @description  Colapsa (o pone en gris) los posts de cuentas con verificación azul que no sigues en X/Twitter. / Collapses or dims posts from blue-check accounts you don't follow on X.
// @author       Iván Cortés
// @license      MIT
// @homepageURL  https://github.com/TU_USUARIO/x-badge-azul
// @supportURL   https://github.com/TU_USUARIO/x-badge-azul/issues
// @updateURL    https://raw.githubusercontent.com/TU_USUARIO/x-badge-azul/main/x-badge-azul-gris.user.js
// @downloadURL  https://raw.githubusercontent.com/TU_USUARIO/x-badge-azul/main/x-badge-azul-gris.user.js
// @match        https://x.com/*
// @match        https://twitter.com/*
// @match        https://mobile.x.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ---------------- Configuración ----------------
  const CONFIG = {
    mode: 'collapse',  // 'collapse' = barrita con botón "Mostrar" (sin re-ocultar) | 'dim' = texto gris

    // Qué badges afectar
    blue: true,   // Premium / verificado azul
    gold: false,  // Organizaciones (dorado)
    gray: false,  // Gobierno (gris)

    collapseQuotes: true,      // también colapsar quote-tweets de cuentas azules
    spareFollowed: true,       // no colapsar cuentas que sigues
    spareFollowedReposts: true, // no colapsar si el repost lo hizo alguien que sigues (o tú)

    // Solo para mode: 'dim'
    textColor: 'rgb(120, 120, 120)',
    opacity: 0.35,
    revealOnHover: true,
  };

  const BLUE_RGB = 'rgb(29, 155, 240)';
  const GRAY_RGB = 'rgb(130, 154, 171)';

  const CLS_DIM = 'tm-bc-dim';
  const CLS_COLLAPSED = 'tm-bc-collapsed';
  const CLS_PH = 'tm-bc-ph';
  const STORE_KEY = 'tm-bc-following';

  // Posts que el usuario expandió (mientras dure la pestaña)
  const expanded = new Set();

  // =====================================================================
  //  Cuentas que sigues: se aprenden de las respuestas de la API de X
  // =====================================================================
  const following = new Set();
  try {
    (JSON.parse(localStorage.getItem(STORE_KEY)) || []).forEach((h) => following.add(h));
  } catch (_) { /* sin storage: arrancamos vacíos */ }

  let saveTimer = null;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify([...following])); } catch (_) {}
    }, 1000);
  }

  function setFollowing(handle, isFollowing) {
    if (!handle) return false;
    const h = handle.toLowerCase();
    const had = following.has(h);
    if (isFollowing && !had) { following.add(h); return true; }
    if (!isFollowing && had) { following.delete(h); return true; }
    return false;
  }

  // Recorre el JSON buscando objetos de usuario (GraphQL nuevo y legacy)
  function harvest(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 60) return false;
    let changed = false;

    if (Array.isArray(node)) {
      for (const n of node) changed = harvest(n, depth + 1) || changed;
      return changed;
    }

    if (node.__typename === 'User') {
      const handle = (node.core && node.core.screen_name) || (node.legacy && node.legacy.screen_name);
      const f = node.relationship_perspectives && typeof node.relationship_perspectives.following === 'boolean'
        ? node.relationship_perspectives.following
        : node.legacy && typeof node.legacy.following === 'boolean' ? node.legacy.following : undefined;
      if (handle && f !== undefined) changed = setFollowing(handle, f) || changed;
    }

    for (const k in node) {
      const v = node[k];
      if (v && typeof v === 'object') changed = harvest(v, depth + 1) || changed;
    }
    return changed;
  }

  function onApiResponse(url, data) {
    if (!data || typeof data !== 'object') return;
    let changed = false;

    // Seguir / dejar de seguir durante la sesión (API v1.1)
    if (/friendships\/create/.test(url) && data.screen_name) changed = setFollowing(data.screen_name, true);
    else if (/friendships\/destroy/.test(url) && data.screen_name) changed = setFollowing(data.screen_name, false);
    else changed = harvest(data);

    if (changed) { persist(); schedule(); }
  }

  const isApi = (url) => /\/i\/api\/|\/graphql\/|friendships\//.test(url || '');

  // --- Interceptar fetch ---
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const p = origFetch.apply(this, arguments);
    if (isApi(url)) {
      p.then((res) => res.clone().json().then((d) => onApiResponse(url, d)).catch(() => {})).catch(() => {});
    }
    return p;
  };

  // --- Interceptar XHR ---
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__tmUrl = String(url);
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (isApi(this.__tmUrl)) {
      this.addEventListener('load', () => {
        try {
          const rt = this.responseType;
          const data = rt === 'json' ? this.response : (rt === '' || rt === 'text') ? JSON.parse(this.responseText) : null;
          onApiResponse(this.__tmUrl, data);
        } catch (_) { /* respuesta no-JSON */ }
      });
    }
    return origSend.apply(this, arguments);
  };

  // =====================================================================
  //  DOM
  // =====================================================================
  function badgeType(userNameEl) {
    const svg = userNameEl.querySelector('svg[data-testid="icon-verified"]');
    if (!svg) return null;
    if (svg.querySelector('linearGradient')) return 'gold';
    const color = getComputedStyle(svg).color;
    if (color === GRAY_RGB) return 'gray';
    if (color === BLUE_RGB) return 'blue';
    return 'blue'; // fallback si X cambia el tono
  }

  const shouldAct = (type) => !!type && CONFIG[type] === true;

  // Separa el post principal del quote-tweet (div[role="link"] dentro del article)
  function scopeOf(el, article) {
    const link = el.closest('div[role="link"]');
    return link && article.contains(link) && link !== article ? link : article;
  }

  function rawHandle(userNameEl) {
    const a = [...userNameEl.querySelectorAll('a[href^="/"]')].find((x) => /^\/\w+$/.test(x.getAttribute('href')));
    if (a) return a.getAttribute('href').slice(1);
    const m = userNameEl.textContent.match(/@(\w+)/);
    return m ? m[1] : null;
  }

  function handleOf(userNameEl) {
    const h = rawHandle(userNameEl);
    return h ? '@' + h : 'cuenta verificada';
  }

  function myHandle() {
    const a = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
    const m = a && (a.getAttribute('href') || '').match(/^\/(\w+)$/);
    return m ? m[1].toLowerCase() : null;
  }

  const isFollowed = (h) => !!h && (following.has(h.toLowerCase()) || h.toLowerCase() === myHandle());

  // Quién hizo el repost (si aplica)
  function reposterOf(article) {
    const sc = article.querySelector('[data-testid="socialContext"]');
    const a = sc && sc.closest('a[href^="/"]');
    const m = a && (a.getAttribute('href') || '').match(/^\/(\w+)$/);
    return m ? m[1] : null;
  }

  function keyOf(scope, article, userNameEl) {
    const link = [...scope.querySelectorAll('a[href*="/status/"]')].find((a) => scopeOf(a, article) === scope);
    const id = link && link.getAttribute('href').match(/status\/(\d+)/);
    if (id) return (scope === article ? 'm:' : 'q:') + id[1];
    const txt = scope.querySelector('[data-testid="tweetText"]');
    return (scope === article ? 'm:' : 'q:') + handleOf(userNameEl) + '|' + (txt ? txt.textContent.slice(0, 60) : '');
  }

  function swallow(e) { e.stopPropagation(); }

  // ---------------- Modo collapse ----------------
  function collapse(scope, userNameEl, key) {
    let ph = scope.querySelector(`:scope > .${CLS_PH}`);
    if (!ph) {
      ph = document.createElement('div');
      ph.className = CLS_PH;
      ph.innerHTML = `<span class="tm-bc-label"></span><span class="tm-bc-handle"></span><button type="button"></button>`;
      ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach((ev) => ph.addEventListener(ev, swallow));
      ph.querySelector('button').addEventListener('click', (e) => {
        e.preventDefault();
        expanded.add(key);   // una vez mostrado, se queda abierto
        uncollapse(scope);
      });
      scope.prepend(ph);
    }

    const label = scope.tagName === 'ARTICLE' ? 'Post de' : 'Cita de';
    ph.querySelector('.tm-bc-label').textContent = `${label} ✔`;
    ph.querySelector('.tm-bc-handle').textContent = handleOf(userNameEl);
    ph.querySelector('button').textContent = 'Mostrar';
    scope.classList.add(CLS_COLLAPSED);
  }

  function uncollapse(scope) {
    scope.classList.remove(CLS_COLLAPSED);
    const ph = scope.querySelector(`:scope > .${CLS_PH}`);
    if (ph) ph.remove();
  }

  // ---------------- Procesamiento ----------------
  function processArticle(article) {
    const reposter = CONFIG.spareFollowedReposts ? reposterOf(article) : null;
    const repostAval = isFollowed(reposter);

    article.querySelectorAll('[data-testid="User-Name"]').forEach((un) => {
      const scope = scopeOf(un, article);
      const isQuote = scope !== article;

      let act = shouldAct(badgeType(un));
      if (act && CONFIG.spareFollowed && isFollowed(rawHandle(un))) act = false;
      if (act && !isQuote && repostAval) act = false;   // el repost cuenta como aval
      if (act && isQuote && !CONFIG.collapseQuotes) act = false;

      if (CONFIG.mode === 'collapse') {
        const key = act ? keyOf(scope, article, un) : null;
        if (key && !expanded.has(key)) collapse(scope, un, key);
        else uncollapse(scope);
      } else {
        scope.querySelectorAll('[data-testid="tweetText"]').forEach((t) => {
          if (scopeOf(t, article) === scope) t.classList.toggle(CLS_DIM, act);
        });
      }
    });
  }

  function processAll() {
    document.querySelectorAll('article[data-testid="tweet"]').forEach(processArticle);
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; processAll(); });
  }

  // ---------------- Arranque (el DOM aún no existe en document-start) ----------------
  function init() {
    const style = document.createElement('style');
    style.textContent = `
      /* --- modo dim --- */
      .${CLS_DIM}, .${CLS_DIM} * { color: ${CONFIG.textColor} !important; }
      .${CLS_DIM} { opacity: ${CONFIG.opacity} !important; transition: opacity .15s; }
      ${CONFIG.revealOnHover ? `
        article:hover .${CLS_DIM} { opacity: 1 !important; }
        article:hover .${CLS_DIM}, article:hover .${CLS_DIM} * { color: inherit !important; }
      ` : ''}

      /* --- modo collapse --- */
      .${CLS_COLLAPSED} > :not(.${CLS_PH}) { display: none !important; }
      .${CLS_COLLAPSED} { min-height: 0 !important; }
      .${CLS_PH} {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 16px; font: 13px/1.3 -apple-system, "Segoe UI", Roboto, sans-serif;
        color: rgb(113, 118, 123); cursor: default; user-select: none;
      }
      .${CLS_PH} .tm-bc-handle { opacity: .8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .${CLS_PH} button {
        margin-left: auto; flex-shrink: 0;
        background: none; border: 1px solid rgba(113,118,123,.4); border-radius: 999px;
        color: inherit; font: inherit; padding: 2px 10px; cursor: pointer;
      }
      .${CLS_PH} button:hover { background: rgba(113,118,123,.15); }
    `;
    document.head.appendChild(style);

    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    processAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
