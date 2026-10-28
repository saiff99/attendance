import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import router
from app.security import APISecurityMiddleware

# Initialize FastAPI application
app = FastAPI(
    title="MedAttend AI — Enterprise Smart Attendance API",
    description="Secure Biometric Facial Recognition & Multi-Camera Surveillance API",
    version="2.0.0"
)

# Allowed CORS Origins for frontend clients (Dynamic from environment, locked down by default)
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "")
configured_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]

default_allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "https://jimslogin.vercel.app",
] + configured_origins

# Deduplicate origins while preserving order
allowed_origins = list(dict.fromkeys(default_allowed_origins))

# Optional exact regex (matches vercel domains, localhost, and private LAN subnets 10.x, 172.16-31.x, 192.168.x)
default_origin_regex = r"^(?:https://.*\.vercel\.app|https?://(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[0-1])\.\d+\.\d+|192\.168\.\d+\.\d+)(?::\d+)?)$"
allowed_origin_regex = os.getenv("ALLOWED_ORIGIN_REGEX", "").strip() or default_origin_regex

# CORS Middleware (Enterprise Zero-Trust: Strictly allowlisted origins, methods, and headers)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=allowed_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=[
        "Content-Type",
        "Authorization",
        "X-Internal-API-Key",
        "X-Actor-Id",
        "X-Actor-Name",
        "X-Actor-Role",
        "Accept",
        "Origin",
    ],
    expose_headers=["Content-Length", "Retry-After"],
)

# Enterprise API Security Middleware (Blocks unauthenticated external access to management endpoints)
app.add_middleware(APISecurityMiddleware)

# Include all API routes from the modular router
app.include_router(router)
