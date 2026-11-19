# AGY Security — Always-On Secure Engineering Guardrails

Enforce these baseline security controls across every code, script, dashboard, and cloud configuration task:

1. **Zero Hardcoded Secrets or Service-Account Keys:**
   - Never hardcode API keys, database passwords, OAuth client secrets, JWT signing keys, or `.json` service-account private keys in code, scripts, or chat. Use Google Cloud ADC, Entra-synced Google Identity OAuth, or Google Cloud Secret Manager (`--set-secrets`). Always exclude `.env*` and `*credentials*.json` in `.gitignore` and `.gcloudignore`.
2. **Parameterized Queries & Safe Command Execution:**
   - Never build SQL strings with string concatenation or template literals; always use parameterized bindings (`@param`, `$1`, `?`).
   - Never pass untrusted input into shell execution (`exec`, `system`, `shell: true`); use `execFile` / `spawn` (`shell: false`) with allow-listed arguments.
3. **Frontend XSS, Storage & Loopback Safety:**
   - Never use `innerHTML`, `outerHTML`, `insertAdjacentHTML`, or `document.write` with dynamic data; use `createElement`, `textContent`, or `DOMPurify` when rich HTML is unavoidable, paired with a strict Content Security Policy (`CSP`).
   - Never store authentication or session tokens in `localStorage` or `sessionStorage`.
   - Bind local preview/test servers strictly to `127.0.0.1` (never `0.0.0.0`), and never serve whole project root directories containing `.env` or `.git` via static HTTP handlers.
4. **End-User Identity Passthrough & Public-Sector Data Protection:**
   - When bridging enterprise connectors (such as Gemini Enterprise, SharePoint, Outlook, or Drive), always authenticate with the **end user's own OAuth token** so source ACLs and Entra-synced Google Identity groups are enforced—never route multi-user queries through a shared privileged service account.
   - Treat citizen PII, HIPAA, CJIS, FERPA, and FOIA-exempt records as high-sensitivity data: fail closed on errors and redact tokens/PII from logs.
