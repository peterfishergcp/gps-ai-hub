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

### 1.2 Server-Side WIF STS Token Exchange Backed by Google Cloud KMS (`ediscovery-archiver`)
Because Workforce Identity Pools map external assertions to Google Cloud federated principals based on the pool-level subject (`google.subject`), any OIDC provider within the **same** Workforce Identity Pool (`locations/global/workforcePools/<YOUR_WORKFORCE_POOL_ID>`) that maps `google.subject = assertion.sub` produces the **exact same federated principal** (`principal://iam.googleapis.com/locations/global/workforcePools/<YOUR_WORKFORCE_POOL_ID>/subject/<USER_SUBJECT>`).

`setup_ediscovery_archiver_provider.py` provisions:
1. A **Google Cloud KMS Asymmetric Signing Key** (`projects/<YOUR_GCP_PROJECT_ID>/locations/us-central1/keyRings/ge-ediscovery-kr/cryptoKeys/ediscovery-archiver-jwt-key`, algorithm `RSA_SIGN_PKCS1_2048_SHA256`).
2. An offline JWKS (`archiver_jwks.json`, `kid: "archiver-kms-key-1"`) extracted from the Cloud KMS public key and registered on the `ediscovery-archiver` OIDC provider.

At runtime, `ge_harvest.py` computes the SHA-256 digest of the JWT signing input (`header.payload`), calls `projects.locations.keyRings.cryptoKeys.cryptoKeyVersions.asymmetricSign` via IAM-authenticated HTTPS, and performs an RFC 8693 OAuth 2.0 Token Exchange against `https://sts.googleapis.com/v1/token` for each session owner discovered in Cloud Logging. **No private key ever exists on disk or inside the Cloud Run container.**

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

### 1.5 Custom Agent Observability: No-Code Agents vs. ADK Agents
Enabling `observabilityConfig` on a Gemini Enterprise **Engine** (`engines/{engine_id}`) only enables logging for the default core assistant (`core_assistant`). Each custom agent registered under `engines/{engine_id}/assistants/default_assistant/agents/{agent_id}` has its own independent `observabilityConfig` field:

1. **Per-Agent `observabilityConfig` (`enable_ge_sensitive_logging.py`)**:
   ```http
   PATCH https://{location}-discoveryengine.googleapis.com/v1alpha/projects/<YOUR_GCP_PROJECT_ID>/locations/{location}/collections/default_collection/engines/{engine_id}/assistants/default_assistant/agents/{agent_id}?updateMask=observabilityConfig
   Content-Type: application/json

   {
     "displayName": "<EXISTING_AGENT_DISPLAY_NAME>",
     "description": "<EXISTING_AGENT_DESCRIPTION>",
     "observabilityConfig": {
       "observabilityEnabled": true,
       "sensitiveLoggingEnabled": true
     }
   }
   ```
   - **No-Code Agents (`lowCodeAgentDefinition`)**:
     - Emits outer user activity logs (`StreamAssist` with `response.agentInfo.spiffeId` and `request.query.parts[0].text`) to `discoveryengine.googleapis.com/gemini_enterprise_user_activity`.
     - Emits full OpenTelemetry GenAI inference details to `discoveryengine.googleapis.com/gen_ai.client.inference.operation.details` (`resource.type="discoveryengine.googleapis.com/Agent"`), including full system instructions, tool declarations (`transfer_to_agent`, `docgen_agent`), `gen_ai.input.messages`, `gen_ai.output.messages`, and exact token counts (`gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.usage.reasoning.output_tokens`).
     - When a No-Code Agent delegates PDF creation to `docgen_agent`, Discovery Engine writes an `AddContextFile` entry against the **Session** (`sessions/{session_id}`) containing `fileId`, `fileName`, `mimeType`, and `byteCount` ~2ms before the `StreamAssist` entry. Both `ge_harvest.py` (which downloads the PDF binary via `:downloadFile` to GCS) and the real-time BigQuery view `v_realtime_agent_and_file_activity` correlate these two events by `session_id`.
   - **ADK Agents (`adkAgentDefinition` -> Vertex AI Agent Engine `ReasoningEngine`)**:
     - Enabling `observabilityConfig` on the Gemini Enterprise Agent registration captures the outer user prompt and final response returned to Gemini Enterprise in `gemini_enterprise_user_activity` and `GetSession`.
     - To also capture **un-redacted internal LLM prompts, tool calls, and sub-agent steps** inside `aiplatform.googleapis.com/reasoning_engine_stdout` (`gen_ai.user.message` / `gen_ai.choice`), the Vertex AI `ReasoningEngine` deployment must set **both** environment variables in `deploymentSpec.env`:
       - `GOOGLE_CLOUD_AGENT_ENGINE_ENABLE_TELEMETRY="true"`
       - `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT="true"` *(if omitted, internal ADK logs scrub message text to `{"content": "<elided>"}`)*.

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

