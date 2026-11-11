#!/usr/bin/env bash
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0
# Syncs v2/shared/ modules into each standalone Cloud Run service directory so `gcloud run deploy --source .` remains self-contained.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cp "${SCRIPT_DIR}/shared/mcp_v2_extensions.js" "${SCRIPT_DIR}/claude_mcp_sonnet/mcp_v2_extensions.cjs"
for srv in customize_outlook_mcp sharepoint-mcp-server customize-sharepoint-mcp-server least-privilege-sharepoint-mcp-server sharepoint-mcp-server-purview-label sharepoint-mcp-server-purview-sdp; do
  cp "${SCRIPT_DIR}/shared/mcp_v2_extensions.js" "${SCRIPT_DIR}/${srv}/mcp_v2_extensions.js"
done

for sp in sharepoint-mcp-server customize-sharepoint-mcp-server least-privilege-sharepoint-mcp-server sharepoint-mcp-server-purview-label sharepoint-mcp-server-purview-sdp; do
  cp "${SCRIPT_DIR}/shared/sharepoint_v2_wrapper.js" "${SCRIPT_DIR}/${sp}/sharepoint_v2_wrapper.js"
  if [[ -f "${SCRIPT_DIR}/../ge_mcp/sharepoint-mcp-server/sharepoint_common.js" ]]; then
    cp "${SCRIPT_DIR}/../ge_mcp/sharepoint-mcp-server/sharepoint_common.js" "${SCRIPT_DIR}/shared/sharepoint_common.js"
  fi
  cp "${SCRIPT_DIR}/shared/sharepoint_common.js" "${SCRIPT_DIR}/${sp}/sharepoint_common.js"
done

echo "Synced shared v2.0 runtime modules across all 7 Cloud Run connectors."
