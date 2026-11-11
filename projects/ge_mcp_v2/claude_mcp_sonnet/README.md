# Vertex AI Claude Reasoning & Critique MCP Server v2.0

> **Disclaimer**: Provided for illustration and educational purposes only under the Apache License 2.0. Not an official Google product.

## What's New in `v2.0.0`

1. **Official MCP Skills Extension (`io.modelcontextprotocol/skills`, SEP-2640):**
   - Publishes `skill://vertex-claude-reasoning/SKILL.md` (plus `references/`) via `skills/list`, `skills/get`, `resources/read`, and `resources/directory/read` with cryptographic `sha256:...` digests and exact byte sizes.
   - The `skills/` directory follows the standard `SKILL.md` format and can also be uploaded directly as a portable Gemini / Workspace Studio / Claude / Copilot skill.
2. **Official MCP Apps Extension (`io.modelcontextprotocol/ui`, SEP-1865):**
   - Serves `ui://vertex-claude-mcp/reasoning-workbench.html` (`text/html;profile=mcp-app`) via Dual-Delivery (`resources/read` + `open_claude_reasoning_workbench` `EmbeddedResource` + `structuredContent`).
   - Built with zero `innerHTML` DOM sinks (`createElement` + `textContent` only), adaptive host theme variables (`ui/notifications/host-context-changed`), live `tools/call`, `ui/message`, and `ui/update-model-context`.
3. **Security Hardening Built-In:**
   - Secure-by-default Cloud Run IAM ingress (`--no-allow-unauthenticated` unless `ALLOW_UNAUTHENTICATED=true`), PKCE `S256` + `redirect_uri` + `refresh_token` verification, token/rightmost-IP rate limiting, and `0` npm advisories.

## Quick Verification & Cloud Run Deployment

```bash
corepack npm ci
./test_local.sh
./deploy.sh
```
