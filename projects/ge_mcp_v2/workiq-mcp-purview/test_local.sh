#!/usr/bin/env bash
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

python3 -m py_compile *.py
python3 generate_rms_audit_app.py --verify
echo "v2/workiq-mcp-purview verification passed."
