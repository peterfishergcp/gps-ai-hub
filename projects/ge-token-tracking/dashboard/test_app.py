"""
Automated Unit, Governance & Security Tests for Gemini Security, Governance & WIF Token Dashboard.
"""

import pytest
from app import _mask_principal, app


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def test_security_headers_and_csp_nonce_present(client):
    """Verifies mandatory HTTP security headers, Permissions-Policy, and per-request CSP nonce."""
    res = client.get("/")
    assert res.status_code == 200
    assert res.headers.get("X-Content-Type-Options") == "nosniff"
    assert res.headers.get("X-Frame-Options") == "DENY"
    assert "strict-origin-when-cross-origin" in res.headers.get("Referrer-Policy", "")
    assert "camera=()" in res.headers.get("Permissions-Policy", "")
    csp = res.headers.get("Content-Security-Policy", "")
    assert "script-src 'self' 'nonce-" in csp
    assert "object-src 'none'" in csp
    assert "unsafe-inline" not in csp
    html_body = res.get_data(as_text=True)
    assert "innerHTML" not in html_body
    assert "outerHTML" not in html_body
    assert "insertAdjacentHTML" not in html_body


def test_health_endpoint_leaks_no_internal_metadata(client):
    """Verifies /health exposes strictly status, service, and version."""
    res = client.get("/health")
    assert res.status_code == 200
    body = res.get_json()
    assert set(body.keys()) == {"status", "service", "version"}
    assert body["status"] == "ok"


def test_engines_list_endpoint(client):
    """Verifies /api/engines returns available GE instances, no-store cache header, and default_engine."""
    res = client.get("/api/engines")
    assert res.status_code == 200
    assert "no-store" in res.headers.get("Cache-Control", "")
    data = res.get_json()
    assert "default_engine" in data
    assert "engines" in data
    engine_ids = [e["id"] for e in data["engines"]]
    assert "ALL" in engine_ids
    assert "gemini-student-prod" in engine_ids
    assert "gemini-us-enterprise-prod" in engine_ids


def test_governance_security_and_sdp_alerts_endpoint(client):
    """Verifies /api/governance surfaces Model Armor, Jailbreak, PII SDP blocks, and Policy Drift checks."""
    res = client.get("/api/governance?engine_id=ALL")
    assert res.status_code == 200
    assert "no-store" in res.headers.get("Cache-Control", "")
    data = res.get_json()
    assert data["engine_id"] == "ALL"
    assert "scorecards" in data
    assert "policy_controls" in data
    assert len(data["policy_controls"]) == 8
    assert "security_alerts" in data
    categories = {a["category"] for a in data["security_alerts"]}
    assert "SDP_PII_BLOCK" in categories
    assert "JAILBREAK_ATTEMPT" in categories
    # Ensure principals are masked (never full cleartext email addresses)
    for alert in data["security_alerts"]:
        assert "***" in alert["masked_principal"]
    assert "rollout_waves" in data
    assert len(data["rollout_waves"]) == 4
    assert "domain_adoption" in data
    assert "mcp_prewarm_audit" in data
    assert len(data["mcp_prewarm_audit"]) >= 1


def test_pii_principal_masking_helper():
    """Verifies _mask_principal masks emails and Workforce Identity subjects."""
    assert _mask_principal("craig.dougherty@example.edu") == "cra***@example.edu"
    masked_wif = _mask_principal(
        "principal://iam.googleapis.com/locations/global/workforcePools/campus-oidc/subject/4f32a44e99b1"
    )
    assert "***" in masked_wif
    assert "4f32a44e99b1" not in masked_wif


def test_overview_metrics_endpoint_and_filtering(client):
    """Verifies /api/metrics works for ALL and specific engine_id filtering."""
    res_all = client.get("/api/metrics?engine_id=ALL")
    assert res_all.status_code == 200
    data_all = res_all.get_json()
    assert data_all["engine_id"] == "ALL"
    assert "kpis" in data_all
    assert "tokens_by_model" in data_all
    assert "tokens_by_principal" in data_all
    assert "daily_tokens" in data_all
    assert len(data_all["tokens_by_principal"]) >= 1
    first_principal = data_all["tokens_by_principal"][0]
    assert "***" in first_principal["user_principal"]
    assert "total_tokens" in first_principal

    res_scoped = client.get("/api/metrics?engine_id=gemini-student-prod")
    assert res_scoped.status_code == 200
    data_scoped = res_scoped.get_json()
    assert data_scoped["engine_id"] == "gemini-student-prod"
    assert data_scoped["kpis"]["active_engines"] == 1


def test_csv_export_endpoint(client):
    """Verifies /api/export-csv returns a downloadable CSV with nosniff and token columns."""
    res = client.get("/api/export-csv?engine_id=ALL")
    assert res.status_code == 200
    assert "text/csv" in res.headers.get("Content-Type", "")
    assert res.headers.get("X-Content-Type-Options") == "nosniff"
    csv_text = res.get_data(as_text=True)
    assert "user_principal,idp_type,principal_display" in csv_text
    assert "input_tokens,output_tokens,total_tokens" in csv_text


def test_standalone_html_export_with_governance_and_engine_filter(client):
    """Verifies standalone HTML export includes Continuous Governance controls and honors engine_id."""
    res = client.get("/api/export-html?engine_id=gemini-student-prod")
    assert res.status_code == 200
    html_text = res.get_data(as_text=True)
    assert "<!DOCTYPE html>" in html_text
    assert "Instance: gemini-student-prod" in html_text
    assert "Continuous Governance &amp; Policy Adherence Controls" in html_text
    assert "Token Usage by Workforce Identity (WIF) Principal" in html_text
