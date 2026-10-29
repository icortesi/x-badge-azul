// ==UserScript==
// @name         X: atenuar o colapsar posts de cuentas con badge azul
// @namespace    https://github.com/TU_USUARIO/x-badge-azul
// @version      2.1.0
// @description  Colapsa (o pone en gris) los posts de cuentas con verificación azul en X/Twitter. / Collapses or dims posts from blue-check accounts on X.
// @author       Iván Cortés
// @license      MIT
// @homepageURL  https://github.com/TU_USUARIO/x-badge-azul
// @supportURL   https://github.com/TU_USUARIO/x-badge-azul/issues
// @updateURL    https://raw.githubusercontent.com/TU_USUARIO/x-badge-azul/main/x-badge-azul-gris.user.js
// @downloadURL  https://raw.githubusercontent.com/TU_USUARIO/x-badge-azul/main/x-badge-azul-gris.user.js
// @match        https://x.com/*
// @match        https://twitter.com/*
// @match        https://mobile.x.com/*
// @run-at       document-idle
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

    collapseQuotes: true, // también colapsar quote-tweets de cuentas azules

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

  // Posts que el usuario expandió (sobrevive al re-render del timeline virtualizado)
  const expanded = new Set();

  // ---------------- Estilos ----------------
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

  // ---------------- Utilidades ----------------
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

  function handleOf(userNameEl) {
    const a = [...userNameEl.querySelectorAll('a[href^="/"]')].find((x) => /^\/[^/]+$/.test(x.getAttribute('href')));
    if (a) return '@' + a.getAttribute('href').slice(1);
    const m = userNameEl.textContent.match(/@\w+/);
    return m ? m[0] : 'cuenta verificada';
  }

  function keyOf(scope, article, userNameEl) {
    const link = [...scope.querySelectorAll('a[href*="/status/"]')].find((a) => scopeOf(a, article) === scope);
    const id = link && link.getAttribute('href').match(/status\/(\d+)/);
    if (id) return (scope === article ? 'm:' : 'q:') + id[1];
    const txt = scope.querySelector('[data-testid="tweetText"]');
    return (scope === article ? 'm:' : 'q:') + handleOf(userNameEl) + '|' + (txt ? txt.textContent.slice(0, 60) : '');
  }

  // Evita que el clic llegue al handler de X (que abriría el post)
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
    article.querySelectorAll('[data-testid="User-Name"]').forEach((un) => {
      const scope = scopeOf(un, article);
      const act = shouldAct(badgeType(un));
      const isQuote = scope !== article;

      if (CONFIG.mode === 'collapse') {
        const key = act && (!isQuote || CONFIG.collapseQuotes) ? keyOf(scope, article, un) : null;
        if (key && !expanded.has(key)) {
          collapse(scope, un, key);
        } else {
          uncollapse(scope);
        }
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

  // ---------------- Observer (timeline infinito / SPA) ----------------
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; processAll(); });
  }).observe(document.body, { childList: true, subtree: true });

  processAll();
})();