### 3.1 Real-Time Event-Driven Cloud Run Pipeline (`<10s` Latency)
- **Scenario**: A user uploads a sensitive file or generates a PDF/image and immediately deletes the chat session in the Gemini Enterprise UI.
- **Architecture (`deploy_cloudrun_harvester.py` + `cloudrun_harvester_server.py`)**:
  - **Cloud Logging Sink (`ge-ediscovery-pubsub-sink`)** routes matching `StreamAssist`, `UploadSessionFile`, `AddContextFile`, `GenerateFreeFormStreamed`, `BatchCreateSources`, and `CreateNotebook` log entries in real time to **Cloud Pub/Sub (`ge-ediscovery-events`)**. *(Note: `GetNotebook` is intentionally excluded from the Pub/Sub sink filter to prevent recursive harvesting loops).*
  - **Authenticated Pub/Sub Push (`ge-ediscovery-push-sub`)** pushes each log entry with an OIDC Bearer token (`ge-ediscovery-harvester-sa@<YOUR_GCP_PROJECT_ID>.iam.gserviceaccount.com`) to `POST https://ge-ediscovery-harvester-...run.app/pubsub`.
  - **Targeted Single-Session Harvest (`harvest_single_event`)**: Instead of scanning all historical logs, the Cloud Run service extracts the exact `session_id` or `notebook_id` from the Pub/Sub event, signs a WIF JWT via Cloud KMS `:asymmetricSign`, downloads the session transcript and binary files via `:downloadFile` to GCS, and runs a parameterized BigQuery `DELETE` + multipart `LOAD` job in **~6–10 seconds**.

### 3.2 Identity Scope: Workforce Identity (`WIF`) vs. Google Workspace / Cloud Identity Users
- **Scenario**: An engine uses **Google Workspace / Cloud Identity** (`user:alice@corp.com`) instead of Workforce Identity Federation (`principal://iam.googleapis.com/locations/global/workforcePools/...`).
- **Impact**: The `ediscovery-archiver` custom OIDC provider can only mint STS tokens for subjects inside its Workforce Identity Pool (`<YOUR_WORKFORCE_POOL_ID>`). It cannot impersonate native Google Workspace accounts.
- **Mitigation**: Keep all compliance-regulated Gemini Enterprise engines bound to Workforce Identity Federation, or use Google Workspace Domain-Wide Delegation (DWD) if Workspace users must be harvested.

### 3.3 Hardware-Backed Key Custody via Google Cloud KMS (`asymmetricSign`)
- **Scenario**: The `ediscovery-archiver` OIDC provider trusts JWTs signed by its registered RSA keypair to mint WIF tokens for Workforce Pool subjects.
- **Mitigation Implemented**:
  1. `setup_ediscovery_archiver_provider.py` provisions an asymmetric signing key (`ediscovery-archiver-jwt-key`, `RSA_SIGN_PKCS1_2048_SHA256`) inside **Google Cloud KMS** (`ge-ediscovery-kr`).
  2. The private key material never leaves Google Cloud KMS hardware/software modules and is never written to disk or packaged into the Cloud Run container image (`.gcloudignore` also explicitly blocks `*.pem`).
  3. Only the dedicated `ge-ediscovery-harvester-sa` service account holds `roles/cloudkms.signerVerifier` on `ediscovery-archiver-jwt-key`, and every `asymmetricSign` call is recorded in Cloud Audit Logs.

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

