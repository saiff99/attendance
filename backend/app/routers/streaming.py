from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from app.config import get_camera_details
from app.stream import generate_video_feed

router = APIRouter(tags=["Streaming"])


@router.get("/api/cameras")
async def get_cameras():
    """Returns details of all configured surveillance cameras with credentials securely redacted and live connection states."""
    from app.stream import camera_manager
    cameras = get_camera_details(redact_credentials=True)
    with camera_manager.lock:
        for cam in cameras:
            idx = cam["index"]
            stream = camera_manager.cctv_streams.get(idx)
            if stream:
                cb_status = stream.circuit_breaker.get_status()
                cam["is_connected"] = bool(stream.connected)
                cam["is_dormant"] = bool(cb_status["is_dormant"])
                cam["circuit_breaker_state"] = cb_status["state"]
            else:
                cam["is_connected"] = False
                cam["is_dormant"] = True
                cam["circuit_breaker_state"] = "DORMANT"
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

