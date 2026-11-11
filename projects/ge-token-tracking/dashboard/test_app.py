"""
Automated Unit & Security Tests for Gemini Enterprise Token Consumption & WIF Usage Dashboard.
"""

import pytest
from app import app


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def test_security_headers_and_csp_nonce_present(client):
    """Verifies mandatory HTTP security headers and per-request CSP nonce on all responses."""
    res = client.get("/")
    assert res.status_code == 200
    assert res.headers.get("X-Content-Type-Options") == "nosniff"
    assert res.headers.get("X-Frame-Options") == "DENY"
    assert "strict-origin-when-cross-origin" in res.headers.get("Referrer-Policy", "")
    csp = res.headers.get("Content-Security-Policy", "")
    assert "script-src 'self' 'nonce-" in csp
    assert "unsafe-inline" not in csp
    html_body = res.get_data(as_text=True)
    assert "innerHTML" not in html_body


def test_engines_list_endpoint(client):
    """Verifies /api/engines returns available GE instances and default_engine."""
    res = client.get("/api/engines")
    assert res.status_code == 200
    data = res.get_json()
    assert "default_engine" in data
    assert "engines" in data
    engine_ids = [e["id"] for e in data["engines"]]
    assert "ALL" in engine_ids
    assert "agentspace-adk_1749611082035" in engine_ids


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
    assert "user_principal" in first_principal
    assert "total_tokens" in first_principal
    assert "input_tokens" in first_principal
    assert "output_tokens" in first_principal
    assert "avg_tokens_per_call" in first_principal

    res_scoped = client.get("/api/metrics?engine_id=agentspace-adk_1749611082035")
    assert res_scoped.status_code == 200
    data_scoped = res_scoped.get_json()
    assert data_scoped["engine_id"] == "agentspace-adk_1749611082035"
    assert data_scoped["kpis"]["active_engines"] == 1


def test_csv_export_endpoint(client):
    """Verifies /api/export-csv returns a downloadable CSV with token columns."""
    res = client.get("/api/export-csv?engine_id=ALL")
    assert res.status_code == 200
    assert "text/csv" in res.headers.get("Content-Type", "")
    csv_text = res.get_data(as_text=True)
    assert "user_principal,idp_type,principal_display" in csv_text
    assert "input_tokens,output_tokens,total_tokens" in csv_text


def test_standalone_html_export_with_engine_filter(client):
    """Verifies standalone HTML export works and honors engine_id scope."""
    res = client.get("/api/export-html?engine_id=agentspace-adk_1749611082035")
    assert res.status_code == 200
    html_text = res.get_data(as_text=True)
    assert "<!DOCTYPE html>" in html_text
    assert "Instance: agentspace-adk_1749611082035" in html_text
    assert "Token Usage by Workforce Identity (WIF) Principal" in html_text
