// Copyright 2026 Google LLC
// SPDX-License-Identifier: Apache-2.0

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";
const SKILL_CACHE_TTL_MS = 300_000;

/**
 * Parses simple YAML frontmatter (`---\nkey: value\n---`) without external YAML parser risk.
 * Preserves all scalar keys for SEP-2640 (`io.modelcontextprotocol/skills`) frontmatter fidelity.
 */
function parseSkillFrontmatter(markdownText) {
  const normalized = String(markdownText || "");
  if (!normalized.startsWith("---\n") && !normalized.startsWith("---\r\n")) {
    throw new Error("SKILL.md must begin with YAML frontmatter ('---').");
  }
  const endMatch = /\r?\n---\r?\n/.exec(normalized.slice(3));
  if (!endMatch) {
    throw new Error("SKILL.md frontmatter closing delimiter ('---') not found.");
  }
  const rawYaml = normalized.slice(4, 3 + endMatch.index);
  const frontmatter = {};
  for (const rawLine of rawYaml.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx <= 0) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    frontmatter[key] = value;
  }
  if (!frontmatter.name || !frontmatter.description) {
    throw new Error("SKILL.md frontmatter must include 'name' and 'description'.");
  }
  return frontmatter;
}

function walkSkillFilesRecursive(rootDir, currentDir = rootDir) {
  const results = [];
  const entries = fs.readdirSync(currentDir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(currentDir, entry.name);
    const relPosix = path.relative(rootDir, fullPath).split(path.sep).join("/");
    if (relPosix.includes("..")) continue;
    if (entry.isDirectory()) {
      results.push(...walkSkillFilesRecursive(rootDir, fullPath));
    } else if (entry.isFile()) {
      const bytes = fs.readFileSync(fullPath);
      const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
      results.push({
        relPath: relPosix,
        fullPath,
        bytes,
        text: bytes.toString("utf8"),
        size: bytes.byteLength,
        digest: `sha256:${sha256}`,
        mimeType: relPosix.endsWith(".md") ? "text/markdown" : "text/plain",
      });
    }
  }
  return results;
}

/**
 * Loads all Agent Skills under `<skillsRootDir>/<skill-name>/SKILL.md` and builds an immutable
 * in-memory SEP-2640 (`io.modelcontextprotocol/skills`) catalog with SHA-256 digests and directory maps.
 */
