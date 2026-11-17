---
name: iam-secret-hygiene
description: Audits IAM policies, service accounts, repository files, and deployment manifests to eliminate primitive roles (roles/owner, roles/editor), default compute service accounts, service-account JSON keys, and inline env-var secrets—replacing them with Entra-synced Google Identity group bindings, least-privilege roles, and Secret Manager. Trigger on /iam-secret-hygiene, "audit our IAM roles", "clean up secrets", or "implement least privilege".
---

# Least-Privilege IAM & Secret Hygiene (`/iam-secret-hygiene`)

Adapted from `iam-helper-for-policy-management` in [Google Skills](https://github.com/google/skills/tree/main/skills) and tailored to West Virginia's **Azure / Entra ID -> Google Cloud Identity** group model.

## Step 1: Scan Repo & Configs for Secret / IAM Anti-Patterns
1. Check source files, `.env*`, `Dockerfile`, CI workflows, and `gcloud` scripts for:
   - Inline API keys, database URI passwords, Bearer tokens, or `private_key_id` JSON files.
   - Primitive IAM roles (`roles/owner`, `roles/editor`, `roles/viewer` at project root) or `allUsers` / `allAuthenticatedUsers` bindings on internal services.
   - Workloads running as the Default Compute Service Account (`PROJECT_NUMBER-compute@developer.gserviceaccount.com`) or App Engine default SA.
   - Individual `user:person@wv.gov` bindings instead of replicated Entra security groups (`group:team@wv.gov`).

## Step 2: Generate Least-Privilege Replacements
1. **Group-Based Human Access:** Map human access to Entra-replicated Google Identity groups (`group:...`) so lifecycle provisioning and offboarding in Microsoft Entra ID automatically govern GCP & Gemini Enterprise access.
2. **Workload Identity & Dedicated Service Accounts:** Output exact `gcloud iam service-accounts create` + resource-level `add-iam-policy-binding` commands (e.g. dataset-level `roles/bigquery.dataViewer` rather than project-wide `roles/bigquery.admin`).
3. **Secret Manager Migration:** Output `gcloud secrets create` + `--set-secrets` flags and update `.gitignore` / `.gcloudignore` immediately.
