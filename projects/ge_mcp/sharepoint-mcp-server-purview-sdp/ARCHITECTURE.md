# Architecture Specification: SharePoint MCP Server with Dynamic Google Cloud SDP & Microsoft Purview Governance

> **Disclaimer**: This documentation and codebase are provided for illustrative and educational purposes only. This is **NOT** an official Google product.

---

## 1. Executive Summary & Problem Statement

Enterprises running multi-cloud data estates often store sensitive intellectual property, acquisition targets, and restricted records inside Microsoft 365 (SharePoint and OneDrive) tagged with **Microsoft Purview Information Protection (MIP) sensitivity labels**. 

When exposing these document repositories to enterprise AI assistants (like Gemini Enterprise), organizations face two critical compliance challenges:
1. **Static Configuration Antipattern**: Hardcoding Purview label GUIDs (e.g. `27c86af4-afb5-4c50-...`) into connector code or environment variables is fragile and unscalable across enterprise tenants with evolving taxonomy.
2. **Dual-Platform Policy Drift**: When security compliance teams update DLP policies or sensitivity thresholds in Google Cloud Sensitive Data Protection (SDP), custom connectors that rely on manual redeployment quickly fall out of compliance.

### The Solution: Dynamic Multi-Cloud Governance
This connector implements a **fully autonomous, dynamic policy synchronization architecture**:
* Automatically discovers the Google Cloud SDP Content Policy assigned to the Gemini Enterprise connector.
* Fetches all registered Purview sensitivity label GUIDs and custom regex patterns directly from the Cloud DLP API at runtime.
* Intercepts and classifies SharePoint documents on-the-fly.
* Enforces real-time `BLOCK` or `ALLOW` verdicts with streaming audit logging to Google BigQuery.

---

## 2. End-to-End System Architecture

```
                                  USER PROMPT (Gemini Enterprise)
                                               │
                                               ▼
                              ┌──────────────────────────────────┐
                              │    Discovery Engine / Gemini     │
                              │        Enterprise App            │
                              │     ("ge-mcp-with-sdp")          │
                              └────────────────┬─────────────────┘
                                               │ Evaluates
                                               │ SDP Policy
                                               ▼
                              ┌──────────────────────────────────┐
                              │  Google Cloud SDP Content Policy │
                              │         ("purview_cepf")         │
                              │  • CUSTOM_CEPF_LABEL (GUID)      │
                              │  • Source_Selection (FAR Regex)  │
                              │  • Action: returnVerdict=BLOCK   │
                              └────────────────┬─────────────────┘
                                               │ Calls MCP Tools
                                               │ with User Bearer Token
                                               ▼
   ┌────────────────────────────────────────────────────────────────────────────────────────┐
   │ Cloud Run: sharepoint-mcp-purview-sdp                                                  │
   │                                                                                        │
   │  ┌────────────────────────┐         ┌─────────────────────────┐                        │
   │  │ Dynamic SDP Resolver   │ ◄───────┤ Google Cloud DLP API    │                        │
   │  │ • 5-min TTL Cache      │         │ dlp.googleapis.com      │                        │
   │  │ • Syncs GUIDs & Regex  │         └─────────────────────────┘                        │
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
   │  ┌────────────────────────┐             (demoalto.sharepoint.com)                      │
   │  │ Document Extractor     │             • Cymbal_QuantumLedger.docx                    │
   │  │ • Mammoth (DOCX)       │             • Policy 2321.docx                             │
   │  │ • XLSX / CSV parser    │                                                            │
   │  │ • OOXML Buffer Matcher │                                                            │
   │  └───────────┬────────────┘                                                            │
   │              │ Attaches classification metadata                                        │
   │              │ and security banner                                                     │
   │              ▼                                                                         │
   └──────────────┬─────────────────────────────────────────────────────────────────────────┘
                  │
                  ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ Google Cloud SDP Interceptor                                 │
   │ • Evaluates content against purview_cepf rules               │
   │ • Triggers BLOCK verdict                                     │
   │ • Streams audit event to BigQuery (ai-hub-459714.sdp_logging)│
   └──────────────────────────────────────────────────────────────┘
```

---

## 3. Key Components & Data Flows

