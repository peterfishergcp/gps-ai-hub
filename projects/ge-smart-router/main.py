import hashlib
import hmac
import html
import logging
import os
import re
import secrets
import time
from typing import List, Optional
import urllib.parse
import httpx
import yaml

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

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
REQUIRE_REAL_AUTH = os.getenv("REQUIRE_REAL_AUTH", "false" if DEV_MODE else "true").lower() in ("true", "1", "yes")
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() in ("true", "1", "yes") or (not DEV_MODE and REQUIRE_REAL_AUTH)
CANONICAL_HOST = os.getenv("CANONICAL_HOST", "")

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
IAP_AUDIENCE = os.getenv("IAP_AUDIENCE", "")
REQUIRE_IAP_JWT = os.getenv("REQUIRE_IAP_JWT", "false" if DEV_MODE else "true").lower() in ("true", "1", "yes")

# Secure Session Secret Management: Dynamic 256-bit generation if unset
SESSION_SECRET_RAW = os.getenv("SESSION_SECRET")
if SESSION_SECRET_RAW:
    SESSION_SECRET = SESSION_SECRET_RAW.encode()
elif DEV_MODE:
    SESSION_SECRET = b"dev-insecure-secret-key-do-not-use-in-production"
    logger.warning("DEV_MODE active: using local development session secret.")
else:
    SESSION_SECRET = secrets.token_bytes(32)
    logger.warning("SESSION_SECRET unset in environment: generated ephemeral 256-bit random key. Sessions will not persist across multi-instance restarts.")

def is_safe_redirect_url(target: Optional[str]) -> bool:
    """
    Validates redirect URL to prevent Open Redirect vulnerabilities.
    Decodes percent-encoded characters and ensures URL is strictly relative to current host.
    """
    if not target:
        return False
    try:
        decoded_target = urllib.parse.unquote(target)
        parsed = urllib.parse.urlsplit(decoded_target)
        if parsed.scheme != "" or parsed.netloc != "":
            return False
        # Ensure path starts with a single '/' and does not start with '//' or contain '\'
        if not parsed.path.startswith("/") or parsed.path.startswith("//") or "\\" in decoded_target:
            return False
        return True
    except Exception:
        return False

def get_iap_jwt_claims(jwt_token: str) -> Optional[dict]:
    """
    Cryptographically verifies Cloud IAP signed JWT assertion against Google public certificates.
    Validates token signature, issuer, audience, and expiration.
    """
    if not IAP_AUDIENCE and not DEV_MODE:
        logger.error("IAP_AUDIENCE is not configured in production. Cannot securely verify IAP JWT.")
        return None
    try:
        request_adapter = google_requests.Request()
        certs_url = "https://www.gstatic.com/iap/verify/public_key"
        expected_aud = IAP_AUDIENCE if IAP_AUDIENCE else None
        claims = google_id_token.verify_token(
            jwt_token,
            request_adapter,
            audience=expected_aud,
            certs_url=certs_url
        )
        if claims.get("iss") != "https://cloud.google.com/iap":
            logger.warning(f"Invalid IAP JWT issuer: {claims.get('iss')}")
            return None
        return claims
    except Exception as e:
        logger.error(f"Cryptographic verification failed for IAP JWT: {e}")
        return None

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

_cached_policy: Optional[List[InstanceConfig]] = None
_cached_policy_mtime: float = 0.0
_last_mtime_check: float = 0.0
MTIME_CHECK_INTERVAL: float = 30.0  # Throttle filesystem stat syscalls

def load_policy(force_reload: bool = False) -> List[InstanceConfig]:
    """
    Loads and caches parsed policy configuration in memory.
    Throttles filesystem stat syscalls using an in-memory TTL check.
    """
    global _cached_policy, _cached_policy_mtime, _last_mtime_check
    if not os.path.exists(CONFIG_PATH):
        logger.error(f"Policy configuration file not found at {CONFIG_PATH}")
        return []

    now = time.time()
    if not force_reload and _cached_policy is not None and (now - _last_mtime_check < MTIME_CHECK_INTERVAL):
        return _cached_policy

    _last_mtime_check = now
    try:
        current_mtime = os.path.getmtime(CONFIG_PATH)
        if not force_reload and _cached_policy is not None and current_mtime == _cached_policy_mtime:
            return _cached_policy

        with open(CONFIG_PATH, "r") as f:
            data = yaml.safe_load(f)
        instances = []
        for item in data.get("instances", []):
            inst = InstanceConfig(**item)
            if not inst.target_url.startswith("https://") and not DEV_MODE:
                logger.warning(f"Instance '{inst.id}' target_url does not use HTTPS: {inst.target_url}")
            instances.append(inst)
        _cached_policy = instances
        _cached_policy_mtime = current_mtime
        logger.info(f"Loaded policy configuration from {CONFIG_PATH} ({len(_cached_policy)} instances)")
        return _cached_policy
    except Exception as e:
        logger.error(f"Error loading policy configuration: {e}")
        return _cached_policy or []

