import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import time
from typing import List, Optional
import urllib.parse
import urllib.request
import yaml

from fastapi import FastAPI, Request, HTTPException, status
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("ge-smart-router")

app = FastAPI(
    title="Gemini Enterprise Smart Group Router",
    description="Identity-aware routing dispatcher for multi-instance Gemini Enterprise deployments under a single DNS.",
    version="1.0.0"
)

templates = Jinja2Templates(directory=os.path.join(os.path.dirname(__file__), "templates"))

CONFIG_PATH = os.getenv("POLICY_CONFIG_PATH", os.path.join(os.path.dirname(__file__), "policy.yaml"))
DEV_MODE = os.getenv("DEV_MODE", "false").lower() in ("true", "1", "yes")
REQUIRE_REAL_AUTH = os.getenv("REQUIRE_REAL_AUTH", "false").lower() in ("true", "1", "yes")

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
SESSION_SECRET = os.getenv("SESSION_SECRET", "ge-smart-router-secure-key-2026").encode()

def sign_session_email(email: str) -> str:
    ts = str(int(time.time()))
    data = f"{email}:{ts}".encode()
    sig = hmac.new(SESSION_SECRET, data, hashlib.sha256).hexdigest()
    return f"{email}:{ts}:{sig}"

def verify_session_email(cookie_val: Optional[str], max_age: int = 86400) -> Optional[str]:
    if not cookie_val:
        return None
    parts = cookie_val.split(":")
    if len(parts) != 3:
        if DEV_MODE and "@" in cookie_val:
            return cookie_val.strip().lower()
        return None
    email, ts_str, sig = parts
    try:
        ts = int(ts_str)
    except ValueError:
        return None
    if time.time() - ts > max_age:
        return None
    expected_sig = hmac.new(SESSION_SECRET, f"{email}:{ts_str}".encode(), hashlib.sha256).hexdigest()
    if hmac.compare_digest(sig, expected_sig):
        return email.strip().lower()
    return None


class InstanceConfig(BaseModel):
    id: str
    name: str
    description: str
    target_url: str
    allowed_users: List[str] = []
    allowed_groups: List[str] = []
    allowed_domains: List[str] = []
    blocked_users: List[str] = []

def load_policy() -> List[InstanceConfig]:
    if not os.path.exists(CONFIG_PATH):
        logger.error(f"Policy configuration file not found at {CONFIG_PATH}")
        return []
    with open(CONFIG_PATH, "r") as f:
        data = yaml.safe_load(f)
    return [InstanceConfig(**item) for item in data.get("instances", [])]

def extract_user_email(request: Request) -> Optional[str]:
    """
    Extracts authenticated user identity with fallback priority:
    1. Cloud IAP header ('X-Goog-Authenticated-User-Email') when behind Cloud Load Balancer.
    2. Signed session cookie ('ge_user_email') from Google OAuth.
    3. Dev query parameters or headers when running in development mode.
    """
    # 1. Check Identity-Aware Proxy (IAP) header first
    iap_email_header = request.headers.get("X-Goog-Authenticated-User-Email")
    if iap_email_header:
        # IAP prefixes email with 'accounts.google.com:'
        return re.sub(r"^[^:]+:", "", iap_email_header).strip().lower()

    # 2. Check signed session cookie
    cookie_val = request.cookies.get("ge_user_email")
    verified_email = verify_session_email(cookie_val)
    if verified_email:
        return verified_email

    # 3. Check query parameters or dev headers (testing fallback)
    if not REQUIRE_REAL_AUTH and DEV_MODE:
        dev_email = (
            request.query_params.get("dev_user")
            or request.query_params.get("email")
            or request.headers.get("X-Dev-User-Email")
            or request.headers.get("X-Forwarded-User")
        )
        if dev_email:
            return dev_email.strip().lower()

    return None

def is_user_authorized_for_instance(email: str, instance: InstanceConfig) -> bool:
    email_clean = email.strip().lower()

    # Rule 1: Explicit blocklist check (Deny always wins)
    for blocked in instance.blocked_users:
        if blocked.strip().lower() == email_clean:
            logger.warning(f"User '{email}' explicitly blocked for instance '{instance.id}'")
            return False

    # Rule 2: Explicit user allowlist check
    for allowed in instance.allowed_users:
        if allowed.strip().lower() == email_clean:
            return True

    # Rule 3: Domain allowlist check
    domain = email_clean.split("@")[-1] if "@" in email_clean else ""
    for allowed_domain in instance.allowed_domains:
        if allowed_domain.strip().lower() == domain:
            return True

    return False

@app.get("/health", status_code=status.HTTP_200_OK)
@app.get("/healthz", status_code=status.HTTP_200_OK)
@app.get("/healthz/", status_code=status.HTTP_200_OK)
def health_check():
    """Health check endpoint for Cloud Run and Load Balancer health checks."""
    return {"status": "healthy", "service": "ge-smart-router"}

