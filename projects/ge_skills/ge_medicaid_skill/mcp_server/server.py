# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""
Gemini Enterprise BYO MCP Server for Medicaid Fraud BigQuery Dataset
Connects to: ai-hub-459714.frauddector (syntheticdatafraud, v_credential_recycling, v_address_clustering, v_pregnant_members)
Exposes the 6 tools required by the `medicaid-fraud-auditor` Skill with deterministic PII sanitization.
"""

import hashlib
import json
import logging
import os
from typing import Any, Dict, List
from urllib.parse import urlencode

from flask import Flask, Response, jsonify, redirect, request
from google.cloud import bigquery

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("medicaid-fraud-bq-mcp")

app = Flask(__name__)

PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "ai-hub-459714")
DATASET_ID = os.environ.get("BQ_DATASET_ID", "frauddector")
TABLE_PREFIX = f"{PROJECT_ID}.{DATASET_ID}"

MAX_ROW_LIMIT = 50
MAX_BYTES_BILLED = 100 * 1024 * 1024  # 100 MB safety cap

_bq_client: bigquery.Client | None = None


def get_bq_client() -> bigquery.Client:
    global _bq_client
    if _bq_client is None:
        _bq_client = bigquery.Client(project=PROJECT_ID)
    return _bq_client


# ============================================================================
# Deterministic PII Redaction & Sanitization Helpers (Skill Section 5)
# ============================================================================
def mask_password(val: Any) -> str:
    """Masks plaintext passwords into deterministic partial SHA-256 hash (hash:a1b2c3d4)."""
    if val is None or str(val).strip() == "":
        return "hash:none"
    digest = hashlib.sha256(str(val).strip().encode("utf-8")).hexdigest()[:8]
    return f"hash:{digest}"


def mask_username(val: Any) -> str:
    if val is None:
        return "N/A"
    s = str(val).strip()
    if len(s) <= 3:
        return s[0] + "***" if s else "N/A"
    return f"{s[0]}***{s[-2:]}"


def mask_email(val: Any) -> str:
    if val is None or "@" not in str(val):
        return "N/A"
    s = str(val).strip()
    local, domain = s.split("@", 1)
    if len(local) <= 2:
        return f"{local[0]}***@{domain}"
    return f"{local[0]}***{local[-1]}@{domain}"


def mask_birth_year(val: Any) -> str:
    if val is None:
        return "UNKNOWN"
    return str(val).strip()[:4]


def sanitize_record(row: Dict[str, Any]) -> Dict[str, Any]:
    """Sanitizes a BigQuery row dictionary to remove raw PII and SQL metadata."""
    clean: Dict[str, Any] = {}
    for k, v in row.items():
        ku = k.upper()
        if ku == "PASSWORD":
            clean["PASSWORD_HASH"] = mask_password(v)
        elif ku == "USERNAME":
            clean["USERNAME_MASKED"] = mask_username(v)
        elif ku == "EMAIL_ADDRESS":
            clean["EMAIL_MASKED"] = mask_email(v)
        elif ku == "DTE_BIRTH":
            clean["BIRTH_YEAR"] = mask_birth_year(v)
        elif ku in ("SSN", "SOCIAL_SECURITY_NUMBER"):
            s = str(v) if v else ""
            clean["SSN_MASKED"] = f"XXX-XX-{s[-4:]}" if len(s) >= 4 else "REDACTED"
        elif ku == "STRING_FIELD_16":
            continue
        else:
            clean[k] = v
    return clean


def execute_sanitized_query(sql: str, params: List[Any] | None = None, limit: int = 25) -> List[Dict[str, Any]]:
    client = get_bq_client()
    job_config = bigquery.QueryJobConfig(maximum_bytes_billed=MAX_BYTES_BILLED)
    if params:
        job_config.query_parameters = params
    safe_limit = min(max(1, int(limit)), MAX_ROW_LIMIT)
    query_job = client.query(sql, job_config=job_config)
    rows = []
    for idx, row in enumerate(query_job):
        if idx >= safe_limit:
            break
        rows.append(sanitize_record(dict(row)))
    return rows


# ============================================================================
# Tool Implementations (Mapped to the 5 Core Rules + Secondary Verification)
# ============================================================================
def tool_audit_credential_recycling(limit: int = 25) -> Dict[str, Any]:
    """Rule 1: Queries existing view `v_credential_recycling` in BigQuery."""
    sql = f"""
    SELECT *
    FROM `{TABLE_PREFIX}.v_credential_recycling`
    LIMIT @limit
    """
    params = [bigquery.ScalarQueryParameter("limit", "INT64", min(int(limit), MAX_ROW_LIMIT))]
    records = execute_sanitized_query(sql, params, limit=limit)
    return {
        "rule": "Rule 1: Credential Recycling",
        "risk_tier": "CRITICAL",
        "record_count": len(records),
        "records": records,
    }


def tool_audit_address_clustering(limit: int = 25) -> Dict[str, Any]:
    """Rule 2: Queries existing view `v_address_clustering` and computes surname diversity for false-positive filtering."""
    sql = f"""
    WITH cluster_stats AS (
        SELECT
            ADR_STREET_1,
            COUNT(DISTINCT NUM_CASE) AS distinct_case_count,
            COUNT(DISTINCT LOWER(TRIM(NAM_LAST))) AS distinct_surname_count,
            COUNT(DISTINCT PASSWORD) AS distinct_password_count
        FROM `{TABLE_PREFIX}.syntheticdatafraud`
        WHERE ADR_STREET_1 IS NOT NULL
        GROUP BY ADR_STREET_1
    )
    SELECT
        v.*,
        s.distinct_case_count,
        s.distinct_surname_count,
        CASE
            WHEN s.distinct_surname_count = 1 AND s.distinct_password_count = s.distinct_case_count
            THEN TRUE
            ELSE FALSE
        END AS single_household_false_positive_candidate
    FROM `{TABLE_PREFIX}.v_address_clustering` v
    LEFT JOIN cluster_stats s ON v.ADR_STREET_1 = s.ADR_STREET_1
    ORDER BY s.distinct_case_count DESC, v.ADR_STREET_1
    LIMIT @limit
    """
    params = [bigquery.ScalarQueryParameter("limit", "INT64", min(int(limit), MAX_ROW_LIMIT))]
    records = execute_sanitized_query(sql, params, limit=limit)
    return {
        "rule": "Rule 2: Address Clustering",
        "risk_tier": "CRITICAL (>=4 cases) / HIGH (2-3 cases)",
        "record_count": len(records),
        "records": records,
    }


def tool_audit_identity_mismatches(limit: int = 25) -> Dict[str, Any]:
    """Rule 3: Queries `syntheticdatafraud` for applicant names diverging from username and email prefix."""
    sql = f"""
    SELECT
        NUM_CASE,
        ID_MEDICAID,
        NAM_FIRST,
        NAM_LAST,
        USERNAME,
        EMAIL_ADDRESS,
        PASSWORD,
        DTE_BIRTH,
        ADR_STREET_1,
        ADR_CITY,
        ADR_ZIP,
        'Applicant name diverges from username and email handle' AS violation_detail
    FROM `{TABLE_PREFIX}.syntheticdatafraud`
    WHERE NAM_FIRST IS NOT NULL
      AND USERNAME IS NOT NULL
      AND STRPOS(LOWER(USERNAME), LOWER(SUBSTR(NAM_FIRST, 1, 3))) = 0
      AND STRPOS(LOWER(EMAIL_ADDRESS), LOWER(SUBSTR(NAM_FIRST, 1, 3))) = 0
      AND STRPOS(LOWER(USERNAME), LOWER(SUBSTR(NAM_LAST, 1, 3))) = 0
    LIMIT @limit
    """
    params = [bigquery.ScalarQueryParameter("limit", "INT64", min(int(limit), MAX_ROW_LIMIT))]
    records = execute_sanitized_query(sql, params, limit=limit)
    return {
        "rule": "Rule 3: Identity Mismatches",
        "risk_tier": "MEDIUM",
        "record_count": len(records),
        "records": records,
    }


def tool_audit_sequential_clusters(min_batch_size: int = 3, limit: int = 25) -> Dict[str, Any]:
    """Rule 4: Queries `syntheticdatafraud` for same-day logon batches (`DTE_LAST_LOGON`)."""
    sql = f"""
    WITH logon_batches AS (
        SELECT DTE_LAST_LOGON, COUNT(DISTINCT NUM_CASE) AS batch_case_count
        FROM `{TABLE_PREFIX}.syntheticdatafraud`
        WHERE DTE_LAST_LOGON IS NOT NULL
        GROUP BY DTE_LAST_LOGON
        HAVING COUNT(DISTINCT NUM_CASE) >= @min_batch
    )
    SELECT
        t.NUM_CASE,
        t.ID_MEDICAID,
        t.NAM_FIRST,
        t.NAM_LAST,
        t.USERNAME,
        t.PASSWORD,
        t.DTE_LAST_LOGON,
        t.ADR_STREET_1,
        b.batch_case_count,
        CONCAT('Same-day batch logon across ', b.batch_case_count, ' distinct cases') AS violation_detail
    FROM `{TABLE_PREFIX}.syntheticdatafraud` t
    INNER JOIN logon_batches b ON t.DTE_LAST_LOGON = b.DTE_LAST_LOGON
    ORDER BY b.batch_case_count DESC, t.DTE_LAST_LOGON DESC
    LIMIT @limit
    """
    params = [
        bigquery.ScalarQueryParameter("min_batch", "INT64", max(2, int(min_batch_size))),
        bigquery.ScalarQueryParameter("limit", "INT64", min(int(limit), MAX_ROW_LIMIT)),
    ]
    records = execute_sanitized_query(sql, params, limit=limit)
    return {
        "rule": "Rule 4: Sequential Clusters",
        "risk_tier": "MEDIUM",
        "record_count": len(records),
        "records": records,
    }


def tool_audit_pregnant_members(limit: int = 25) -> Dict[str, Any]:
    """Rule 5: Queries existing view `v_pregnant_members` in BigQuery."""
    sql = f"""
    SELECT *
    FROM `{TABLE_PREFIX}.v_pregnant_members`
    LIMIT @limit
    """
    params = [bigquery.ScalarQueryParameter("limit", "INT64", min(int(limit), MAX_ROW_LIMIT))]
    records = execute_sanitized_query(sql, params, limit=limit)
    return {
        "rule": "Rule 5: Pregnant Member Anomalies (CNF)",
        "risk_tier": "HIGH",
        "record_count": len(records),
        "records": records,
    }


def tool_verify_case_records(case_numbers: List[str]) -> Dict[str, Any]:
    """Secondary Collision Verification & False-Positive Check for specific NUM_CASE identifiers."""
    if not case_numbers:
        return {"error": "Please provide at least one case number in case_numbers list."}
    clean_cases = [str(c).strip() for c in case_numbers[:20] if str(c).strip()]
    sql = f"""
    WITH target_cases AS (
        SELECT *
        FROM `{TABLE_PREFIX}.syntheticdatafraud`
        WHERE NUM_CASE IN UNNEST(@cases)
    ),
    addr_collisions AS (
        SELECT
            ADR_STREET_1,
            COUNT(DISTINCT NUM_CASE) AS cases_at_address,
            COUNT(DISTINCT LOWER(TRIM(NAM_LAST))) AS distinct_surnames_at_address,
            STRING_AGG(DISTINCT NUM_CASE, ', ' LIMIT 10) AS sibling_address_cases
        FROM `{TABLE_PREFIX}.syntheticdatafraud`
        WHERE ADR_STREET_1 IN (SELECT ADR_STREET_1 FROM target_cases WHERE ADR_STREET_1 IS NOT NULL)
        GROUP BY ADR_STREET_1
    ),
    pwd_collisions AS (
        SELECT
            PASSWORD,
            COUNT(DISTINCT NUM_CASE) AS cases_sharing_password,
            STRING_AGG(DISTINCT NUM_CASE, ', ' LIMIT 10) AS sibling_password_cases
        FROM `{TABLE_PREFIX}.syntheticdatafraud`
        WHERE PASSWORD IN (SELECT PASSWORD FROM target_cases WHERE PASSWORD IS NOT NULL)
        GROUP BY PASSWORD
    ),
    user_collisions AS (
        SELECT
            USERNAME,
            COUNT(DISTINCT NUM_CASE) AS cases_sharing_username,
            STRING_AGG(DISTINCT NUM_CASE, ', ' LIMIT 10) AS sibling_username_cases
        FROM `{TABLE_PREFIX}.syntheticdatafraud`
        WHERE USERNAME IN (SELECT USERNAME FROM target_cases WHERE USERNAME IS NOT NULL)
        GROUP BY USERNAME
    )
    SELECT
        t.*,
        COALESCE(ac.cases_at_address, 1) AS shared_address_case_count,
        COALESCE(ac.distinct_surnames_at_address, 1) AS distinct_surnames_at_address,
        ac.sibling_address_cases,
        COALESCE(pc.cases_sharing_password, 1) AS shared_password_case_count,
        pc.sibling_password_cases,
        COALESCE(uc.cases_sharing_username, 1) AS shared_username_case_count,
        uc.sibling_username_cases,
        CASE
            WHEN COALESCE(ac.cases_at_address, 1) >= 2
                 AND COALESCE(ac.distinct_surnames_at_address, 1) = 1
                 AND COALESCE(pc.cases_sharing_password, 1) = 1
                 AND COALESCE(uc.cases_sharing_username, 1) = 1
            THEN TRUE
            ELSE FALSE
        END AS is_legitimate_single_household_family
    FROM target_cases t
    LEFT JOIN addr_collisions ac ON t.ADR_STREET_1 = ac.ADR_STREET_1
    LEFT JOIN pwd_collisions pc ON t.PASSWORD = pc.PASSWORD
    LEFT JOIN user_collisions uc ON t.USERNAME = uc.USERNAME
    """
    params = [bigquery.ArrayQueryParameter("cases", "STRING", clean_cases)]
    records = execute_sanitized_query(sql, params, limit=25)
    return {
        "verified_case_count": len(records),
        "cases": records,
    }


# ============================================================================
# MCP Tool Definitions Registry
# ============================================================================
MCP_TOOLS = [
    {
        "name": "audit_credential_recycling",
        "description": "Rule 1: Queries BigQuery view v_credential_recycling to detect shared usernames or password hashes across distinct Medicaid case numbers (COUNT(DISTINCT NUM_CASE) > 1). Returns sanitized records with deterministic SHA-256 password hashes.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Maximum number of records to return (default 25, max 50).", "default": 25}
            },
        },
    },
    {
        "name": "audit_address_clustering",
        "description": "Rule 2: Queries BigQuery view v_address_clustering to identify physical street addresses shared across multiple distinct Medicaid cases, enriched with surname diversity counts to separate legitimate family households from fraud rings.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Maximum number of records to return (default 25, max 50).", "default": 25}
            },
        },
    },
    {
        "name": "audit_identity_mismatches",
        "description": "Rule 3: Audits Medicaid enrollment records where the applicant first/last name completely diverges from the account username and email handle.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Maximum number of records to return (default 25, max 50).", "default": 25}
            },
        },
    },
    {
        "name": "audit_sequential_clusters",
        "description": "Rule 4: Identifies same-day logon batches (DTE_LAST_LOGON) shared across multiple distinct Medicaid case numbers.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "min_batch_size": {"type": "integer", "description": "Minimum distinct cases sharing the same logon date (default 3).", "default": 3},
                "limit": {"type": "integer", "description": "Maximum number of records to return (default 25, max 50).", "default": 25},
            },
        },
    },
    {
        "name": "audit_pregnant_members",
        "description": "Rule 5: Queries BigQuery view v_pregnant_members to detect duplicate CNF maternity enrollment records sharing the same first name and 4-digit birth year across distinct case numbers.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Maximum number of records to return (default 25, max 50).", "default": 25}
            },
        },
    },
    {
        "name": "verify_case_records",
        "description": "Secondary Collision Verification Protocol: Given a list of Medicaid case numbers (NUM_CASE), calculates exact cross-case collision counts for shared physical address, shared password hash, and shared username, and flags whether address collisions represent a legitimate single-household family.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "case_numbers": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of NUM_CASE identifiers to verify (e.g., ['YA7FC2H', '5GW4DRP']).",
                }
            },
            "required": ["case_numbers"],
        },
    },
]


# ============================================================================
# HTTP / JSON-RPC 2.0 Streamable MCP Endpoint (/mcp and /sse)
# ============================================================================
@app.after_request
def add_security_headers(response: Response) -> Response:
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


@app.route("/", methods=["GET"])
def health_check() -> Response:
    return jsonify({
        "status": "online",
        "service": "Gemini Enterprise Medicaid Fraud BigQuery BYO MCP Server",
        "bigquery_dataset": TABLE_PREFIX,
        "mcp_endpoint": "/mcp",
        "oauth_endpoints": {"authorization_url": "/auth", "token_url": "/token"},
        "tools_registered": [t["name"] for t in MCP_TOOLS],
    })


@app.route("/auth", methods=["GET"])
def oauth_authorize() -> Response:
    """OAuth 2.0 Authorization Endpoint required by Gemini Enterprise BYO MCP Connector Registration UI."""
    redirect_uri = request.args.get("redirect_uri", "")
    state = request.args.get("state", "")
    if redirect_uri:
        params = urlencode({"code": "ge_medicaid_mcp_auth_code", "state": state})
        return redirect(f"{redirect_uri}?{params}", code=302)
    return jsonify({"status": "oauth_ready", "message": "Provide redirect_uri to authorize Gemini Enterprise connector."})


@app.route("/token", methods=["POST"])
def oauth_token() -> Response:
    """OAuth 2.0 Token Endpoint required by Gemini Enterprise BYO MCP Connector Registration UI."""
    return jsonify({
        "access_token": "ge_medicaid_mcp_access_token",
        "token_type": "Bearer",
        "expires_in": 3600,
        "refresh_token": "ge_medicaid_mcp_refresh_token",
    })


@app.route("/mcp", methods=["POST"])
@app.route("/sse", methods=["POST"])
def handle_mcp_jsonrpc() -> Response:
    """Streamable HTTP JSON-RPC 2.0 handler for Gemini Enterprise MCP client."""
    payload = request.get_json(silent=True) or {}
    rpc_id = payload.get("id")
    method = payload.get("method", "")
    params = payload.get("params", {})

    logger.info(f"MCP Request method={method} id={rpc_id}")

    if method == "initialize":
        return jsonify({
            "jsonrpc": "2.0",
            "id": rpc_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {
                    "name": "medicaid-fraud-bq-mcp-server",
                    "version": "1.0.0",
                },
            },
        })

    if method == "notifications/initialized":
        return Response(status=204)

    if method == "tools/list":
        return jsonify({
            "jsonrpc": "2.0",
            "id": rpc_id,
            "result": {"tools": MCP_TOOLS},
        })

    if method == "tools/call":
        tool_name = params.get("name")
        args = params.get("arguments", {}) or {}
        try:
            if tool_name == "audit_credential_recycling":
                res = tool_audit_credential_recycling(limit=args.get("limit", 25))
            elif tool_name == "audit_address_clustering":
                res = tool_audit_address_clustering(limit=args.get("limit", 25))
            elif tool_name == "audit_identity_mismatches":
                res = tool_audit_identity_mismatches(limit=args.get("limit", 25))
            elif tool_name == "audit_sequential_clusters":
                res = tool_audit_sequential_clusters(
                    min_batch_size=args.get("min_batch_size", 3),
                    limit=args.get("limit", 25),
                )
            elif tool_name == "audit_pregnant_members":
                res = tool_audit_pregnant_members(limit=args.get("limit", 25))
            elif tool_name == "verify_case_records":
                res = tool_verify_case_records(case_numbers=args.get("case_numbers", []))
            else:
                return jsonify({
                    "jsonrpc": "2.0",
                    "id": rpc_id,
                    "error": {"code": -32601, "message": f"Unknown tool: {tool_name}"},
                })

            return jsonify({
                "jsonrpc": "2.0",
                "id": rpc_id,
                "result": {
                    "content": [{"type": "text", "text": json.dumps(res, indent=2)}],
                    "isError": False,
                },
            })
        except Exception as e:
            logger.exception("Error executing BigQuery MCP tool")
            return jsonify({
                "jsonrpc": "2.0",
                "id": rpc_id,
                "result": {
                    "content": [{"type": "text", "text": f"Error executing BigQuery query: {str(e)}"}],
                    "isError": True,
                },
            })

    return jsonify({
        "jsonrpc": "2.0",
        "id": rpc_id,
        "error": {"code": -32601, "message": f"Method not supported: {method}"},
    })


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8080"))
    app.run(host=host, port=port)
