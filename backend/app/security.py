import os
import hmac
import posixpath
from typing import Set
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware

# Shared internal API key between Frontend and Backend (loaded strictly from environment)
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "").strip()

# Public endpoints accessible from the internet without authentication.
# Keep strictly minimal to avoid accidental sensitive data exposure.
# Note: Detailed operational diagnostics (/health/performance) are strictly protected.
PUBLIC_EXACT_PATHS: Set[str] = {
    "/",
    "/health",
    "/api/selfie-attendance",
}


def is_public_path(path: str) -> bool:
    """
    Checks if the request path is whitelisted for unauthenticated public access.
    Normalizes path to eliminate traversal tricks (../), trailing slashes, and duplicate slashes.
    """
    if not path:
        return False
    norm_path = posixpath.normpath(path)
    if norm_path != "/" and norm_path.endswith("/"):
        norm_path = norm_path.rstrip("/")
    return norm_path in PUBLIC_EXACT_PATHS


def is_authorized_request(request: Request) -> bool:
    """
    Verifies that the request is authorized:
    1. Public endpoints (e.g. /health, /api/selfie-attendance) are always allowed.
    2. Requests with valid X-Internal-API-Key header (constant-time comparison) are allowed.
    3. Requests with valid Authorization header (Bearer <key>, constant-time comparison) are allowed.
    4. Direct local requests from localhost loopback (WITHOUT external proxy headers) are allowed.
    
    Security Hardening:
    - Query parameter API keys (?key=, ?token=, ?api_key=) are STRICTLY DISABLED to prevent
      secrets leaking into web server access logs, reverse proxy logs, browser history, or referrers.
    - Diagnostics (/health/performance) require authentication and are not public.
    """
    path = request.url.path

    # 1. Public whitelisted endpoints (strictly exact normalized paths)
    if is_public_path(path):
        return True

    # 2. Check X-Internal-API-Key header (constant-time comparison)
    api_key_header = request.headers.get("x-internal-api-key") or request.headers.get("X-Internal-API-Key")
    if INTERNAL_API_KEY and api_key_header and hmac.compare_digest(api_key_header.strip(), INTERNAL_API_KEY):
        return True

    # 3. Check Authorization header (Bearer <key>, constant-time comparison)
    auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
    if INTERNAL_API_KEY and auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        if hmac.compare_digest(token, INTERNAL_API_KEY):
            return True

    # Note: Query parameter authentication is explicitly prohibited for security.

    # 4. Check if request is directly from local loopback AND NOT forwarded from Cloudflare/external proxy
    client_ip = request.client.host if request.client else ""
    is_loopback = client_ip in ("127.0.0.1", "::1", "localhost", "testclient")
    has_external_proxy_headers = bool(
        request.headers.get("cf-connecting-ip")
        or request.headers.get("x-forwarded-for")
        or request.headers.get("x-real-ip")
    )

    # Pure direct local requests from the host machine are allowed
    if is_loopback and not has_external_proxy_headers:
        return True

    return False


class APISecurityMiddleware(BaseHTTPMiddleware):
    """
    Enterprise Security Guard Middleware.
    Enforces authentication for all management, video stream, PTZ, WhatsApp, diagnostics, and face enrollment APIs
    while keeping student selfie attendance and basic liveness check open.
    """
    async def dispatch(self, request: Request, call_next):
        # Allow CORS preflight requests
        if request.method == "OPTIONS":
            return await call_next(request)

        if not is_authorized_request(request):
            return JSONResponse(
                status_code=403,
                content={
                    "detail": "Forbidden: Protected management endpoint. Valid X-Internal-API-Key header or authentication required.",
                    "path": request.url.path,
                }
            )

        try:
            return await call_next(request)
        except (HTTPException, StarletteHTTPException) as exc:
            return JSONResponse(
                status_code=exc.status_code,
                content={"detail": exc.detail},
                headers=getattr(exc, "headers", None)
            )
        except Exception as exc:
            import traceback
            traceback.print_exc()
            return JSONResponse(
                status_code=500,
                content={"detail": f"Backend Error: {str(exc)}"}
            )
