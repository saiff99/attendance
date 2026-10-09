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

# Allowed CORS Origins for frontend clients
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "")
configured_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]

default_allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
] + configured_origins

# CORS Middleware (Locked down to local dev and trusted deployment domains)
app.add_middleware(
    CORSMiddleware,
    allow_origins=default_allowed_origins,
    allow_origin_regex=r"^https://.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enterprise API Security Middleware (Blocks unauthenticated external access to management endpoints)
app.add_middleware(APISecurityMiddleware)

# Include all API routes from the modular router
app.include_router(router)
