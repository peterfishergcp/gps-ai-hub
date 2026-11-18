try:
    import pytest
except ImportError:
    pytest = None
import os
os.environ["DEV_MODE"] = "true"
os.environ["REQUIRE_REAL_AUTH"] = "false"
os.environ["REQUIRE_IAP_JWT"] = "false"

import main
main.DEV_MODE = True
main.REQUIRE_REAL_AUTH = False
main.REQUIRE_IAP_JWT = False

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

def test_production_login_bypass_prevented():
    """
    In production mode, arbitrary /login calls redirect to official OAuth /auth/login,
    preventing user impersonation.
    """
    import main
    orig_dev = main.DEV_MODE
    orig_real = main.REQUIRE_REAL_AUTH
    main.DEV_MODE = False
    main.REQUIRE_REAL_AUTH = True
    try:
        response = client.get("/login?email=admin@example.com")
        assert response.status_code == 302
        assert response.headers["location"] == "/auth/login"
    finally:
        main.DEV_MODE = orig_dev
        main.REQUIRE_REAL_AUTH = orig_real

def test_browser_login_session_cookie():
    import main
    orig_dev = main.DEV_MODE
    orig_real = main.REQUIRE_REAL_AUTH
    main.DEV_MODE = True
    main.REQUIRE_REAL_AUTH = False
    try:
        response = client.get("/login?email=user@example.com")
        assert response.status_code == 302
        assert "ge_user_email" in response.headers.get("set-cookie", "")

        cookie = response.headers.get("set-cookie").split(";")[0]
        res_root = client.get("/", headers={"cookie": cookie})
        assert res_root.status_code == 302
        assert res_root.headers["location"] == URL_GENERAL
    finally:
        main.DEV_MODE = orig_dev
        main.REQUIRE_REAL_AUTH = orig_real

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
    /switch clears cookie and renders persona selector in DEV_MODE.
    """
    import main
    orig_dev = main.DEV_MODE
    main.DEV_MODE = True
    try:
        response = client.get("/switch")
        assert response.status_code == 200
        assert "Gemini Enterprise Smart Router" in response.text
        assert "user@example.com" in response.text
        assert "admin@example.com" in response.text
    finally:
        main.DEV_MODE = orig_dev

def test_altostrat_demo_user_single_instance_redirect():
    """
    user@example.com only has access to General Hub.
    Navigating to / must 302 redirect directly to General Hub.
    """
    headers = {"X-Goog-Authenticated-User-Email": "accounts.google.com:user@example.com"}
    response = client.get("/", headers=headers)
    assert response.status_code == 302
    assert response.headers["location"] == URL_GENERAL

def test_altostrat_admin_user_multi_instance_launchpad():
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

def test_direct_launchpad_endpoint():
    """
    /launchpad directly renders the launchpad portal for preview/demo when authenticated.
    """
    headers = {"X-Goog-Authenticated-User-Email": "accounts.google.com:admin@example.com"}
    response = client.get("/launchpad", headers=headers)
    assert response.status_code == 200
    assert "Gemini Enterprise Portal" in response.text

def test_unauthenticated_launchpad_blocked():
    """
    Unauthenticated calls to /launchpad in production mode return 302 redirecting to auth.
    """
    import main
    orig_dev = main.DEV_MODE
    orig_real = main.REQUIRE_REAL_AUTH
    main.DEV_MODE = False
    main.REQUIRE_REAL_AUTH = True
    try:
        response = client.get("/launchpad")
        assert response.status_code in (302, 401)
    finally:
        main.DEV_MODE = orig_dev
        main.REQUIRE_REAL_AUTH = orig_real

def test_open_redirect_prevented():
    """
    Supplying an external URL to target parameter is blocked and defaults to /.
    """
    import main
    orig_dev = main.DEV_MODE
    orig_real = main.REQUIRE_REAL_AUTH
    main.DEV_MODE = True
    main.REQUIRE_REAL_AUTH = False
    try:
        response = client.get("/login?email=user@example.com&target=https://evil.attacker.com")
        assert response.status_code == 302
        assert response.headers["location"] == "/"
    finally:
        main.DEV_MODE = orig_dev
        main.REQUIRE_REAL_AUTH = orig_real

def test_group_based_access_allowed_in_dev():
    """
    Tests that group membership headers are honored when DEV_MODE=True.
    """
    import main
    orig_dev = main.DEV_MODE
    main.DEV_MODE = True
    try:
        headers = {
            "X-Goog-Authenticated-User-Email": "accounts.google.com:member@externalpartner.com",
            "X-Goog-Authenticated-User-Groups": "general-staff@example.com"
        }
        response = client.get(f"/app/{CID_GENERAL}", headers=headers)
        assert response.status_code == 302
        assert response.headers["location"] == URL_GENERAL
    finally:
        main.DEV_MODE = orig_dev

def test_group_based_access_untrusted_in_production():
    """
    Tests that unverified client group headers are rejected in production mode.
    """
    import main
    orig_dev = main.DEV_MODE
    main.DEV_MODE = False
    try:
        headers = {
            "X-Goog-Authenticated-User-Email": "accounts.google.com:member@externalpartner.com",
            "X-Goog-Authenticated-User-Groups": "general-staff@example.com"
        }
        response = client.get(f"/app/{CID_GENERAL}", headers=headers)
        assert response.status_code == 403
    finally:
        main.DEV_MODE = orig_dev

def test_oauth_callback_xss_escaped():
    """
    Reflected XSS in OAuth callback error handler must be escaped.
    """
    response = client.get("/auth/callback?error=<script>alert('xss')</script>")
    assert response.status_code == 400
    assert "<script>" not in response.text
    assert "&lt;script&gt;" in response.text

def test_auth_login_redirect():
    """
    When GOOGLE_CLIENT_ID is set, /auth/login initiates official Google OAuth.
    """
    import main
    orig_client_id = main.GOOGLE_CLIENT_ID
    main.GOOGLE_CLIENT_ID = "mock-client-id.apps.googleusercontent.com"
    try:
        response = client.get("/auth/login")
        assert response.status_code == 302
        assert "accounts.google.com/o/oauth2/v2/auth" in response.headers["location"]
        assert "client_id=mock-client-id.apps.googleusercontent.com" in response.headers["location"]
        assert "prompt=select_account" in response.headers["location"]
    finally:
        main.GOOGLE_CLIENT_ID = orig_client_id

def test_encoded_open_redirect_prevented():
    """
    URL encoded external URLs in target must be rejected and defaulted to /.
    """
    import main
    orig_dev = main.DEV_MODE
    orig_real = main.REQUIRE_REAL_AUTH
    main.DEV_MODE = True
    main.REQUIRE_REAL_AUTH = False
    try:
        # %2F%2Fevil.com
        response = client.get("/login?email=user@example.com&target=%2F%2Fevil.com")
        assert response.status_code == 302
        assert response.headers["location"] == "/"

        # %5C%5Cevil.com (backslashes)
        response2 = client.get("/login?email=user@example.com&target=%5C%5Cevil.com")
        assert response2.status_code == 302
        assert response2.headers["location"] == "/"
    finally:
        main.DEV_MODE = orig_dev
        main.REQUIRE_REAL_AUTH = orig_real

def test_iap_audience_enforcement_in_production():
    """
    In production mode, get_iap_jwt_claims rejects verification if IAP_AUDIENCE is unset.
    """
    import main
    orig_dev = main.DEV_MODE
    orig_aud = main.IAP_AUDIENCE
    main.DEV_MODE = False
    main.IAP_AUDIENCE = ""
    try:
        claims = main.get_iap_jwt_claims("dummy-jwt-token")
        assert claims is None
    finally:
        main.DEV_MODE = orig_dev
        main.IAP_AUDIENCE = orig_aud

if __name__ == "__main__":
    tests = [v for k, v in list(globals().items()) if k.startswith("test_") and callable(v)]
    print(f"Running {len(tests)} tests...")
    for test in tests:
        print(f" - {test.__name__}...", end=" ", flush=True)
        test()
        print("PASSED")
    print(f"\nAll {len(tests)} tests passed successfully!")

