/**
 * Zero-Subresource HTML Inliner & Host Dark-Mode Bridge (`sidecar_html_inliner.mjs`)
 *
 * Solves cross-origin iframe third-party cookie blocking in Jetski Web / Cloudtop
 * gateways by serving a 100% self-contained single HTML document on `GET /`:
 *   - Inlines `<style>` (`styles.css`)
 *   - Inlines official `sidecar_sdk/preload.js`
 *   - Inlines automatic Host `--background` Luminance + OS + Manual Dark-Mode Bridge
 *   - Inlines `window.__EMOJI_MAP` base64 PNGs
 *   - Inlines all frontend `.js` scripts with safe `<\/script` & `<\!--` escaping
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function escapeCssForInlineStyle(css) {
  return String(css || '').replace(/<\/(style)/gi, '<\\/$1');
}

function escapeJsForInlineScript(js) {
  return String(js || '')
    .replace(/<\/(script)/gi, '<\\/$1')
    .replace(/<!--/g, '<\\!--');
}

let cachedPreloadJs = null;
export function readOfficialPreloadJs() {
  if (cachedPreloadJs !== null) return cachedPreloadJs;
  const candidates = [];
  try {
    const sdkEntry = fileURLToPath(import.meta.resolve('sidecar_sdk'));
    const sdkDir = path.dirname(sdkEntry);
    candidates.push(path.join(sdkDir, 'preload.js'));
    candidates.push(path.join(sdkDir, '..', 'preload.js'));
  } catch {}
  candidates.push(
    process.env.SIDECAR_PRELOAD_JS_PATH || '',
    path.join(process.env.HOME || '', '.gemini', 'antigravity', 'lib', 'node_modules', 'sidecar_sdk', 'preload.js'),
    path.join(process.env.HOME || '', '.gemini', 'jetski', 'lib', 'node_modules', 'sidecar_sdk', 'preload.js')
  );
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) {
        cachedPreloadJs = fs.readFileSync(p, 'utf-8');
        return cachedPreloadJs;
      }
    } catch {}
  }
  cachedPreloadJs = '';
  return cachedPreloadJs;
}

export const HOST_DARK_THEME_BRIDGE_JS = `
(function () {
  'use strict';
  // 1. Gateway-safe fetch wrapper: preserves ?token=<uiToken> AND X-Sidecar-Token
  //    on every GET/POST call so cross-origin iframes never fail when 3P cookies are blocked.
  var params = new URLSearchParams(window.location.search || '');
  var uiToken = params.get('token') || '';
  window.__AGY_UI_TOKEN__ = uiToken;

  function withUiTokenUrl(rawUrl) {
    var u = String(rawUrl || '');
    if (!uiToken || !u.startsWith('/')) return u;
    if (/[?&]token=/.test(u)) return u;
    return u + (u.indexOf('?') === -1 ? '?' : '&') + 'token=' + encodeURIComponent(uiToken);
  }

  var origSidecarFetch = window.sidecar && window.sidecar.fetch ? window.sidecar.fetch.bind(window.sidecar) : null;
  var origWindowFetch = window.fetch.bind(window);

  function authedFetch(url, opts) {
    var nextUrl = withUiTokenUrl(url);
    var options = Object.assign({}, opts || {});
    var headers = new Headers(options.headers || {});
    if (uiToken && !headers.has('X-Sidecar-Token')) {
      headers.set('X-Sidecar-Token', uiToken);
    }
    if (options.method && options.method.toUpperCase() === 'POST' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    options.headers = headers;
    return origWindowFetch(nextUrl, options);
  }

  if (window.sidecar) {
    window.sidecar.fetch = authedFetch;
  } else {
    window.sidecar = { fetch: authedFetch };
  }
  window.__agyAuthedFetch = origSidecarFetch ? authedFetch : authedFetch;

  // 2. Host CSS Variable + OS + Manual Dark-Mode Synchronizer
  var STORAGE_KEY = 'agy-sidecar-theme-override';
  function getOverride() {
    var qTheme = params.get('theme');
    if (qTheme === 'dark' || qTheme === 'light') return qTheme;
    try {
      var v = window.localStorage.getItem(STORAGE_KEY);
      if (v === 'dark' || v === 'light') return v;
    } catch {}
    return 'auto';
  }

  function parseColorLuminance(raw) {
    var s = String(raw || '').trim();
    if (!s) return null;
    var hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
    if (hex) {
      var h = hex[1];
      var r, g, b;
      if (h.length === 3) {
        r = parseInt(h[0] + h[0], 16);
        g = parseInt(h[1] + h[1], 16);
        b = parseInt(h[2] + h[2], 16);
      } else {
        r = parseInt(h.slice(0, 2), 16);
        g = parseInt(h.slice(2, 4), 16);
        b = parseInt(h.slice(4, 6), 16);
      }
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }
    var rgb = s.match(/rgba?\\(\\s*(\\d+)[,\\s]+(\\d+)[,\\s]+(\\d+)/i);
    if (rgb) {
      return (0.299 * Number(rgb[1]) + 0.587 * Number(rgb[2]) + 0.114 * Number(rgb[3])) / 255;
    }
    return null;
  }

  function detectIsDark() {
    var ov = getOverride();
    if (ov === 'dark') return true;
    if (ov === 'light') return false;
    var rootStyle = document.documentElement.style;
    var inlineBg = rootStyle.getPropertyValue('--background').trim();
    if (!inlineBg && window.getComputedStyle) {
      inlineBg = window.getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
    }
    var lum = parseColorLuminance(inlineBg);
    if (lum !== null) return lum < 0.45;
    var inlineFg = rootStyle.getPropertyValue('--foreground').trim();
    var fgLum = parseColorLuminance(inlineFg);
    if (fgLum !== null) return fgLum > 0.55;
    return Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function applyThemeAttr() {
    var dark = detectIsDark();
    var root = document.documentElement;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.classList.toggle('dark', dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
    var btn = document.getElementById('btn-theme-toggle');
    if (btn) {
      var ov = getOverride();
      btn.textContent = dark ? '☀' : '☾';
      btn.title = 'Theme: ' + (ov === 'auto' ? 'Auto (' + (dark ? 'Dark' : 'Light') + ')' : ov) + ' — click to toggle';
    }
  }

  window.__toggleAgyTheme = function () {
    var curDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var next = curDark ? 'light' : 'dark';
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {}
    applyThemeAttr();
  };

  window.addEventListener('message', function (ev) {
    if (ev && ev.data && ev.data.type === 'theme-change') {
      setTimeout(applyThemeAttr, 0);
    }
  });
  if (window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyThemeAttr);
    } catch {}
  }
  function wireToggleBtn() {
    applyThemeAttr();
    var btn = document.getElementById('btn-theme-toggle');
    if (btn && !btn.__agyBound) {
      btn.__agyBound = true;
      btn.addEventListener('click', function () {
        window.__toggleAgyTheme();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireToggleBtn);
  } else {
    wireToggleBtn();
  }
})();
`;

export function buildInlinedSidecarHtml(sidecarDir, scriptFiles = ['app.js']) {
  const rawHtml = fs.readFileSync(path.join(sidecarDir, 'index.html'), 'utf-8');
  const rawCss = fs.existsSync(path.join(sidecarDir, 'styles.css'))
    ? fs.readFileSync(path.join(sidecarDir, 'styles.css'), 'utf-8')
    : '';
  const preloadJs = readOfficialPreloadJs();

  // Build inline base64 emoji map if assets/emoji exists
  const emojiMap = {};
  const emojiDir = path.join(sidecarDir, 'assets', 'emoji');
  if (fs.existsSync(emojiDir)) {
    for (const f of fs.readdirSync(emojiDir)) {
      if (f.endsWith('.png')) {
        emojiMap[f.replace(/\.png$/, '')] =
          'data:image/png;base64,' + fs.readFileSync(path.join(emojiDir, f)).toString('base64');
      }
    }
  }
  const emojiBootJs = `window.__EMOJI_MAP = ${JSON.stringify(emojiMap).replace(/<\//g, '<\\/')};`;

  let out = rawHtml;
  out = out.replace(
    /<link\s+rel=["']stylesheet["']\s+href=["']\/styles\.css["']\s*\/?>/i,
    () => `<style>\n${escapeCssForInlineStyle(rawCss)}\n</style>`
  );
  out = out.replace(
    /<script\s+src=["']\/preload\.js["']\s*><\/script>/i,
    () =>
      `<script>\n${escapeJsForInlineScript(preloadJs)}\n</script>\n` +
      `<script>\n${escapeJsForInlineScript(HOST_DARK_THEME_BRIDGE_JS)}\n${emojiBootJs}\n</script>`
  );

  for (const sf of scriptFiles) {
    const sfPath = path.join(sidecarDir, sf);
    if (!fs.existsSync(sfPath)) continue;
    let sfCode = fs.readFileSync(sfPath, 'utf-8');
    // Rewrite emoji image src to prefer inlined base64 map -> 0 extra HTTP requests!
    sfCode = sfCode
      .replace(
        /['"]\/api\/emoji(?:-png)?\?code=['"]\s*\+\s*encodeURIComponent\(code\)/g,
        '(window.__EMOJI_MAP && window.__EMOJI_MAP[code]) || ("/api/emoji-png?code=" + encodeURIComponent(code))'
      )
      .replace(
        "'https://fonts.gstatic.com/s/e/notoemoji/latest/' + code + '/512.webp'",
        '(window.__EMOJI_MAP && window.__EMOJI_MAP[code]) || ""'
      );
    const reTag = new RegExp(`<script\\s+src=["']\\/${sf.replace('.', '\\.')}["']\\s*><\\/script>`, 'i');
    out = out.replace(reTag, () => `<script>\n${escapeJsForInlineScript(sfCode)}\n</script>`);
  }

  return out;
}
