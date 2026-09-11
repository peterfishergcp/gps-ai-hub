try:
    import pytest
except ImportError:
    pytest = None
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

def test_admin_user_launchpad():
    """
    admin@example.com has access to both instances.
    Navigating to / must render the Enterprise Launchpad (HTTP 200).
    """
    headers = {"X-Goog-Authenticated-User-Email": "accounts.google.com:admin@example.com"}
    response = client.get("/", headers=headers)
    assert response.status_code == 200
    assert "Gemini Enterprise Portal" in response.text
    assert "Operations" in response.text
    assert "Restricted Executive" in response.text

def test_logout_endpoint():
    """
    /logout clears the ge_user_email cookie and redirects to root.
    """
    response = client.get("/logout")
    assert response.status_code == 302
    assert response.headers["location"] == "/"
    set_cookie = response.headers.get("set-cookie", "")
    assert "ge_user_email=\"\"" in set_cookie or "Max-Age=0" in set_cookie or "expires=" in set_cookie

def test_demo_switch_endpoint():
    """
    /switch clears cookie and renders persona selector.
    """
    response = client.get("/switch")
    assert response.status_code == 200
    assert "Gemini Enterprise Smart Router" in response.text
    assert "admin@example.com" in response.text

def test_direct_launchpad_endpoint():
    """
    /launchpad directly renders the launchpad portal for preview/demo.
    """
    response = client.get("/launchpad")
    assert response.status_code == 200
    assert "Gemini Enterprise Portal" in response.text

if __name__ == "__main__":
    tests = [v for k, v in list(globals().items()) if k.startswith("test_") and callable(v)]
    print(f"Running {len(tests)} tests...")
    for test in tests:
        print(f" - {test.__name__}...", end=" ", flush=True)
        test()
        print("PASSED")
    print(f"\nAll {len(tests)} tests passed successfully!")

