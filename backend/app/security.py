import os
from typing import Set
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

# Shared internal API key between Frontend and Backend
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "medattend-internal-secret-token-key-2026")

# Public endpoints accessible from the internet (e.g. mobile student selfie attendance)
PUBLIC_EXACT_PATHS: Set[str] = {
    "/",
    "/health",
    "/health/performance",
    "/api/health/performance",
    "/api/selfie-attendance",
    "/docs",
    "/openapi.json",
    "/redoc",
}

PUBLIC_PREFIXES = (
    "/health",
    "/api/selfie-attendance",
)


def is_public_path(path: str) -> bool:
    """Checks if the request path is whitelisted for unauthenticated public access."""
    if path in PUBLIC_EXACT_PATHS:
        return True
    for prefix in PUBLIC_PREFIXES:
        if path.startswith(prefix):
            return True
    return False


def is_authorized_request(request: Request) -> bool:
    """
    Verifies that the request is authorized:
    1. Public endpoints (e.g. /api/selfie-attendance, /health) are always allowed.
    2. Requests with valid X-Internal-API-Key or Authorization Bearer token are allowed.
    3. Requests with query token ?key=<key> or ?token=<key> are allowed (for video tags).
    4. Direct local requests from localhost (without external Cloudflare/proxy headers) are allowed.
    5. All external internet requests through Cloudflare tunnel to protected APIs MUST have the API key.
    """
    path = request.url.path

    # 1. Public whitelisted endpoints
    if is_public_path(path):
        return True

    # 2. Check X-Internal-API-Key header
    api_key_header = request.headers.get("x-internal-api-key") or request.headers.get("X-Internal-API-Key")
    if api_key_header and api_key_header.strip() == INTERNAL_API_KEY:
        return True

    # 3. Check Authorization header (Bearer <key>)
    auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        if token == INTERNAL_API_KEY:
            return True

    # 4. Check query parameter token (?key=... or ?token=...)
    query_key = request.query_params.get("key") or request.query_params.get("token") or request.query_params.get("api_key")
    if query_key and query_key.strip() == INTERNAL_API_KEY:
        return True

    # 5. Check if request is directly from local loopback AND NOT forwarded from Cloudflare/external proxy
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
    Enforces authentication for all management, video stream, PTZ, WhatsApp, and face enrollment APIs
    while keeping student selfie attendance open for remote check-ins.
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

        return await call_next(request)
