# Gemini Enterprise & Cross-Host MCP Connectors `v2.0` (Skills `SEP-2640` + MCP Apps `SEP-1865`)

> **Disclaimer**: This repository and its contents are provided for illustration and educational purposes only as example code. This is **NOT** an official Google product or officially supported Google software. Provided under the [Apache License 2.0](../../LICENSE).

This directory (`projects/ge_mcp_v2/`) contains the **next-generation `v2.0.0` releases** of all 7 Cloud Run Streamable HTTP MCP servers plus the `workiq-mcp-purview` encryption verification suite—upgraded to support both official Model Context Protocol extensions:

1. **MCP Skills (`io.modelcontextprotocol/skills` — SEP-2640 Final):**
   - Publishes domain-specific `SKILL.md` + `references/*.md` workflows directly over MCP via `skills/list`, `skills/get`, `resources/read`, and `resources/directory/read` (`directoryRead: true`).
   - Every manifest entry includes live cryptographic `sha256:<hex>` digests and exact UTF-8 byte sizes so compliant hosts verify skill integrity before loading instructions into model context.
   - Each `skills/<skill-name>/` directory also adheres to the portable Agent Skills standard (`name` matching folder slug + YAML frontmatter) so the exact same skill folder can be uploaded to **Gemini**, **Google Workspace Studio**, **Claude**, **GitHub Copilot**, or **Antigravity**.
2. **MCP Apps (`io.modelcontextprotocol/ui` — SEP-1865):**
   - Pairs data tools with interactive sandboxed HTML5 applications (`ui://...`, `text/html;profile=mcp-app`) using **Dual-Delivery** (`resources/list` + `resources/read` AND dedicated `open_*` launcher tools returning `EmbeddedResource` + `structuredContent`).
   - Implements the full bidirectional JSON-RPC 2.0 `window.parent.postMessage` bridge (`ui/initialize`, `ui/notifications/initialized`, `tools/call`, `ui/message`, `ui/update-model-context`, `ui/notifications/host-context-changed`, `ui/notifications/size-changed`, `ping`, and `ui/resource-teardown`).
   - Hardened against DOM XSS (`CWE-79`): zero `innerHTML` / `document.write` sinks anywhere (`document.createElement` + `textContent` only) under a deny-by-default `_meta.ui.csp`.

---

## `v2.0` Connector Matrix (Skills + MCP Apps)

| Connector Directory | SEP-2640 Skill URI (`skill://`) | SEP-1865 MCP App URI (`ui://`) | Launcher Tool |
| :--- | :--- | :--- | :--- |
| [`claude_mcp_sonnet`](./claude_mcp_sonnet) | `skill://vertex-claude-reasoning/SKILL.md` | `ui://vertex-claude-mcp/reasoning-workbench.html` | `open_claude_reasoning_workbench` |
| [`customize_outlook_mcp`](./customize_outlook_mcp) | `skill://outlook-executive-triage/SKILL.md` | `ui://microsoft-outlook-mcp/comms-hub.html` | `open_outlook_comms_hub` |
| [`sharepoint-mcp-server`](./sharepoint-mcp-server) | `skill://sharepoint-citation-navigator/SKILL.md` | `ui://sharepoint-mcp/document-explorer.html` | `open_sharepoint_document_explorer` |
| [`customize-sharepoint-mcp-server`](./customize-sharepoint-mcp-server) | `skill://sharepoint-calibrated-citations/SKILL.md` | `ui://customize-sharepoint-mcp/citation-workbench.html` | `open_sharepoint_citation_workbench` |
| [`least-privilege-sharepoint-mcp-server`](./least-privilege-sharepoint-mcp-server) | `skill://sharepoint-sites-selected-governance/SKILL.md` | `ui://least-privilege-sharepoint-mcp/scope-auditor.html` | `open_sites_selected_scope_auditor` |
| [`sharepoint-mcp-server-purview-label`](./sharepoint-mcp-server-purview-label) | `skill://purview-label-governance/SKILL.md` | `ui://sharepoint-purview-label-mcp/label-inspector.html` | `open_purview_label_inspector` |
| [`sharepoint-mcp-server-purview-sdp`](./sharepoint-mcp-server-purview-sdp) | `skill://purview-sdp-enforcement/SKILL.md` | `ui://sharepoint-purview-sdp-mcp/sdp-governance-matrix.html` | `open_purview_sdp_governance_matrix` |
| [`workiq-mcp-purview`](./workiq-mcp-purview) | `skill://workiq-purview-rms-verification/SKILL.md` | Standalone `rms_audit_app.html` generator | `python3 generate_rms_audit_app.py` |

---

## Shared Runtime Maintenance (`shared/`)

Each `v2/<connector>/` directory is **100% self-contained** so `gcloud run deploy --source .` works directly inside any connector folder. When editing [`shared/mcp_v2_extensions.js`](./shared/mcp_v2_extensions.js) or [`shared/sharepoint_v2_wrapper.js`](./shared/sharepoint_v2_wrapper.js), run:

```bash
./sync_v2_shared.sh
```

## Running All `v2.0` Smoke & Security Suites Locally

```bash
for d in \
  claude_mcp_sonnet \
  customize_outlook_mcp \
  sharepoint-mcp-server \
  customize-sharepoint-mcp-server \
  least-privilege-sharepoint-mcp-server \
  sharepoint-mcp-server-purview-label \
  sharepoint-mcp-server-purview-sdp \
  workiq-mcp-purview; do
  (cd "$d" && ./test_local.sh)
done
```
