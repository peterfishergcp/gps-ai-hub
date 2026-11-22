# Optional Agency IT Scale-Out: Shared Cloud Run Streamable HTTP GE Gateway

To keep State of West Virginia corporate Windows 11 laptops **100% free of local MCP subprocesses or system-`PATH` scripts**, West Virginia IT can deploy this stateless **Cloud Run Streamable HTTP MCP Gateway** once per agency Gemini Enterprise (`GE`) instance (`HTTPS 443` only) so 500+ staff connect without entering `GE_PROJECT_ID` or `GE_ENGINE_ID`:

## Security Architecture
- **100% Stateless End-User Bearer Passthrough (Zero Shared Service Account Access to User Data):** Every MCP `tools/call` requires an `Authorization: Bearer <USER_OAUTH_TOKEN>` header from the signed-in Google Identity user (synced with Azure/Entra ID) and forwards that exact user token to `discoveryengine.googleapis.com` (`StreamAssist` & `Search`). If no user Bearer token is supplied, the gateway returns `401 Unauthorized` with RFC 9728 `WWW-Authenticate` metadata so Antigravity initiates per-user OAuth.
- **Least-Privilege Service Account & Non-Root Container:** Runs as unprivileged `node` user (`UID 1000`) with zero Google Cloud IAM permissions needed on the Cloud Run service account itself.

## 1-Command Cloud Run Deploy (No Local Docker Needed)

```bash
# 1. Create a dedicated zero-privilege runtime service account once:
gcloud iam service-accounts create wv-ge-mcp-gateway-sa \
  --display-name="Stateless WV GE MCP Gateway SA" \
  --project="YOUR_PROJECT_ID"

# 2. Deploy directly from source via Cloud Build:
gcloud run deploy wv-ge-mcp-gateway \
  --source . \
  --region us-east4 \
  --project "YOUR_PROJECT_ID" \
  --service-account "wv-ge-mcp-gateway-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --set-env-vars "GE_PROJECT_ID=YOUR_PROJECT_ID,GE_LOCATION=global,GE_COLLECTION_ID=default_collection,GE_ENGINE_ID=YOUR_GE_ENGINE_ID"
```