def get_user_groups(request: Request) -> List[str]:
    """
    Resolves group memberships for the user.
    Client-supplied request headers are only evaluated in DEV_MODE to prevent header spoofing.
    In production, group memberships must be verified server-side or via Cloud IAM / IAP.
    """
    if not DEV_MODE:
        return []
    groups = []
    header_groups = (
        request.headers.get("X-Goog-Authenticated-User-Groups")
        or request.headers.get("X-User-Groups")
    )
    if header_groups:
        groups.extend([g.strip().lower() for g in header_groups.split(",") if g.strip()])
    return groups

def get_oauth_callback_url(request: Request) -> str:
    """
    Constructs OAuth redirect URI using trusted CANONICAL_HOST or sanitized Host header.
    Prevents Host Header Injection and cache poisoning.
    """
    if CANONICAL_HOST:
        return f"https://{CANONICAL_HOST}/auth/callback"
    forwarded_proto = request.headers.get("x-forwarded-proto", "https")
    forwarded_host = request.headers.get("x-forwarded-host", request.headers.get("host", ""))
    if forwarded_host and re.match(r"^[a-zA-Z0-9\.\-]+(?::\d+)?$", forwarded_host):
        return f"{forwarded_proto}://{forwarded_host}/auth/callback"
    return str(request.base_url).rstrip("/") + "/auth/callback"

def extract_user_email(request: Request) -> Optional[str]:
    """
    Extracts authenticated user identity with fallback priority:
    1. Cloud IAP cryptographically signed JWT assertion ('x-goog-iap-jwt-assertion').
    2. Cloud IAP header ('X-Goog-Authenticated-User-Email') when behind Cloud Load Balancer.
    3. Signed session cookie ('ge_user_email') from Google OAuth.
    4. Dev query parameters or headers when running in development mode.
    """
    # 1. Check Identity-Aware Proxy (IAP) cryptographically signed JWT assertion
    iap_jwt = request.headers.get("x-goog-iap-jwt-assertion")
    if iap_jwt:
        claims = get_iap_jwt_claims(iap_jwt)
        if claims:
            if IAP_AUDIENCE and claims.get("aud") != IAP_AUDIENCE:
                logger.error(f"IAP JWT audience mismatch: got {claims.get('aud')}, expected {IAP_AUDIENCE}")
                return None
            email = claims.get("email")
            if email:
                return email.strip().lower()

    # 2. Check Identity-Aware Proxy (IAP) email header
    iap_email_header = request.headers.get("X-Goog-Authenticated-User-Email")
    if iap_email_header:
        if REQUIRE_IAP_JWT and not DEV_MODE:
            logger.warning("Rejected unverified X-Goog-Authenticated-User-Email header because REQUIRE_IAP_JWT is enabled.")
            return None
        return re.sub(r"^[^:]+:", "", iap_email_header).strip().lower()

    # 3. Check signed session cookie
    cookie_val = request.cookies.get("ge_user_email")
    verified_email = verify_session_email(cookie_val)
    if verified_email:
        return verified_email

    # 4. Check query parameters or dev headers (testing fallback)
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

def is_user_authorized_for_instance(
    email: str,
    instance: InstanceConfig,
    user_groups: Optional[List[str]] = None
) -> bool:
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

    # Rule 3: Group membership check
    if user_groups and instance.allowed_groups:
        user_group_set = set(g.strip().lower() for g in user_groups)
        for allowed_group in instance.allowed_groups:
            if allowed_group.strip().lower() in user_group_set:
                logger.info(f"User '{email}' authorized for '{instance.id}' via group '{allowed_group}'")
                return True

    # Rule 4: Domain allowlist check
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
    if not DEV_MODE:
        if REQUIRE_REAL_AUTH:
            return RedirectResponse(url="/auth/login", status_code=status.HTTP_302_FOUND)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Direct persona login is disabled in production mode. Set DEV_MODE=true for testing."
        )
    safe_target = target if is_safe_redirect_url(target) else "/"
    email_clean = email.strip().lower()
    signed_val = sign_session_email(email_clean)
    response = RedirectResponse(url=safe_target, status_code=status.HTTP_302_FOUND)
    response.set_cookie(key="ge_user_email", value=signed_val, max_age=86400, httponly=True, samesite="lax", secure=COOKIE_SECURE)
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
                "require_real_auth": REQUIRE_REAL_AUTH,
                "dev_mode": DEV_MODE
            },
            status_code=status.HTTP_401_UNAUTHORIZED
        )

    safe_target = target if is_safe_redirect_url(target) else "/"
    state = secrets.token_urlsafe(16)
    callback_url = get_oauth_callback_url(request)

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
    response.set_cookie(key="oauth_state", value=state, max_age=600, httponly=True, samesite="lax", secure=COOKIE_SECURE)
    response.set_cookie(key="oauth_target", value=safe_target, max_age=600, httponly=True, samesite="lax", secure=COOKIE_SECURE)
    return response

