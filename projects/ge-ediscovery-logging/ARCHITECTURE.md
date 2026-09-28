# Technical Architecture & Production Hardening Guide

> **Disclaimer**: This repository and its contents are provided for illustration and educational purposes only as example code. This is not an official Google product or officially supported Google Cloud project. This code is provided as-is for demonstration purposes and is NOT intended or supported for production workloads. The views, code, and opinions expressed in this repository are those of the author(s) and do not necessarily reflect the position, opinions, or official policy of Google LLC or Google Cloud Platform.

---

## 1. Discovery Engine Session & File API Contracts

### 1.1 Per-User Session Ownership Enforcement
In Gemini Enterprise engines backed by **Workforce Identity Federation (WIF)**, every session (`projects/{project}/locations/{location}/collections/default_collection/engines/{engine}/sessions/{session}`) stores the creating user's federated principal (`userIamPrincipal`).

When any caller invokes:
- `GET /v1alpha/{session_name}?includeAnswerDetails=true`
- `GET /v1/{session_name}:downloadFile?file_id={file_id}&alt=media`

Discovery Engine compares the OAuth 2.0 Bearer token's identity against the session's owner. If a Google Cloud IAM Administrator or Service Account calls these endpoints directly, Discovery Engine returns:
```json
{
  "error": {
    "code": 403,
    "message": "Session is not owned by the provided user.",
    "status": "PERMISSION_DENIED"
  }
}
```

### 1.2 Server-Side WIF STS Token Exchange (`ediscovery-archiver`)
Because Workforce Identity Pools map external assertions to Google Cloud federated principals based on the pool-level subject (`google.subject`), any OIDC provider within the **same** Workforce Identity Pool (`locations/global/workforcePools/<YOUR_WORKFORCE_POOL_ID>`) that maps `google.subject = assertion.sub` produces the **exact same federated principal** (`principal://iam.googleapis.com/locations/global/workforcePools/<YOUR_WORKFORCE_POOL_ID>/subject/<USER_SUBJECT>`).

`setup_ediscovery_archiver_provider.py` provisions a dedicated OIDC provider (`ediscovery-archiver`) with an offline RSA-2048 public key (`jwksJson`) so `ge_harvest.py` can perform an RFC 8693 OAuth 2.0 Token Exchange against `https://sts.googleapis.com/v1/token` for each session owner discovered in Cloud Logging.

### 1.3 Session File Upload (`:uploadFile`) and Download (`:downloadFile`) Endpoints
- **Upload (`USER_PROVIDED`)**:
  ```http
  POST https://{location}-discoveryengine.googleapis.com/upload/v1alpha/{session_name}:uploadFile
  Authorization: Bearer <WIF_STS_TOKEN>
  X-Goog-User-Project: <YOUR_GCP_PROJECT_ID>
  X-Goog-Upload-Protocol: raw
  X-Goog-Upload-File-Name: <FILENAME>
  X-Goog-Upload-Header-Content-Type: <MIME_TYPE>
  Content-Type: <MIME_TYPE>
  ```
- **Download (`USER_PROVIDED` & `AI_GENERATED`)**:
  ```http
  GET https://{location}-discoveryengine.googleapis.com/v1/{session_name}:downloadFile?file_id={file_id}&alt=media
  Authorization: Bearer <WIF_STS_TOKEN>
  X-Goog-User-Project: <YOUR_GCP_PROJECT_ID>
  ```

### 1.4 NotebookLM Enterprise Observability & REST API Contracts
Unlike standard Gemini Enterprise chat engines (`engines/*`), **NotebookLM Enterprise** is configured at the **Project level** and uses a dedicated Cloud Logging stream and `v1alpha` REST resource hierarchy:

1. **Project-Level Sensitive Logging Configuration**:
   `enable_ge_sensitive_logging.py` patches `projects/{project}/locations/{location}` (`global`, `us`, `eu`) with `updateMask=customerProvidedConfig.notebooklmConfig.observabilityConfig`:
   ```http
   PATCH https://{location}-discoveryengine.googleapis.com/v1alpha/projects/<YOUR_GCP_PROJECT_ID>
   Content-Type: application/json

   {
     "customerProvidedConfig": {
       "notebooklmConfig": {
         "observabilityConfig": {
           "observabilityEnabled": true,
           "sensitiveLoggingEnabled": true
         }
       }
     }
   }
   ```