### Component 1: Dynamic SDP Policy Synchronizer
* **Location**: `index.js` (`refreshSdpContentPolicy()`)
* **Mechanism**:
  1. Retrieves Google Cloud access token via internal metadata server (`http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token`).
  2. Queries Discovery Engine dataStore config (`mcp-sharepoint-sdpv2_1788976377072_mcp_data`) to identify the assigned `sensitiveDataProtectionPolicy.policy`.
  3. Fetches the policy definition from `https://dlp.googleapis.com/v2/projects/{project}/locations/us/contentPolicies/{policy}`.
  4. Parses `inspectConfig.customInfoTypes`:
     - **Purview Sensitivity Label GUIDs**: Extracts `fileLabelInfoType.sensitivityLabel.guid` into an in-memory Map (`cachedPolicyState.guidToInfoTypeMap`).
     - **Custom Regex Rules**: Compiles regex patterns (e.g. `(?i)SOURCE\s+SELECTION\s+INFORMATION...`) into active rule matchers.
  5. **Auto-Refresh**: Background timer refreshes policy definitions every 5 minutes or on-demand via the `/health` diagnostic probe.

### Component 2: Dual-Layer Authentication & Graph API Client
* **Location**: `index.js` (`getGraphHeaders()`)
* **Behavior**:
  - **Primary (Delegated User Identity)**: If Gemini Enterprise forwards the end-user's Bearer token (`authHeader.startsWith('Bearer ')`), the server executes all Graph requests on behalf of the user, preserving Entra ID permissions and SharePoint ACLs.
  - **Secondary (Application Client Credentials)**: If no user token is present (e.g. background indexing or admin tools), the connector falls back to OAuth 2.0 client credentials using `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET`, and `MS_GRAPH_TENANT_ID`.

### Component 3: Multi-Layer Purview Label Extraction
* **Location**: `index.js` (`extractSensitivityLabelInfo()`)
* When inspecting files, the connector uses a 4-tier inspection waterfall:
  1. **Graph Beta `sensitivityLabel` Facet**: Native Microsoft Information Protection metadata.
  2. **SharePoint Extended List Item Fields**: Checks `_SensitivityLabelId`, `_SensitivityLabel`, and `_ComplianceTag`.
  3. **OOXML Buffer Deep Inspection**: Reads the raw binary buffer of `.docx`, `.pptx`, and `.xlsx` archives to extract embedded `custom.xml` properties matching `MSIP_Label_<GUID>`.
  4. **Dynamic SDP Policy Matcher**: Cross-references detected GUIDs or regex text against the dynamically resolved SDP policy rules.

### Component 4: Content Interception & SDP Verdict Enforcement
* When a protected document is read via `query_file_content_lookup`:
  - The document text is extracted using high-speed parsers (`mammoth` for Word, `xlsx` for Excel).
  - If a sensitivity label or regex rule is detected, a standardized classification banner is injected:
    ```text
    [CLASSIFICATION: RESTRICTED / PURVIEW SENSITIVITY LABEL: CUSTOM_CEPF_LABEL (GUID: 27c86af4-afb5-4c50-9816-2f0e144288d0) - ACTION VERDICT: BLOCK - SOURCE SELECTION INFORMATION - SEE FAR 2.101 AND 3.104]
    ```
  - Google Cloud SDP Content Policy intercepts the stream, enforces the configured `returnVerdict: BLOCK`, and logs the event to BigQuery.

---

## 4. Operational Telemetry & Health Monitoring

The connector exposes a rich diagnostic `/health` endpoint returning live synchronization telemetry:

```json
{
  "status": "healthy",
  "service": "sharepoint-mcp-server-purview-sdp",
  "version": "1.1.0",
  "sdpContentPolicy": "projects/ai-hub-459714/locations/us/contentPolicies/purview_cepf",
  "dynamicSdpSync": {
    "activePurviewGuids": [
      "27c86af4-afb5-4c50-9816-2f0e144288d0"
    ],
    "activeRegexRules": [
      "Source_Selection"
    ],
    "totalLabelsTracked": 1,
    "lastPolicySync": "2026-09-10T13:48:43.357Z"
  },
  "timestamp": "2026-09-10T13:51:00.000Z"
}
```

### BigQuery Audit Schema (`sdp_logging.log1`)
Every policy evaluation is logged with the following structure:
* `log_time`: UTC timestamp of the evaluation.
* `document_id`: Target SharePoint webUrl or document name.
* `returned_verdict`: `BLOCK` or `ALLOW`.
* `matching_info_types`: Array of matched classifications (`CUSTOM_CEPF_LABEL`, `Source_Selection`).
