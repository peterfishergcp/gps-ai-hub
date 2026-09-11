import logging
import os
import re
from typing import List, Optional
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
    2. Session cookie ('ge_user_email') for direct browser testing.
    3. Dev query parameters or headers when running in development mode.
    """
    # 1. Check Identity-Aware Proxy (IAP) header first
    iap_email_header = request.headers.get("X-Goog-Authenticated-User-Email")
    if iap_email_header:
        # IAP prefixes email with 'accounts.google.com:'
        return re.sub(r"^[^:]+:", "", iap_email_header).strip().lower()

    # 2. Check session cookie
    cookie_email = request.cookies.get("ge_user_email")
    if cookie_email:
        return cookie_email.strip().lower()

    # 3. Check query parameters or dev headers (testing fallback)
    if DEV_MODE:
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
    email_clean = email.strip().lower()
    response = RedirectResponse(url=target, status_code=status.HTTP_302_FOUND)
    response.set_cookie(key="ge_user_email", value=email_clean, max_age=86400, httponly=True, samesite="lax")
    return response

@app.get("/logout")
def logout():
    """Clears local session cookie."""
    response = RedirectResponse(url="/", status_code=status.HTTP_302_FOUND)
    response.delete_cookie(key="ge_user_email")
    return response

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