2. **Cloud Logging Stream (`discoveryengine.googleapis.com%2Fnotebooklm_enterprise_user_activity`)**:
   - `NotebookService.GenerateFreeFormStreamed`: Captures `userIamPrincipal`, `request.name` (`projects/{num}/locations/{loc}/notebooks/{id}`), `request.userQuery` (the exact user prompt), and cumulative streamed chunks in `serviceTextReply` (which `ge_harvest.py` deduplicates and reassembles via `clean_notebooklm_streamed_reply()`).
   - `NotebookService.CreateNotebook` / `GetNotebook`: Captures `response.name` and `response.title`.
   - `SourceService.BatchCreateSources`: Captures `response.sources[]` (`name`, `sourceId.id`, `title`, `settings.status`) and `status.message` (which records attempted external `web_content.url` values when URL ingestion fails).
3. **Per-User WIF STS Notebook & Source Discovery**:
   Because private notebooks (`isShared: false`) are owned by the creating WIF user, `ge_harvest.py` mints a short-lived WIF STS token via `ediscovery-archiver` for each active user and calls:
   - `GET https://{location}-discoveryengine.googleapis.com/v1alpha/projects/{project}/locations/{location}/notebooks:listRecentlyViewed`
   - `GET https://{location}-discoveryengine.googleapis.com/v1alpha/projects/{project}/locations/{location}/notebooks/{notebook_id}`
   - `GET https://{location}-discoveryengine.googleapis.com/v1alpha/projects/{project}/locations/{location}/notebooks/{notebook_id}/sources/{source_id}` (returning `title`, `metadata.wordCount`, `metadata.tokenCount`, `metadata.sourceAddedTimestamp`, and origin metadata for PDFs, Markdown/text, Google Drive docs, YouTube videos, web URLs, and Agentspace sources).

---

## 2. Cloud Storage Archive Layout

All harvested artifacts are stored in `gs://<YOUR_GCP_PROJECT_ID>-ge-ediscovery` with **Uniform Bucket-Level Access (UBLA)** and **Object Versioning** enabled:

```text
gs://<YOUR_GCP_PROJECT_ID>-ge-ediscovery/
├── sessions/
│   └── <ENGINE_ID>/
│       └── <SESSION_ID>/
│           └── session_transcript.json        # Full GetSession?includeAnswerDetails=true JSON
├── files/
│   └── <ENGINE_ID>/
│       └── <SESSION_ID>/
│           ├── USER_PROVIDED/
│           │   └── <FILE_ID>_<SANITIZED_FILENAME>
│           └── AI_GENERATED/
│               └── <FILE_ID>_<SANITIZED_FILENAME>
└── notebooks/
    └── <LOCATION>/
        └── <NOTEBOOK_ID>/
            └── notebook_archive.json          # Full Notebook metadata, enriched sources[], and prompt/response turns
```