### 3.9 Handling `<elided>` User Principals (Engines Created Before `sensitiveLoggingEnabled: true`)
- **Scenario**: A new Gemini Enterprise engine is created with `observabilityEnabled: true` while `sensitiveLoggingEnabled` is initially `false`. Any `StreamAssist` turn executed before `sensitiveLoggingEnabled` is enabled emits `"userIamPrincipal": "<elided>"` and `"serviceTextReply": "<elided>"` in Cloud Logging.
- **Mitigation Implemented in `ge_harvest.py`**:
  1. Even when Cloud Logging records `"<elided>"`, Discovery Engine's `GetSession?includeAnswerDetails=true` endpoint still retains the full unredacted conversation turns under the owning user's Workforce Identity subject.
  2. `ge_harvest.py` automatically strips `"<elided>"` and probes candidate principals (`FALLBACK_PRINCIPALS` / recent non-elided principals) against `GetSession` to resolve the real session owner and harvest the complete unredacted session.
  3. If a session remains permanently unowned or deleted (`HTTP 403` / `404` across all candidate principals), `harvest_session()` logs a warning and returns `200 OK` so the Pub/Sub push subscription (`ge-ediscovery-push-sub`) acknowledges the message instead of entering a `500` retry loop.

### 3.10 Preventing Spoliation: Custom No-Delete Role (`geUserNoDelete`) & Dead-Letter Queue (`ge-ediscovery-dlq`)
- **Scenario**: Even with a `<10s` event-driven Cloud Run harvester, raw file bytes (`:downloadFile`) and $>64\text{ KiB}$ untruncated conversation turns (`GetSession`) exist only inside the user's Discovery Engine session until harvested. A user granted the standard `roles/discoveryengine.user` predefined role could call `DeleteSession` or delete a chat in the Gemini Enterprise UI within 1–2 seconds of sending a prompt.
- **Mitigation Implemented (`setup_no_delete_role.py`, `scripts/swap-user-role.sh`, `scripts/verify.sh`, `scripts/replay-dlq.sh`)**:
  1. **Dynamic Custom Role (`projects/<YOUR_GCP_PROJECT_ID>/roles/geUserNoDelete`)**: Queries `iam.googleapis.com/v1/roles/discoveryengine.user` and intersects its permissions with `permissions:queryTestablePermissions` for the project, removing **only**:
     - `discoveryengine.sessions.delete`
     - `discoveryengine.sessions.removeContextFile`
  2. **Non-Authoritative Single-Principal Role Swap**:
     - Never uses an authoritative role binding that would strip other members of `roles/discoveryengine.user`, and never deletes custom roles.
     - First additively grants `projects/<YOUR_GCP_PROJECT_ID>/roles/geUserNoDelete` to the Workforce Identity Pool principal (`principalSet://iam.googleapis.com/locations/global/workforcePools/<YOUR_WORKFORCE_POOL_ID>/*`).
     - Saves a timestamped JSON backup of the project IAM policy (`iam-policy-<PROJECT_ID>-<TIMESTAMP>.backup.json`) and removes `roles/discoveryengine.user` **only** from that target member (`--apply`), with 1-command restoration via `--rollback`.
     - Because `ge_harvest.py` only requires read permissions (`discoveryengine.sessions.get`, `discoveryengine.sessions.downloadFile`, `discoveryengine.notebooks.get`) when impersonating a WIF user via `mint_sts_token()`, removing the two delete permissions has zero impact on harvesting while blocking user-initiated session deletion with `HTTP 403 PERMISSION_DENIED`.
  3. **Pub/Sub Dead-Letter Topic (`ge-ediscovery-dlq` + `ge-ediscovery-dlq-hold`)**:
     - `ge-ediscovery-push-sub` routes any event that fails 10 delivery attempts to `ge-ediscovery-dlq` (retained for 7 days in `ge-ediscovery-dlq-hold`), where operators can inspect or replay messages via `scripts/replay-dlq.sh <PROJECT_ID> --peek|--replay`.