@app.get("/login")
def login(email: str = "user@example.com", target: str = "/"):
    """Session login helper for direct browser access."""
    if REQUIRE_REAL_AUTH:
        return RedirectResponse(url="/auth/login", status_code=status.HTTP_302_FOUND)
    email_clean = email.strip().lower()
    signed_val = sign_session_email(email_clean)
    response = RedirectResponse(url=target, status_code=status.HTTP_302_FOUND)
    response.set_cookie(key="ge_user_email", value=signed_val, max_age=86400, httponly=True, samesite="lax")
    return response

@app.get("/logout")
def logout():
    """Clears local session cookie."""
    response = RedirectResponse(url="/", status_code=status.HTTP_302_FOUND)
    response.delete_cookie(key="ge_user_email")
    return response

@app.get("/auth/login")
def auth_login(request: Request, target: str = "/"):
    """Initiates official Google Workspace OAuth 2.0 flow."""
    if not GOOGLE_CLIENT_ID:
        return templates.TemplateResponse(
            request=request,
            name="unauthorized.html",
            context={
                "message": "Google OAuth is not yet configured with client credentials. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET or use IAP.",
                "oauth_configured": False,
                "require_real_auth": REQUIRE_REAL_AUTH
            },
            status_code=status.HTTP_401_UNAUTHORIZED
        )

    state = secrets.token_urlsafe(16)
    forwarded_proto = request.headers.get("x-forwarded-proto", "https")
    forwarded_host = request.headers.get("x-forwarded-host", request.headers.get("host", ""))
    if forwarded_host:
        callback_url = f"{forwarded_proto}://{forwarded_host}/auth/callback"
    else:
        callback_url = str(request.base_url).rstrip("/") + "/auth/callback"

    auth_params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": callback_url,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "prompt": "select_account",
        "access_type": "online",
    }
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(auth_params)}"
    response = RedirectResponse(url=auth_url, status_code=status.HTTP_302_FOUND)
    response.set_cookie(key="oauth_state", value=state, max_age=600, httponly=True, samesite="lax")
    response.set_cookie(key="oauth_target", value=target, max_age=600, httponly=True, samesite="lax")
    return response

