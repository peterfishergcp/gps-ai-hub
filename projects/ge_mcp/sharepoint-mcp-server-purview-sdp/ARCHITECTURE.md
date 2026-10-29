# Architecture Specification: SharePoint MCP Server with Dynamic Google Cloud SDP & Microsoft Purview Governance

> **Disclaimer**: This documentation and codebase are provided for illustrative and educational purposes only. This is **NOT** an official Google product.

---

## 1. Executive Summary & Problem Statement

Enterprises running multi-cloud data estates often store sensitive intellectual property, procurement records, and regulated records inside Microsoft 365 (SharePoint and OneDrive) tagged with **Microsoft Purview Information Protection (MIP) sensitivity labels**.

When exposing these document repositories to enterprise AI assistants (like Gemini Enterprise), organizations face two compliance challenges:
1. **Static Configuration Antipattern**: Hardcoding Purview label GUIDs into connector code or environment variables is brittle across enterprise tenants with evolving label taxonomies.
2. **Dual-Platform Policy Drift**: When security teams update DLP policies or sensitivity thresholds in Google Cloud Sensitive Data Protection (SDP), custom connectors that rely on manual redeployment fall out of compliance.

### Solution: Dynamic Multi-Cloud Fail-Closed Governance
This connector implements an **autonomous, fail-closed policy synchronization architecture**:
- Discovers the Google Cloud SDP Content Policy assigned to the Gemini Enterprise MCP data store (or configured via `SDP_CONTENT_POLICY`).
- Fetches registered Purview sensitivity label GUIDs and custom regex patterns directly from `https://dlp.googleapis.com/v2/...` at runtime.
- Inflates OOXML `docProps/custom.xml` asynchronously (`<=10 MB` cap) to detect Purview labels on `.docx`, `.xlsx`, and `.pptx` files.
- Enforces fail-closed `BLOCK` (withholding 100% of sensitive cleartext) or `MASK` verdicts server-side while emitting `msip_labels` and `assigned_labels` for Discovery Engine and BigQuery audit logging.

---

## 2. End-to-End System Architecture

```text
                                  USER PROMPT (Gemini Enterprise)
                                               │
                                               ▼
                              ┌──────────────────────────────────┐
                              │    Discovery Engine / Gemini     │
                              │        Enterprise App            │
                              └────────────────┬─────────────────┘
                                               │ Evaluates
                                               │ SDP ContentPolicy
                                               ▼
                              ┌──────────────────────────────────┐
                              │  Google Cloud SDP Content Policy │
                              │   (<YOUR_CONTENT_POLICY_ID>)     │
                              │  • CUSTOM_PURVIEW_LABEL (GUID)   │
                              │  • SOURCE_SELECTION (FAR Regex)  │
                              │  • Action: returnVerdict=BLOCK   │
                              └────────────────┬─────────────────┘
                                               │ Calls MCP Tools
                                               │ with User Bearer Token
                                               ▼
   ┌────────────────────────────────────────────────────────────────────────────────────────┐
   │ Cloud Run: sharepoint-mcp-server-purview-sdp                                           │
   │                                                                                        │
   │  ┌────────────────────────┐         ┌─────────────────────────┐                        │
   │  │ Dynamic SDP Resolver   │ ◄───────┤ Google Cloud DLP API    │                        │
   │  │ • 5-min TTL Cache      │         │ dlp.googleapis.com      │                        │
   │  │ • Strict Host Allowlist│         └─────────────────────────┘                        │
   │  └───────────┬────────────┘                                                            │
   │              │                                                                         │
   │              ▼                                                                         │
   │  ┌────────────────────────┐         ┌─────────────────────────┐                        │
   │  │ MCP Tool Handlers      │ ──────► │ Microsoft Graph API     │                        │
   │  │ • query_library_items  │         │ graph.microsoft.com     │                        │
   │  │ • query_file_content   │         └────────────┬────────────┘                        │
   │  └───────────┬────────────┘                      │                                     │
   │              │                                   ▼                                     │
   │              ▼                          SharePoint Online                              │
   │  ┌────────────────────────┐          (<YOUR_TENANT>.sharepoint.com)                    │
   │  │ Bounded Extractor      │                                                            │
   │  │ • Mammoth (.docx)      │                                                            │
   │  │ • ExcelJS (.xlsx)      │                                                            │
   │  │ • PPTX XML / unpdf     │                                                            │
   │  │ • Async custom.xml     │                                                            │
   │  └───────────┬────────────┘                                                            │
   │              │ Fail-closed BLOCK withholds text                                        │
   │              │ + emits msip_labels & assigned_labels                                   │
   └──────────────┼─────────────────────────────────────────────────────────────────────────┘
                  │
                  ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ Google Cloud SDP Interceptor & BigQuery Audit Sink           │
   │ • Evaluates msip_labels + content against ContentPolicy      │
   │ • Streams audit event to BigQuery (<YOUR_PROJECT>.sdp_logs)  │
   └──────────────────────────────────────────────────────────────┘
```

---

## 3. Key Components & Security Controls

### Component 1: Dynamic SDP Policy Synchronizer (`refreshSdpContentPolicy`)
1. Retrieves a Google Cloud access token via the Compute Engine metadata server.
2. Resolves `SDP_CONTENT_POLICY` via strict URL/resource validation (`resolveAllowedPolicyUrl`), permitting remote HTTPS fetches **exclusively** from `dlp.googleapis.com` and `storage.googleapis.com` (`CWE-918` SSRF protection).
3. Parses `inspectConfig.customInfoTypes` into in-memory Purview GUID maps and bounded regex rules, refreshing every 5 minutes.

### Component 2: Bounded Async Purview Label Extraction (`extractPurviewLabelAsync`)
Inspects three layers without synchronous event-loop blocking:
1. **Microsoft Graph `sensitivityLabel` Facet**.
2. **SharePoint `listItem.fields`** (`_SensitivityLabelId`, `_ComplianceTag`).
3. **Async OOXML `docProps/custom.xml` Decompression** (`zlib.inflateRaw` with `maxOutputLength: 10 MB` and `<=250` ZIP entry cap).

### Component 3: Fail-Closed Verdict Enforcement (`evaluateSdpVerdict`)
- **`BLOCK`**: Replaces `content` with `[ACCESS BLOCKED BY SENSITIVE DATA PROTECTION POLICY: ...]` so zero sensitive cleartext enters Cloud Run logs or the LLM context window, while preserving `msip_labels`, `assigned_labels`, and `assigned_sensitivity_labels`.
- **`MASK` / `REDACT`**: Replaces matched spans with `[REDACTED:<RULE_NAME>]`.

### Component 4: Hardened Minimal Health Probe (`GET /health`)
To prevent unauthenticated policy enumeration (`CWE-200`), `GET /` and `GET /health` return only operational liveness metadata:
```json
{
  "status": "ok",
  "service": "sharepoint-mcp-server-purview-sdp",
  "version": "2.1.0"
}
```
Active policy resource paths, Purview GUIDs, and custom regex rules are never exposed on public endpoints.