Each file record written into `conversation_turns.files` in BigQuery includes both **SHA-256** (hex) and **RFC 3720 CRC32C** (base64, matching Google Cloud Storage's native object checksum) to guarantee cryptographic chain-of-custody verification.

---

## 3. Architectural Considerations, Edge Cases & Production Hardening

When deploying this reference architecture into a regulated enterprise environment, review the following operational considerations and hardening recommendations:

### 3.1 Race Condition: User Deletes Session or File Before Harvester Runs
- **Scenario**: A user uploads a sensitive file or generates an image and immediately deletes the chat session in the Gemini Enterprise UI before `ge_harvest.py` runs.
- **Impact**:
  - The **Cloud Logging sink (`discoveryengine_googleapis_com_gemini_enterprise_user_activity`)** is real-time and immutable—the user's text prompt, the model's text reply, and the `UploadSessionFile` / `AddContextFile` metadata (`fileId`, `fileName`, `mimeType`) are permanently captured even if the user deletes the session 1 second later.
  - However, the **raw binary bytes** of the file and the internal `thought_text` are fetched by `ge_harvest.py` via `GetSession` and `:downloadFile`. If the session is deleted before `ge_harvest.py` runs, `:downloadFile` returns `HTTP 404`.
- **Mitigation**: Instead of running `ge_harvest.py` on a daily/hourly batch schedule, trigger it in **near-real-time (< 5 seconds)** by routing the Cloud Logging sink to **Cloud Pub/Sub -> Cloud Run** whenever `methodName IN ("StreamAssist", "UploadSessionFile", "AddContextFile")` appears.

### 3.2 Identity Scope: Workforce Identity (`WIF`) vs. Google Workspace / Cloud Identity Users
- **Scenario**: An engine uses **Google Workspace / Cloud Identity** (`user:alice@corp.com`) instead of Workforce Identity Federation (`principal://iam.googleapis.com/locations/global/workforcePools/...`).
- **Impact**: The `ediscovery-archiver` custom OIDC provider can only mint STS tokens for subjects inside its Workforce Identity Pool (`<YOUR_WORKFORCE_POOL_ID>`). It cannot impersonate native Google Workspace accounts.
- **Mitigation**: Keep all compliance-regulated Gemini Enterprise engines bound to Workforce Identity Federation, or use Google Workspace Domain-Wide Delegation (DWD) if Workspace users must be harvested.

### 3.3 Security & Key Custody of `.archiver_private_key.pem`
- **Scenario**: The `ediscovery-archiver` OIDC provider trusts any JWT signed by `.archiver_private_key.pem` to impersonate any Workforce Pool user subject.
- **Impact**: Anyone with read access to `.archiver_private_key.pem` can mint a WIF token for any user in that pool.
- **Mitigation**:
  1. Never store `.archiver_private_key.pem` on a developer workstation or in source control (enforced via `.gitignore`).
  2. In production, store the key inside **Cloud KMS** (`asymmetricSign` API) or **Secret Manager** accessible only to a dedicated, locked-down Cloud Run Job service account.
  3. Apply an **IAM Attribute Condition** on the `ediscovery-archiver` OIDC provider or restrict its IAM bindings so tokens minted by `ediscovery-archiver` only have Discovery Engine session read permissions—not access to unrelated GCP resources.

### 3.4 Third-Party / Federated Connector Citations (SharePoint, Jira, Outlook, WorkIQ MCP)
- **Scenario**: A user asks Gemini Enterprise a question grounded in a federated connector (e.g., SharePoint Online, Outlook, or a custom MCP server) rather than uploading a local file via the `+` button.
- **Impact**:
  - `:uploadFile` / `:downloadFile` only stores **session-scoped binary files** (files uploaded directly into the chat session or generated by tools like Imagen).
  - Documents retrieved via a connector are returned as **grounded citations / text chunks** inside `detailedAssistAnswer.replies[].groundedContent`—not as downloadable session `fileId` binaries.
- **Mitigation**: `ge_harvest.py` archives the **entire raw `GetSession` JSON** (`session_transcript.json`) to GCS, which preserves the exact grounded text snippets and source URLs cited during that turn.

### 3.5 Streaming Interruptions or Partial/Failed Turns
- **Scenario**: A user clicks "Stop generating" mid-response, or an upload fails (e.g., unsupported file type or network drop).
- **Impact**:
  - Failed uploads emit an `UploadSessionFile` log entry with `severity=ERROR` or a non-zero `status.code` and no valid `fileId` (which `ge_harvest.py` filters out).
  - Aborted streaming turns may appear in the raw Cloud Logging table without a final `serviceTextReply`.

### 3.6 Multi-Turn File Attribution in `GetSession`
- **Scenario**: A user uploads 3 files in Turn 1, and then uploads 1 more file in Turn 4 of the same session.
- **Impact**: Discovery Engine's `UploadSessionFile` log records that the file was uploaded to `sessions/{sessionId}` at timestamp $T$, rather than explicitly binding it to a `queryId`.
- **Mitigation**: If exact turn-level file attribution is required for multi-upload sessions, correlate `UploadSessionFile.timestamp` against each turn's `createTime` in `detailedAssistAnswer.replies[]`.

### 3.7 Cloud Storage WORM Retention (SEC 17a-4 / FINRA Compliance)
- **Scenario**: A regulatory audit requires proof that neither users nor administrators could alter or delete archived files in `gs://<YOUR_GCP_PROJECT_ID>-ge-ediscovery`.
- **Mitigation**: Enable **Object Versioning** (configured automatically by `setup_storage_and_bigquery.py`) and attach a **locked Bucket Retention Policy** (`gcloud storage buckets update gs://<YOUR_GCP_PROJECT_ID>-ge-ediscovery --retention-period=... --lock`) for strict WORM (Write-Once-Read-Many) compliance.

### 3.8 Bidirectional Live Voice / Audio (`bi-directional-audio`) Governance
- **Scenario**: Unlike text/multimodal chat (`StreamAssist`) and NotebookLM Enterprise (`GenerateFreeFormStreamed`), real-time WebRTC/WebSocket **Bidirectional Live Voice** (`features.bi-directional-audio`) streams raw PCM audio frames directly to the model without persisting a downloadable `.wav` or text transcript inside `GetSession`.
- **Mitigation**: For regulated user populations subject to strict 100% communication retention (e.g., SEC Rule 17a-4 / FINRA), disable the `bi-directional-audio` feature flag on the Gemini Enterprise engine (`features: {"bi-directional-audio": "FEATURE_STATE_OFF"}`) so all interactions are forced through auditable text/file `StreamAssist` turns and NotebookLM Enterprise logs.