@app.get("/auth/callback")
def auth_callback(request: Request, code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    """Handles Google OAuth callback, verifies identity token with Google, and establishes secure session."""
    if error:
        logger.error(f"Google OAuth authorization error: {error}")
        return HTMLResponse(f"<h3>Google Authentication Error: {error}</h3><p><a href='/'>Return to Home</a></p>", status_code=400)

    saved_state = request.cookies.get("oauth_state")
    target = request.cookies.get("oauth_target") or "/"

    if not code or not state or state != saved_state:
        logger.error("OAuth state mismatch or missing code.")
        raise HTTPException(status_code=400, detail="Invalid OAuth state or missing code.")

    forwarded_proto = request.headers.get("x-forwarded-proto", "https")
    forwarded_host = request.headers.get("x-forwarded-host", request.headers.get("host", ""))
    if forwarded_host:
        callback_url = f"{forwarded_proto}://{forwarded_host}/auth/callback"
    else:
        callback_url = str(request.base_url).rstrip("/") + "/auth/callback"

    token_url = "https://oauth2.googleapis.com/token"
    token_data = urllib.parse.urlencode({
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": callback_url,
        "grant_type": "authorization_code"
    }).encode("utf-8")

    try:
        req = urllib.request.Request(token_url, data=token_data, headers={"Content-Type": "application/x-www-form-urlencoded"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            token_res = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        logger.error(f"Failed to exchange OAuth code for tokens: {e}")
        raise HTTPException(status_code=500, detail="Failed to complete Google authentication token exchange.")

    id_token = token_res.get("id_token")
    if not id_token:
        raise HTTPException(status_code=500, detail="No id_token returned by Google.")

    try:
        verify_url = f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
        with urllib.request.urlopen(verify_url, timeout=10) as resp:
            id_info = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        logger.error(f"Failed to verify Google ID token: {e}")
        raise HTTPException(status_code=500, detail="Failed to verify Google identity token.")

    email = id_info.get("email")
    email_verified = id_info.get("email_verified") in (True, "true")

    if not email or not email_verified:
        raise HTTPException(status_code=400, detail="Google account email not verified.")

    logger.info(f"Verified Google Workspace identity: {email}")

    signed_cookie = sign_session_email(email)
    response = RedirectResponse(url=target, status_code=status.HTTP_302_FOUND)
    response.set_cookie(key="ge_user_email", value=signed_cookie, max_age=86400, httponly=True, samesite="lax")
    response.delete_cookie(key="oauth_state")
    response.delete_cookie(key="oauth_target")
    return response

@app.get("/switch")
@app.get("/select")
@app.get("/demo")
def demo_switch_account(request: Request):
    """
    Clears the session cookie and returns directly to the identity selector page,
    making it easy to demo multiple personas without using Incognito mode.
    """
    response = templates.TemplateResponse(
        request=request,
        name="unauthorized.html",
        context={"message": "Select or enter an identity to evaluate routing rules:"}
    )
    response.delete_cookie(key="ge_user_email")
    return response

@app.get("/launchpad", response_class=HTMLResponse)
def demo_launchpad(request: Request):
    """
    Direct endpoint to preview the Gemini Enterprise Multi-App Launchpad.
    """
    email = extract_user_email(request) or "admin@example.com"
    instances = load_policy()
    authorized = [i for i in instances if is_user_authorized_for_instance(email, i)]
    if not authorized:
        authorized = instances  # show all instances in demo preview

    return templates.TemplateResponse(
        request=request,
        name="launchpad.html",
        context={
            "user_email": email,
            "instances": authorized
        }
    )


@app.get("/api/me")
def get_current_user_profile(request: Request):
    """Returns the authenticated identity and evaluation breakdown for all instances."""
    email = extract_user_email(request)
    if not email:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"error": "Unauthenticated. No valid identity header found."}
        )

    instances = load_policy()
    authorized = []
    blocked = []
    for inst in instances:
        if is_user_authorized_for_instance(email, inst):
            authorized.append({"id": inst.id, "name": inst.name, "url": inst.target_url})
        else:
            blocked.append({"id": inst.id, "name": inst.name})

    return {
        "user_email": email,
        "authorized_instances": authorized,
        "blocked_instances": blocked
    }

@app.get("/", response_class=HTMLResponse)
def root_route(request: Request):
    """
    Main entrypoint under the unified DNS:
    - If user has access to 1 instance: HTTP 302 Redirect directly to that instance.
    - If user has access to multiple instances: Render enterprise Launchpad.
    - If user has access to 0 instances: HTTP 403 Forbidden Access Denied.
    - If unauthenticated: HTTP 401 Unauthorized / Sign-in prompt.
    """
    email = extract_user_email(request)

    if not email:
        instances = load_policy()
        return templates.TemplateResponse(
            request=request,
            name="unauthorized.html",
            context={
                "message": "Authentication required. Please sign in or authenticate via Identity-Aware Proxy (IAP).",
                "instances": instances
            },
            status_code=status.HTTP_401_UNAUTHORIZED
        )

    instances = load_policy()
    authorized_instances = [inst for inst in instances if is_user_authorized_for_instance(email, inst)]

    logger.info(f"User '{email}' evaluated. Authorized instances: {[i.id for i in authorized_instances]}")

    # Single Authorized App: Automatic Redirect
    if len(authorized_instances) == 1:
        target = authorized_instances[0].target_url
        logger.info(f"Redirecting user '{email}' to authorized instance: {target}")
        return RedirectResponse(url=target, status_code=status.HTTP_302_FOUND)

    # Multiple Authorized Apps: Enterprise Launchpad
    if len(authorized_instances) > 1:
        return templates.TemplateResponse(
            request=request,
            name="launchpad.html",
            context={
                "user_email": email,
                "instances": authorized_instances
            }
        )

    # Zero Authorized Apps: 403 Forbidden
    return templates.TemplateResponse(
        request=request,
        name="forbidden.html",
        context={
            "user_email": email,
            "instance_name": "All Gemini Enterprise Workspaces",
            "message": "You are not authorized to access any Gemini Enterprise instances with this identity."
        },
        status_code=status.HTTP_403_FORBIDDEN
    )

@app.get("/app/{instance_id}")
def direct_app_route(instance_id: str, request: Request):
    """
    Deep-linking guard for specific Gemini Enterprise instances.
    Prevents unauthorized direct navigation to restricted workspaces.
    """
    email = extract_user_email(request)
    if not email:
        return templates.TemplateResponse(
            request=request,
            name="unauthorized.html",
            context={"message": "Authentication required. Identity not verified."},
            status_code=status.HTTP_401_UNAUTHORIZED
        )

    instances = load_policy()
    target_instance = next((inst for inst in instances if inst.id == instance_id), None)

    if not target_instance:
        raise HTTPException(status_code=404, detail=f"Gemini Enterprise instance '{instance_id}' not found.")

    if not is_user_authorized_for_instance(email, target_instance):
        logger.warning(f"SECURITY BLOCK: User '{email}' denied access to instance '{instance_id}' ({target_instance.name})")
        return templates.TemplateResponse(
            request=request,
            name="forbidden.html",
            context={
                "user_email": email,
                "instance_name": target_instance.name,
                "instance_id": target_instance.id,
                "message": f"Access Denied: Your account ({email}) does not have permission to access {target_instance.name}."
            },
            status_code=status.HTTP_403_FORBIDDEN
        )

    logger.info(f"Access granted: User '{email}' -> {target_instance.name}")
    return RedirectResponse(url=target_instance.target_url, status_code=status.HTTP_302_FOUND)
