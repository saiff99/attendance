from fastapi import APIRouter
from app.ai import AI_ENABLED

router = APIRouter(tags=["Health & Performance"])


@router.api_route("/", methods=["GET", "HEAD"])
async def read_root():
    return {"status": "Online", "message": "Smart Attendance API is running", "ai_enabled": AI_ENABLED}


@router.api_route("/health", methods=["GET", "HEAD"])
async def health_check():
    return {"status": "ok", "ai_enabled": AI_ENABLED}


@router.get("/health/performance")
@router.get("/api/health/performance")
async def health_performance():
    """
    Lightweight performance & diagnostic endpoint for all configured cameras,
    AI inference duration, FPS metrics, queue status, and biometric cache telemetry.
    """
    from app.stream import get_performance_diagnostics
    from app.biometric_cache import get_biometric_cache_stats
    diag = get_performance_diagnostics()
    if isinstance(diag, dict):
        diag["biometric_cache"] = get_biometric_cache_stats()
    return diag
