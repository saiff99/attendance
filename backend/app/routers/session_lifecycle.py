import time
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, UploadFile, File

from app.routers.helpers import safe_read_image_file, MAX_SELFIE_IMAGE_SIZE
from app.session_cache import invalidate_backend_session_cache

router = APIRouter(tags=["Session Lifecycle"])


class ScanRequest(BaseModel):
    session_id: str


class EndSessionRequest(BaseModel):
    session_id: Optional[str] = None


@router.post("/api/start-live-scan")
def start_live_scan(request: ScanRequest):
    from app.stream import ai_coordinator
    ai_coordinator.set_active_session(request.session_id)
    return {
        "success": True,
        "message": f"Live scan started successfully for session {request.session_id}",
        "session_id": request.session_id,
        "timestamp": time.time()
    }


@router.post("/api/end-session")
@router.post("/api/stop-session")
@router.post("/api/cleanup-session")
async def api_end_session(request: Optional[EndSessionRequest] = None):
    """
    Session Lifecycle Memory Cleanup.
    Releases all session-specific memory, cached embedding matrices, student records,
    and camera spatial caches without disconnecting persistent CCTV RTSP stream connections.
    """
    s_id = request.session_id if request else None
    from app.stream import ai_coordinator, cleanup_session_state
    from app.rate_limiter import prune_all_expired_rate_limit_state
    ai_coordinator.end_active_session(s_id)
    result = cleanup_session_state(s_id)
    rl_result = prune_all_expired_rate_limit_state(session_id=s_id)
    invalidate_backend_session_cache(s_id)
    return {
        "success": True,
        "message": "Session memory cleaned up successfully. RTSP streams remain connected.",
        "details": result,
        "rate_limiter_cleanup": rl_result
    }


@router.post("/api/sessions/{session_id}/end")
async def api_end_session_by_id(session_id: str):
    """Ends a specific session and purges its cached state."""
    from app.stream import ai_coordinator, cleanup_session_state
    from app.rate_limiter import prune_all_expired_rate_limit_state
    ai_coordinator.end_active_session(session_id)
    result = cleanup_session_state(session_id)
    rl_result = prune_all_expired_rate_limit_state(session_id=session_id)
    invalidate_backend_session_cache(session_id)
    return {
        "success": True,
        "message": f"Session {session_id} ended and memory cleaned up successfully.",
        "details": result,
        "rate_limiter_cleanup": rl_result
    }


@router.post("/api/upload-photo")
async def upload_photo(file: UploadFile = File(...)):
    contents = await safe_read_image_file(file, MAX_SELFIE_IMAGE_SIZE)
    return {
        "success": True,
        "filename": file.filename if file.filename else "unknown",
        "size_bytes": len(contents),
        "message": "Photo uploaded and verified successfully",
        "mock_result": {
            "student_id": "mock-uuid-1234",
            "student_name": "John Doe",
            "confidence": 0.98
        }
    }

