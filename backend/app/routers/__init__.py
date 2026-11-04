from app.routers.health import router as health_router
from app.routers.streaming import router as streaming_router
from app.routers.biometrics import router as biometrics_router

__all__ = ["health_router", "streaming_router", "biometrics_router"]
