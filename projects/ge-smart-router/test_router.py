import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app, follow_redirects=False)

CID_GENERAL = "instance-general-hub"
CID_RESTRICTED = "instance-restricted-hub"

URL_GENERAL = "https://vertexaisearch.cloud.google.com/home/cid/YOUR_INSTANCE_1_CID?hl=en_US"
URL_RESTRICTED = "https://vertexaisearch.cloud.google.com/home/cid/YOUR_INSTANCE_2_CID?hl=en_US"

def test_healthz():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

def test_unauthenticated_access():
    response = client.get("/")
    assert response.status_code == 401
    assert "Sign in" in response.text

def test_general_user_root_redirect():
    """
    user@example.com only has access to General Hub.
    Navigating to root / must 302 redirect directly to General Hub.
    """
    headers = {"X-Goog-Authenticated-User-Email": "accounts.google.com:user@example.com"}
    response = client.get("/", headers=headers)
    assert response.status_code == 302
    assert response.headers["location"] == URL_GENERAL

def test_general_user_direct_instance_allowed():
    headers = {"X-Goog-Authenticated-User-Email": "accounts.google.com:user@example.com"}
    response = client.get(f"/app/{CID_GENERAL}", headers=headers)
    assert response.status_code == 302
    assert response.headers["location"] == URL_GENERAL

def test_general_user_direct_restricted_blocked():
    """
    user@example.com is explicitly blocked from Restricted Hub.
    Navigating to /app/{CID_RESTRICTED} must return 403 Forbidden.
    """
    headers = {"X-Goog-Authenticated-User-Email": "accounts.google.com:user@example.com"}
    response = client.get(f"/app/{CID_RESTRICTED}", headers=headers)
    assert response.status_code == 403
    assert "Access Denied" in response.text
    assert CID_RESTRICTED in response.text

def test_exec_user_restricted_allowed():
    headers = {"X-Goog-Authenticated-User-Email": "accounts.google.com:exec-admin@example.com"}
    response = client.get(f"/app/{CID_RESTRICTED}", headers=headers)
    assert response.status_code == 302
    assert response.headers["location"] == URL_RESTRICTED

def test_unauthorized_user_blocked():
    headers = {"X-Goog-Authenticated-User-Email": "accounts.google.com:contractor@otherdomain.com"}
    response = client.get("/", headers=headers)
    assert response.status_code == 403

def test_browser_login_session_cookie():
    response = client.get("/login?email=user@example.com")
    assert response.status_code == 302
    assert "ge_user_email" in response.headers.get("set-cookie", "")

    cookie = response.headers.get("set-cookie").split(";")[0]
    res_root = client.get("/", headers={"cookie": cookie})
    assert res_root.status_code == 302
    assert res_root.headers["location"] == URL_GENERAL
