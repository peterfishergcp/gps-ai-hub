---
name: security-audit
description: Performs a comprehensive, zero-install security audit of code, APIs, MCP servers, and Google Cloud architectures against OWASP Top 10, Google Cloud Well-Architected Framework (Security Pillar), and Assured Workloads controls (FedRAMP, CJIS, HIPAA), producing severity-ranked findings and exact fix diffs. Trigger on /security-audit, "audit this code for security", "check OWASP vulnerabilities", or "review this architecture for CJIS/HIPAA/FedRAMP".
---

# Zero-Install Application & Cloud Security Audit (`/security-audit`)

Run a rigorous code and architecture security audit directly inside Antigravity—requiring **zero third-party CLI scanners installed on corporate laptops**.

## Step 1: Build a Rapid Threat Model (`Entry Points -> Trust Boundaries -> Sinks`)
1. Identify all untrusted inputs (HTTP bodies/headers/query params, uploaded files/ZIPs, webhook payloads, LLM/MCP tool arguments, database/CSV rows).
2. Map sensitive assets (citizen PII, health/justice records, OAuth/session tokens, internal GCP/M365 endpoints) and trust boundaries.

## Step 2: Inspect Against the 8-Domain Checklist
Load `./references/owasp_and_cloud_waf_checklist.md` and systematically audit:
1. **Injection (`SQLi`, Command Injection, Template/Prompt Injection)**
2. **Cross-Site Scripting (`XSS`), `CSP`, & `CSRF` Protection**
3. **Authentication, Session Cookies (`HttpOnly`, `Secure`, `SameSite`) & Per-User ACL Enforcement**
4. **Path Traversal / `ZipSlip` & Static File Exposure (`.env` / `.git` leak prevention)**
5. **Server-Side Request Forgery (`SSRF`) & Egress Host Allowlisting**
6. **Secrets Hygiene, Logging Redaction & Fail-Closed Error Handling**
7. **Cloud Run / BigQuery / IAM Hardening** (non-root container, dedicated SA, `--no-allow-unauthenticated` / IAP, `maximumBytesBilled`, CMEK/VPC-SC)
8. **Public-Sector Compliance Fit** (*Assured Workloads* boundaries for `FedRAMP Moderate/High`, `CJIS`, `HIPAA` BAA coverage, US regional data residency `us-east4`, Cloud Audit Logs Data Access retention).

## Step 3: Deliverable Format
1. **Severity Summary Table:** `ID | Severity (Critical / High / Medium / Low) | CWE / Control | File:Line | Issue | Remediation Status`
2. **Drop-In Code / Config Patches:** Provide exact, ready-to-apply diffs for every finding—and offer to apply and verify them immediately!