function loadSkillsCatalog(skillsRootDir) {
  const skillsByUri = new Map();
  const filesByUri = new Map();
  const directoriesByUri = new Map();

  if (!skillsRootDir || !fs.existsSync(skillsRootDir)) {
    return { skillsByUri, filesByUri, directoriesByUri };
  }

  const dirs = fs.readdirSync(skillsRootDir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  for (const dirEntry of dirs) {
    if (!dirEntry.isDirectory() || dirEntry.name.startsWith(".")) continue;
    const skillSlug = dirEntry.name;
    const skillDir = path.join(skillsRootDir, skillSlug);
    const skillMdPath = path.join(skillDir, "SKILL.md");
    if (!fs.existsSync(skillMdPath)) continue;

    const skillFiles = walkSkillFilesRecursive(skillDir);
    const skillMdRecord = skillFiles.find((f) => f.relPath === "SKILL.md");
    if (!skillMdRecord) continue;

    const frontmatter = parseSkillFrontmatter(skillMdRecord.text);
    if (frontmatter.name !== skillSlug) {
      throw new Error(
        `SEP-2640 violation: SKILL.md frontmatter name '${frontmatter.name}' must match directory '${skillSlug}'.`
      );
    }

    const skillUri = `skill://${skillSlug}/SKILL.md`;
    const manifestResources = [];
    const rootDirUri = `skill://${skillSlug}`;
    directoriesByUri.set(rootDirUri, new Map());

    for (const fileRec of skillFiles) {
      const fileUri = `skill://${skillSlug}/${fileRec.relPath}`;
      manifestResources.push({
        uri: fileUri,
        digest: fileRec.digest,
        size: fileRec.size,
      });
      filesByUri.set(fileUri, {
        uri: fileUri,
        mimeType: fileRec.mimeType,
        text: fileRec.text,
        digest: fileRec.digest,
        size: fileRec.size,
      });

      const segments = fileRec.relPath.split("/");
      let parentDirUri = rootDirUri;
      for (let i = 0; i < segments.length - 1; i++) {
        const subName = segments[i];
        const childDirUri = `${parentDirUri}/${subName}`;
        if (!directoriesByUri.has(parentDirUri)) {
          directoriesByUri.set(parentDirUri, new Map());
        }
        directoriesByUri.get(parentDirUri).set(childDirUri, {
          uri: childDirUri,
          name: subName,
          mimeType: "inode/directory",
        });
        if (!directoriesByUri.has(childDirUri)) {
          directoriesByUri.set(childDirUri, new Map());
        }
        parentDirUri = childDirUri;
      }

      const leafName = segments[segments.length - 1];
      directoriesByUri.get(parentDirUri).set(fileUri, {
        uri: fileUri,
        name: leafName,
        mimeType: fileRec.mimeType,
      });
    }

    skillsByUri.set(skillUri, {
      uri: skillUri,
      frontmatter,
      resources: manifestResources,
    });
  }

  return { skillsByUri, filesByUri, directoriesByUri };
}

/**
 * Builds tool `_meta` and resource `_meta` objects conforming to SEP-1865 MCP Apps (`ui://`)
 * plus Antigravity/Jetski `aux_pane` entrypoint extensions.
 */
function buildMcpAppMeta(resourceUri, { entrypointTitle = null, prefersBorder = true } = {}) {
  const toolMeta = {
    ui: {
      resourceUri,
      visibility: ["model", "app"],
    },
    "ui/resourceUri": resourceUri,
  };
  if (entrypointTitle) {
    toolMeta["com.google.antigravity/ui"] = {
      entrypoints: [{ type: "aux_pane", title: entrypointTitle }],
    };
  }
  const resourceMeta = {
    ui: {
      prefersBorder: Boolean(prefersBorder),
      csp: {
        connectDomains: [],
        resourceDomains: [],
        frameDomains: [],
        baseUriDomains: [],
      },
    },
  };
  return { toolMeta, resourceMeta };
}

/**
 * Generates a hardened, XSS-safe (`createElement` + `textContent` ONLY — zero `innerHTML`!),
 * brand-themeable HTML5 MCP App (`text/html;profile=mcp-app`) implementing the full SEP-1865
 * JSON-RPC 2.0 `window.parent.postMessage` protocol (`ui/initialize`, `tools/call`, `ui/message`,
 * `ui/update-model-context`, `ui/notifications/host-context-changed`, `ping`, `ui/resource-teardown`).
 */
function renderSecureMcpWorkbenchHtml({
  appUri,
  appTitle,
  brandBadge,
  subtitle,
  primaryColor = "#1a73e8",
  primaryLight = "#e8f0fe",
  darkPrimaryColor = "#8ab4f8",
  darkPrimaryLight = "#1e3a5f",
  defaultToolName,
  defaultToolParam = "query",
  searchPlaceholder = "Run live MCP query...",
  secondaryActionLabel = null,
  secondaryToolName = null,
  secondaryFields = [],
  initialPayload = null,
}) {
  const safePayloadJson = JSON.stringify(initialPayload || null)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");

  const safeConfigJson = JSON.stringify({
    appUri,
    appTitle,
    brandBadge,
    subtitle,
    defaultToolName,
    defaultToolParam,
    searchPlaceholder,
    secondaryActionLabel,
    secondaryToolName,
    secondaryFields,
  })
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");

  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${String(appTitle).replace(/[<>&"]/g, "")}</title>
  <style>
    :root {
      --bg: var(--color-background-primary, #f8fafc);
      --surface: var(--color-background-secondary, #ffffff);
      --border: var(--color-border-primary, #dbe3ee);
      --text: var(--color-text-primary, #0f172a);
      --muted: var(--color-text-secondary, #475569);
      --primary: ${primaryColor};
      --primary-light: ${primaryLight};
      --danger: var(--color-text-danger, #b91c1c);
      --danger-bg: var(--color-background-danger, #fef2f2);
      --success: var(--color-text-success, #15803d);
      --success-bg: var(--color-background-success, #f0fdf4);
      --warn: var(--color-text-warning, #b45309);
      --warn-bg: var(--color-background-warning, #fffbeb);
      --font-sans: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      --radius: 10px;
    }
    [data-theme="dark"] {
      --bg: var(--color-background-primary, #0f172a);
      --surface: var(--color-background-secondary, #1e293b);
      --border: var(--color-border-primary, #334155);
      --text: var(--color-text-primary, #f8fafc);
      --muted: var(--color-text-secondary, #94a3b8);
      --primary: ${darkPrimaryColor};
      --primary-light: ${darkPrimaryLight};
      --danger-bg: #450a0a;
      --success-bg: #052e16;
      --warn-bg: #451a03;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-sans);
      background: var(--bg);
      color: var(--text);
      padding: 14px;
      line-height: 1.45;
    }
    .hdr {
      display: flex; justify-content: space-between; align-items: flex-start;
      gap: 12px; flex-wrap: wrap; background: var(--surface);
      border: 1px solid var(--border); border-radius: var(--radius);
      padding: 12px 14px; margin-bottom: 12px;
    }
    .pill {
      display: inline-block; font-size: 10px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.06em;
      color: var(--primary); background: var(--primary-light);
      padding: 2px 8px; border-radius: 999px; margin-bottom: 4px;
    }
    .h-title { font-size: 15px; font-weight: 700; }
    .h-sub { font-size: 12px; color: var(--muted); margin-top: 2px; }
    .bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .inp {
      padding: 6px 10px; border: 1px solid var(--border); border-radius: 7px;
      background: var(--bg); color: var(--text); font-size: 12.5px; min-width: 190px;
    }
    .btn {
      padding: 6px 11px; border-radius: 7px; border: 1px solid var(--border);
      background: var(--surface); color: var(--text); font-size: 12px;
      font-weight: 600; cursor: pointer;
    }
    .btn-pri { background: var(--primary); color: #fff; border-color: var(--primary); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .kpis {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(135px, 1fr));
      gap: 10px; margin-bottom: 12px;
    }
    .kpi {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 8px; padding: 10px 12px;
    }
    .kpi-lbl { font-size: 10.5px; text-transform: uppercase; color: var(--muted); }
    .kpi-val { font-size: 18px; font-weight: 700; color: var(--primary); margin-top: 2px; }
    .grid { display: grid; grid-template-columns: 240px 1fr; gap: 12px; }
    @media (max-width: 680px) { .grid { grid-template-columns: 1fr; } }
    .panel {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 12px;
    }
    .p-title {
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      color: var(--muted); margin-bottom: 9px;
    }
    .cat-btn {
      display: flex; justify-content: space-between; width: 100%;
      padding: 6px 8px; margin-bottom: 5px; border: 1px solid transparent;
      border-radius: 6px; background: transparent; color: var(--text);
      font-size: 12px; cursor: pointer; text-align: left;
    }
    .cat-btn:hover, .cat-btn.active { background: var(--primary-light); border-color: var(--primary); }
    .card {
      border: 1px solid var(--border); border-radius: 8px;
      padding: 10px 12px; margin-bottom: 8px;
    }
    .card-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
    .badge {
      font-size: 10.5px; font-weight: 700; padding: 2px 7px; border-radius: 999px;
      background: var(--primary-light); color: var(--primary);
    }
    .badge-danger { background: var(--danger-bg); color: var(--danger); }
    .badge-ok { background: var(--success-bg); color: var(--success); }
    .badge-warn { background: var(--warn-bg); color: var(--warn); }
    .meta-mono { font-family: var(--font-mono); font-size: 11px; color: var(--muted); margin-top: 4px; word-break: break-all; }
    .body-pre {
      margin-top: 6px; padding: 8px; background: var(--bg); border-radius: 6px;
      font-size: 12px; white-space: pre-wrap; max-height: 180px; overflow-y: auto;
    }
    .drawer {
      margin-top: 12px; background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 12px; display: none;
    }
    .drawer.open { display: block; }
    .form-row { margin-bottom: 8px; }
    .form-row label { display: block; font-size: 11px; font-weight: 600; color: var(--muted); margin-bottom: 3px; }
    .form-row input, .form-row textarea { width: 100%; }
    .ftr {
      margin-top: 10px; font-size: 11px; color: var(--muted);
      display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px;
    }
  </style>
</head>
<body>
  <header class="hdr" id="hdrRoot"></header>
  <section class="kpis" id="kpiRoot"></section>
  <main class="grid">
    <aside class="panel">
      <div class="p-title">Facets & Filters</div>
      <div id="facetRoot"></div>
    </aside>
    <section class="panel">
      <div class="p-title" id="recordsTitle">Interactive Records</div>
      <div id="recordsRoot"></div>
    </section>
  </main>
  <section class="drawer" id="actionDrawer"></section>
  <footer class="ftr">
    <span id="statusLabel">Initializing MCP App bridge...</span>
    <span id="uriLabel"></span>
  </footer>

  <script>
    (function () {
      "use strict";
      const CFG = ${safeConfigJson};
      const INITIAL = ${safePayloadJson};
      let state = { payload: INITIAL, filter: null, hostCaps: { serverTools: true, message: true, updateModelContext: true } };

      function el(tag, cls, text) {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
      }

      // --- SEP-1865 JSON-RPC 2.0 postMessage Bridge ---
      let nextId = 1;
      const pending = new Map();

      function rpcRequest(method, params) {
        return new Promise((resolve, reject) => {
          if (!window.parent || window.parent === window) {
            reject(new Error("Standalone preview mode (no parent MCP host)"));
            return;
          }
          const id = nextId++;
          pending.set(id, { resolve, reject });
          window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
          setTimeout(() => {
            if (pending.has(id)) {
              pending.delete(id);
              reject(new Error("Host RPC timeout"));
            }
          }, 25000);
        });
      }

      function rpcNotify(method, params) {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ jsonrpc: "2.0", method, params: params || {} }, "*");
        }
      }

      function applyHostStyles(ctx) {
        if (!ctx) return;
        if (ctx.theme === "dark" || ctx.theme === "light") {
          document.documentElement.setAttribute("data-theme", ctx.theme);
        }
        const vars = ctx.styles && ctx.styles.variables;
        if (vars && typeof vars === "object") {
          for (const [k, v] of Object.entries(vars)) {
            if (typeof k === "string" && k.startsWith("--") && typeof v === "string") {
              document.documentElement.style.setProperty(k, v);
            }
          }
        }
      }

      window.addEventListener("message", (ev) => {
        const msg = ev.data;
        if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0") return;

        if (msg.method === "ping" && msg.id !== undefined) {
          window.parent.postMessage({ jsonrpc: "2.0", id: msg.id, result: {} }, "*");
          return;
        }
        if (msg.method === "ui/resource-teardown" && msg.id !== undefined) {
          window.parent.postMessage({ jsonrpc: "2.0", id: msg.id, result: {} }, "*");
          return;
        }
        if (msg.id !== undefined && pending.has(msg.id)) {
          const entry = pending.get(msg.id);
          pending.delete(msg.id);
          if (msg.error) entry.reject(msg.error);
          else entry.resolve(msg.result);
          return;
        }
        if (msg.method === "ui/notifications/host-context-changed") {
          applyHostStyles(msg.params);
        } else if (msg.method === "ui/notifications/tool-input" && msg.params && msg.params.arguments) {
          const qInput = document.getElementById("primarySearchInput");
          const val = msg.params.arguments[CFG.defaultToolParam];
          if (qInput && typeof val === "string") qInput.value = val;
        } else if (msg.method === "ui/notifications/tool-result" && msg.params) {
          ingestToolResult(msg.params);
        }
      });

      function ingestToolResult(res) {
        if (!res) return;
        if (res.structuredContent && typeof res.structuredContent === "object") {
          state.payload = res.structuredContent;
          render();
          return;
        }
        if (Array.isArray(res.content)) {
          for (const blk of res.content) {
            if (blk && blk.type === "text" && typeof blk.text === "string") {
              try {
                state.payload = JSON.parse(blk.text);
              } catch (_) {
                state.payload = { summary: blk.text, items: [{ id: "resp-1", title: "Tool Output", category: "Result", snippet: blk.text }] };
              }
              render();
              return;
            }
          }
        }
      }

      function normalizeItems(payload) {
        if (!payload || typeof payload !== "object") return [];
        if (Array.isArray(payload.normalizedItems)) return payload.normalizedItems;
        const rawList = payload.items || payload.results || payload.sites || payload.libraries || payload.messages || payload.events || [];
        if (Array.isArray(rawList) && rawList.length > 0) {
          return rawList.map((r, i) => ({
            id: String(r.id || "item-" + (i + 1)),
            title: String(r.title || r.subject || r.displayName || r.name || "Record " + (i + 1)),
            category: String(r.fileLabel || r.category || r.type || r.driveType || (r.isRead === false ? "Unread" : "Standard")),
            severity: r.blocked ? "danger" : r.fileLabel ? "warn" : "ok",
            meta: String(r.webUrl || r.webLink || r.from || r.purviewSensitivityGuid || ""),
            snippet: String(r.content || r.preview || r.summary || r.description || ""),
          }));
        }
        if (payload.content || payload.answer || payload.summary) {
          return [{
            id: payload.id || "doc-1",
            title: String(payload.name || payload.model || "Active Output"),
            category: String(payload.blocked ? "SDP BLOCKED" : (payload.fileLabel || "Result")),
            severity: payload.blocked ? "danger" : payload.fileLabel ? "warn" : "ok",
            meta: String(payload.webUrl || payload.purviewSensitivityGuid || ""),
            snippet: String(payload.content || payload.answer || payload.summary || ""),
          }];
        }
        return [];
      }

      function setStatus(txt) {
        const s = document.getElementById("statusLabel");
        if (s) s.textContent = txt;
      }

      function buildHeader() {
        const hdr = document.getElementById("hdrRoot");
        hdr.replaceChildren();

        const left = el("div");
        left.appendChild(el("span", "pill", CFG.brandBadge));
        left.appendChild(el("div", "h-title", CFG.appTitle));
        left.appendChild(el("div", "h-sub", CFG.subtitle));
        hdr.appendChild(left);

        const bar = el("div", "bar");
        const input = el("input", "inp");
        input.id = "primarySearchInput";
        input.type = "text";
        input.placeholder = CFG.searchPlaceholder;
        bar.appendChild(input);

        const runBtn = el("button", "btn btn-pri", "Run MCP Tool");
        runBtn.disabled = !state.hostCaps.serverTools;
        runBtn.addEventListener("click", async () => {
          const val = input.value.trim();
          const args = {};
          if (val) args[CFG.defaultToolParam] = val;
          setStatus("Calling " + CFG.defaultToolName + "...");
          try {
            const r = await rpcRequest("tools/call", { name: CFG.defaultToolName, arguments: args });
            ingestToolResult(r);
            setStatus("Updated from " + CFG.defaultToolName);
          } catch (e) {
            setStatus("RPC notice: " + (e.message || "unavailable"));
          }
        });
        bar.appendChild(runBtn);

        if (CFG.secondaryActionLabel && CFG.secondaryToolName) {
          const secBtn = el("button", "btn", CFG.secondaryActionLabel);
          secBtn.addEventListener("click", () => {
            const drw = document.getElementById("actionDrawer");
            drw.classList.toggle("open");
          });
          bar.appendChild(secBtn);
        }

        if (state.hostCaps.updateModelContext) {
          const ctxBtn = el("button", "btn", "Attach Context");
          ctxBtn.addEventListener("click", async () => {
            const items = normalizeItems(state.payload).slice(0, 5);
            const summary = items.map((x) => "- " + x.title + " [" + x.category + "] " + x.meta).join("\\n");
            try {
              await rpcRequest("ui/update-model-context", {
                content: [{ type: "text", text: "Selected MCP Workbench Context (" + CFG.appTitle + "):\\n" + (summary || "No active items") }],
              });
              setStatus("Context attached to next turn");
            } catch (e) {
              setStatus("Context notice: " + (e.message || "unsupported"));
            }
          });
          bar.appendChild(ctxBtn);
        }

        if (state.hostCaps.message) {
          const askBtn = el("button", "btn", "Ask AI to Analyze");
          askBtn.addEventListener("click", async () => {
            const items = normalizeItems(state.payload).slice(0, 5);
            const summary = items.map((x) => "- " + x.title + " (" + x.category + "): " + x.snippet.slice(0, 180)).join("\\n");
            try {
              await rpcRequest("ui/message", {
                role: "user",
                content: [{ type: "text", text: "Analyze these records from " + CFG.appTitle + " (Filter: " + (state.filter || "All") + "):\\n" + (summary || "Current view") }],
              });
              setStatus("Sent analysis request to conversation");
            } catch (_) {
              rpcNotify("ui/message", {
                role: "user",
                content: [{ type: "text", text: "Analyze the active records in " + CFG.appTitle }],
              });
              setStatus("Dispatched prompt to host");
            }
          });
          bar.appendChild(askBtn);
        }

        hdr.appendChild(bar);
      }

      function buildSecondaryDrawer() {
        const drw = document.getElementById("actionDrawer");
        drw.replaceChildren();
        if (!CFG.secondaryToolName || !Array.isArray(CFG.secondaryFields) || CFG.secondaryFields.length === 0) return;

        drw.appendChild(el("div", "p-title", CFG.secondaryActionLabel + " (Human-Reviewed Execution)"));
        const inputs = {};
        for (const f of CFG.secondaryFields) {
          const row = el("div", "form-row");
          row.appendChild(el("label", "", f.label));
          const ctrl = f.multiline ? el("textarea", "inp") : el("input", "inp");
          if (f.multiline) ctrl.rows = 3;
          ctrl.placeholder = f.placeholder || "";
          inputs[f.name] = { ctrl, isArray: Boolean(f.isArray), isNumber: Boolean(f.isNumber) };
          row.appendChild(ctrl);
          drw.appendChild(row);
        }
        const submitBtn = el("button", "btn btn-pri", "Confirm & Execute " + CFG.secondaryToolName);
        submitBtn.addEventListener("click", async () => {
          const args = {};
          for (const [k, meta] of Object.entries(inputs)) {
            const rawVal = meta.ctrl.value.trim();
            if (!rawVal) continue;
            if (meta.isArray) args[k] = rawVal.split(",").map((s) => s.trim()).filter(Boolean);
            else if (meta.isNumber) args[k] = Number(rawVal);
            else args[k] = rawVal;
          }
          setStatus("Executing " + CFG.secondaryToolName + "...");
          try {
            const r = await rpcRequest("tools/call", { name: CFG.secondaryToolName, arguments: args });
            ingestToolResult(r);
            drw.classList.remove("open");
            setStatus("Completed " + CFG.secondaryToolName);
          } catch (e) {
            setStatus("Execution error: " + (e.message || "failed"));
          }
        });
        drw.appendChild(submitBtn);
      }

      function render() {
        const allItems = normalizeItems(state.payload);
        const counts = new Map();
        let flaggedCount = 0;
        for (const it of allItems) {
          counts.set(it.category, (counts.get(it.category) || 0) + 1);
          if (it.severity === "danger" || it.severity === "warn") flaggedCount += 1;
        }
        const visible = state.filter ? allItems.filter((i) => i.category === state.filter) : allItems;

        const kpiRoot = document.getElementById("kpiRoot");
        kpiRoot.replaceChildren();
        const kpiDefs = [
          ["Visible Records", String(visible.length)],
          ["Categories", String(counts.size)],
          ["Governance / Priority Hits", String(flaggedCount)],
          ["Active Filter", state.filter || "All"],
        ];
        for (const [lbl, val] of kpiDefs) {
          const c = el("div", "kpi");
          c.appendChild(el("div", "kpi-lbl", lbl));
          c.appendChild(el("div", "kpi-val", val));
          if (lbl === "Active Filter" && state.filter) {
            c.style.cursor = "pointer";
            c.addEventListener("click", () => { state.filter = null; render(); });
          }
          kpiRoot.appendChild(c);
        }

        const facetRoot = document.getElementById("facetRoot");
        facetRoot.replaceChildren();
        const allBtn = el("button", "cat-btn" + (!state.filter ? " active" : ""));
        allBtn.appendChild(el("span", "", "All Records"));
        allBtn.appendChild(el("span", "", String(allItems.length)));
        allBtn.addEventListener("click", () => { state.filter = null; render(); });
        facetRoot.appendChild(allBtn);

        for (const [cat, cnt] of counts.entries()) {
          const b = el("button", "cat-btn" + (state.filter === cat ? " active" : ""));
          b.appendChild(el("span", "", cat));
          b.appendChild(el("span", "", String(cnt)));
          b.addEventListener("click", () => {
            state.filter = state.filter === cat ? null : cat;
            render();
          });
          facetRoot.appendChild(b);
        }

        const recRoot = document.getElementById("recordsRoot");
        recRoot.replaceChildren();
        if (visible.length === 0) {
          recRoot.appendChild(el("div", "h-sub", "No records loaded yet. Run an MCP query above or invoke a linked tool from chat."));
        } else {
          for (const item of visible) {
            const card = el("div", "card");
            const top = el("div", "card-top");
            top.appendChild(el("strong", "", item.title));
            const bCls = item.severity === "danger" ? "badge badge-danger" : item.severity === "warn" ? "badge badge-warn" : "badge badge-ok";
            top.appendChild(el("span", bCls, item.category));
            card.appendChild(top);
            if (item.meta) card.appendChild(el("div", "meta-mono", item.meta));
            if (item.snippet) card.appendChild(el("div", "body-pre", item.snippet));
            recRoot.appendChild(card);
          }
        }
      }

      document.getElementById("uriLabel").textContent = CFG.appUri;
      buildHeader();
      buildSecondaryDrawer();
      render();

      (async function boot() {
        if (window.parent && window.parent !== window) {
          try {
            const initRes = await rpcRequest("ui/initialize", {
              protocolVersion: "2026-01-26",
              appInfo: { name: CFG.appTitle, version: "2.0.0" },
              appCapabilities: {},
            });
            if (initRes && initRes.hostCapabilities) {
              state.hostCaps = {
                serverTools: Boolean(initRes.hostCapabilities.serverTools ?? true),
                message: Boolean(initRes.hostCapabilities.message ?? true),
                updateModelContext: Boolean(initRes.hostCapabilities.updateModelContext ?? false),
              };
              buildHeader();
            }
            if (initRes && initRes.hostContext) applyHostStyles(initRes.hostContext);
          } catch (_) {}
          rpcNotify("ui/notifications/initialized", {});
          setStatus("Connected to MCP Host (" + CFG.appUri + ")");
        } else {
          setStatus("Standalone sandbox preview (" + CFG.appUri + ")");
        }
        if (typeof ResizeObserver !== "undefined") {
          new ResizeObserver(() => {
            rpcNotify("ui/notifications/size-changed", {
              width: document.documentElement.scrollWidth,
              height: Math.min(800, Math.max(180, document.documentElement.scrollHeight)),
            });
          }).observe(document.body);
        }
      })();
    })();
  </script>
</body>
</html>`;
}

/**
 * Registers SEP-2640 (`io.modelcontextprotocol/skills`) and SEP-1865 (`ui://` MCP Apps)
 * protocol handlers onto a `@modelcontextprotocol/sdk` `Server` instance.
 */
function attachSkillsAndAppsToSdkServer(mcpServer, { z, types, skillsCatalog, appSpecs = [] }) {
  const { ListResourcesRequestSchema, ReadResourceRequestSchema, McpError, ErrorCode } = types;
  const appMap = new Map(appSpecs.map((a) => [a.uri, a]));

  const SkillsListRequestSchema = z.object({
    method: z.literal("skills/list"),
    params: z.object({ cursor: z.string().optional() }).passthrough().optional(),
  });

  const SkillsGetRequestSchema = z.object({
    method: z.literal("skills/get"),
    params: z.object({ uri: z.string() }).passthrough(),
  });

  const DirectoryReadRequestSchema = z.object({
    method: z.literal("resources/directory/read"),
    params: z.object({ uri: z.string(), cursor: z.string().optional() }).passthrough(),
  });

  mcpServer.setRequestHandler(SkillsListRequestSchema, async () => ({
    resultType: "complete",
    skills: Array.from(skillsCatalog.skillsByUri.values()),
    ttlMs: SKILL_CACHE_TTL_MS,
    cacheScope: "public",
  }));

  mcpServer.setRequestHandler(SkillsGetRequestSchema, async (req) => {
    const uri = String(req.params?.uri || "").trim();
    const skill = skillsCatalog.skillsByUri.get(uri);
    if (!skill) {
      throw new McpError(ErrorCode.InvalidParams, `Unknown skill URI: ${uri}`);
    }
    return {
      resultType: "complete",
      skill,
      ttlMs: SKILL_CACHE_TTL_MS,
      cacheScope: "public",
    };
  });

  mcpServer.setRequestHandler(DirectoryReadRequestSchema, async (req) => {
    const cleanUri = String(req.params?.uri || "").trim().replace(/\/+$/, "");
    const dirEntries = skillsCatalog.directoriesByUri.get(cleanUri);
    if (!dirEntries) {
      throw new McpError(ErrorCode.InvalidParams, `Unknown skill directory URI: ${cleanUri}`);
    }
    return {
      resultType: "complete",
      resources: Array.from(dirEntries.values()),
      ttlMs: SKILL_CACHE_TTL_MS,
      cacheScope: "public",
    };
  });

  mcpServer.setRequestHandler(ListResourcesRequestSchema, async () => {
    const resources = [];
    for (const app of appSpecs) {
      const { resourceMeta } = buildMcpAppMeta(app.uri, { prefersBorder: true });
      resources.push({
        uri: app.uri,
        name: app.name,
        description: app.description,
        mimeType: MCP_APP_MIME_TYPE,
        _meta: resourceMeta,
      });
    }
    for (const skill of skillsCatalog.skillsByUri.values()) {
      resources.push({
        uri: skill.uri,
        name: skill.frontmatter.name,
        description: skill.frontmatter.description,
        mimeType: "text/markdown",
      });
    }
    return { resources };
  });

  mcpServer.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const uri = String(req.params?.uri || "").trim();
    if (appMap.has(uri)) {
      const app = appMap.get(uri);
      const { resourceMeta } = buildMcpAppMeta(uri, { prefersBorder: true });
      return {
        resultType: "complete",
        contents: [
          {
            uri,
            mimeType: MCP_APP_MIME_TYPE,
            text: app.renderHtml(),
            _meta: resourceMeta,
          },
        ],
        ttlMs: 60_000,
        cacheScope: "private",
      };
    }
    const skillFile = skillsCatalog.filesByUri.get(uri);
    if (skillFile) {
      return {
        resultType: "complete",
        contents: [
          {
            uri: skillFile.uri,
            mimeType: skillFile.mimeType,
            text: skillFile.text,
          },
        ],
        ttlMs: SKILL_CACHE_TTL_MS,
        cacheScope: "public",
      };
    }
    throw new McpError(ErrorCode.InvalidParams, `Unknown resource URI: ${uri}`);
  });
}

function buildV2Capabilities() {
  return {
    tools: {},
    resources: {},
    extensions: {
      "io.modelcontextprotocol/skills": {
        directoryRead: true,
      },
      "io.modelcontextprotocol/ui": {
        mimeTypes: [MCP_APP_MIME_TYPE],
      },
    },
  };
}

module.exports = {
  MCP_APP_MIME_TYPE,
  SKILL_CACHE_TTL_MS,
  parseSkillFrontmatter,
  loadSkillsCatalog,
  buildMcpAppMeta,
  renderSecureMcpWorkbenchHtml,
  attachSkillsAndAppsToSdkServer,
  buildV2Capabilities,
};