@app.get("/auth/callback")
def auth_callback(request: Request, code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    """Handles Google OAuth callback, verifies identity token with Google, and establishes secure session."""
    if error:
        safe_error = html.escape(error)
        logger.error(f"Google OAuth authorization error: {safe_error}")
        return templates.TemplateResponse(
            request=request,
            name="unauthorized.html",
            context={
                "message": f"Google Authentication Error: {error}",
                "dev_mode": DEV_MODE
            },
            status_code=400
        )

    saved_state = request.cookies.get("oauth_state")
    target = request.cookies.get("oauth_target") or "/"
    safe_target = target if is_safe_redirect_url(target) else "/"

    if not code or not state or state != saved_state:
        logger.error("OAuth state mismatch or missing code.")
        raise HTTPException(status_code=400, detail="Invalid OAuth state or missing code.")

    callback_url = get_oauth_callback_url(request)

    token_endpoint = "https://oauth2.googleapis.com/token"  # nosec B105
    token_payload = {
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": callback_url,
        "grant_type": "authorization_code",
    }

    try:
        with httpx.Client(timeout=10.0) as http_client:
            token_resp = http_client.post(token_endpoint, data=token_payload)
            token_resp.raise_for_status()
            token_res = token_resp.json()
    except Exception as e:
        logger.error(f"Failed to exchange OAuth code for tokens: {e}")
        raise HTTPException(status_code=500, detail="Failed to complete Google authentication token exchange.")

    id_token = token_res.get("id_token")
    if not id_token:
        raise HTTPException(status_code=500, detail="No id_token returned by Google.")

    try:
        request_adapter = google_requests.Request()
        id_info = google_id_token.verify_oauth2_token(
            id_token,
            request_adapter,
            audience=GOOGLE_CLIENT_ID
        )
    except Exception as e:
        logger.error(f"Failed to verify Google ID token: {e}")
        raise HTTPException(status_code=400, detail="Failed to verify Google identity token.")

    # Validate Issuer (iss) claim is official Google accounts domain
    iss = id_info.get("iss")
    if iss not in ("accounts.google.com", "https://accounts.google.com"):
        logger.error(f"Invalid Google ID token issuer: '{iss}'")
        raise HTTPException(status_code=400, detail="Invalid Google ID token issuer.")

    email = id_info.get("email")
    email_verified = id_info.get("email_verified") in (True, "true")

    if not email or not email_verified:
        raise HTTPException(status_code=400, detail="Google account email not verified.")

    logger.info(f"Verified Google Workspace identity: {email}")

    signed_cookie = sign_session_email(email)
    response = RedirectResponse(url=safe_target, status_code=status.HTTP_302_FOUND)
    response.set_cookie(key="ge_user_email", value=signed_cookie, max_age=86400, httponly=True, samesite="lax", secure=COOKIE_SECURE)
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
        context={
            "message": "Select or enter an identity to evaluate routing rules:",
            "dev_mode": DEV_MODE
        }
    )
    response.delete_cookie(key="ge_user_email")
    return response

@app.get("/launchpad", response_class=HTMLResponse)
def demo_launchpad(request: Request):
    """
    Direct endpoint to preview the Gemini Enterprise Multi-App Launchpad.
    """
    email = extract_user_email(request)
    if not email:
        if REQUIRE_REAL_AUTH and not DEV_MODE:
            return RedirectResponse(url="/auth/login?target=/launchpad", status_code=status.HTTP_302_FOUND)
        email = "admin@example.com" if DEV_MODE else None

    if not email:
        instances = load_policy()
        return templates.TemplateResponse(
            request=request,
            name="unauthorized.html",
            context={
                "message": "Authentication required to view the Launchpad.",
                "instances": instances,
                "dev_mode": DEV_MODE
            },
            status_code=status.HTTP_401_UNAUTHORIZED
        )

    groups = get_user_groups(request)
    instances = load_policy()
    authorized = [i for i in instances if is_user_authorized_for_instance(email, i, groups)]
    if not authorized and DEV_MODE:
        authorized = instances  # show all instances in demo preview only if DEV_MODE

    return templates.TemplateResponse(
        request=request,
        name="launchpad.html",
        context={
            "user_email": email,
            "instances": authorized,
            "dev_mode": DEV_MODE
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

    groups = get_user_groups(request)
    instances = load_policy()
    authorized = []
    blocked = []
    for inst in instances:
        if is_user_authorized_for_instance(email, inst, groups):
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
                "instances": instances,
                "dev_mode": DEV_MODE
            },
            status_code=status.HTTP_401_UNAUTHORIZED
        )

    groups = get_user_groups(request)
    instances = load_policy()
    authorized_instances = [inst for inst in instances if is_user_authorized_for_instance(email, inst, groups)]

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

    groups = get_user_groups(request)
    instances = load_policy()
    target_instance = next((inst for inst in instances if inst.id == instance_id), None)

    if not target_instance:
        raise HTTPException(status_code=404, detail=f"Gemini Enterprise instance '{instance_id}' not found.")

    if not is_user_authorized_for_instance(email, target_instance, groups):
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
