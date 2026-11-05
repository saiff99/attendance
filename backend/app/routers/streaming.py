from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from app.config import get_camera_details
from app.stream import generate_video_feed

router = APIRouter(tags=["Streaming"])


@router.get("/api/cameras")
async def get_cameras():
    """Returns details of all configured surveillance cameras with credentials securely redacted."""
    cameras = get_camera_details(redact_credentials=True)
    return {"count": len(cameras), "cameras": cameras}


@router.post("/api/cameras/recheck")
async def recheck_cameras():
    """Forces all camera circuit-breakers to reset and probe connections immediately."""
    from app.stream import camera_manager
    results = camera_manager.recheck_all_cameras()
    return {"success": True, "message": "Circuit-breakers reset. Immediate probe scheduled.", "cameras": results}


@router.get("/api/video-feed/{session_id}")
async def video_feed(session_id: str, request: Request, camera_index: int = 0, grid: int = 1):
    """Streams the live CCTV video with bounding boxes."""
    return StreamingResponse(
        generate_video_feed(session_id, request=request, camera_index=camera_index, camera_type="cctv", is_grid=bool(grid)),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

