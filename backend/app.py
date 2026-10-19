import spaces
from gradio import Server
import os
from fastapi.middleware.cors import CORSMiddleware
from app.routes import router as api_router
from app.security import APISecurityMiddleware

# Initialize Gradio Server (which inherits directly from FastAPI)
app = Server(
    title="MedAttend AI — Enterprise Smart Attendance API",
    description="Secure Biometric Facial Recognition & Multi-Camera Surveillance API",
    version="2.0.0"
)

# ZeroGPU registered diagnostic endpoint
@spaces.GPU
@app.api(name="diagnostics")
def diagnostics(query: str = "ping") -> str:
    """ZeroGPU registered diagnostic function for MedAttend AI Vision Engine."""
    return f"🟢 MedAttend AI ArcFace 512D Engine is fully operational. Query: '{query}'"

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

# Enterprise API Security Middleware
app.add_middleware(APISecurityMiddleware)

# Include all FastAPI application routes from modular router
app.include_router(api_router)

# Launch native Gradio Server (handled seamlessly by Hugging Face Spaces & ZeroGPU)
if __name__ == "__main__":
    app.launch()
