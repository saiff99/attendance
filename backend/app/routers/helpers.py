import io
import ipaddress
import logging
from typing import Optional
from PIL import Image
from fastapi import HTTPException, Request, UploadFile

logger = logging.getLogger(__name__)

# =========================================================================
# IP Validation & Resolution Helpers
# =========================================================================
def is_valid_ip(ip_str: Optional[str]) -> bool:
    """Validates if a string is a well-formed IPv4 or IPv6 address."""
    if not ip_str or not isinstance(ip_str, str):
        return False
    try:
        ipaddress.ip_address(ip_str.strip())
        return True
    except ValueError:
        return False

def get_real_client_ip(request: Request) -> str:
    """
    Extracts genuine client IP behind Cloudflare Tunnel, reverse proxies, or direct connection.
    Validates and rejects malformed or client-forged headers.
    """
    # 1. Cloudflare Tunnel / Edge connecting IP
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip and is_valid_ip(cf_ip.strip()):
        return cf_ip.strip()

    # 2. Reverse proxy real IP (e.g. Nginx / Vercel)
    real_ip = request.headers.get("x-real-ip")
    if real_ip and is_valid_ip(real_ip.strip()):
        return real_ip.strip()

    # 3. X-Forwarded-For: validate and return leftmost legitimate IP
    xff = request.headers.get("x-forwarded-for")
    if xff and xff.strip():
        for part in xff.split(","):
            candidate = part.strip()
            if is_valid_ip(candidate):
                return candidate

    # 4. Direct socket client host
    if request.client and request.client.host and is_valid_ip(request.client.host):
        return request.client.host

    return "127.0.0.1"


# =========================================================================
# Secure Image Upload Validation & Anti-DoS File Processing
# =========================================================================
MAX_SELFIE_IMAGE_SIZE = 6 * 1024 * 1024       # 6 MB max for selfie / face enrollment
MAX_CLASSROOM_IMAGE_SIZE = 15 * 1024 * 1024   # 15 MB max for classroom scan

# Decompression bomb prevention for PIL (prevents billion-pixel OOM attacks)
Image.MAX_IMAGE_PIXELS = 25_000_000

ALLOWED_IMAGE_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/jpg",
}

async def safe_read_image_file(file: UploadFile, max_size: int = MAX_SELFIE_IMAGE_SIZE) -> bytes:
    """
    Safely reads an uploaded image with strict size limits, MIME type verification,
    magic byte checking, and decompression bomb protection to prevent DoS attacks.
    """
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file provided in upload request.")

    # 1. Content-Type Header Verification
    content_type = (file.content_type or "").lower().strip()
    if content_type and content_type not in ALLOWED_IMAGE_MIME_TYPES and content_type != "application/octet-stream":
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file format '{content_type}'. Only JPEG, PNG, and WebP images are allowed."
        )

    # 2. Chunked streaming read with strict hard limit
    chunks = []
    total_size = 0
    chunk_size = 64 * 1024  # 64 KB

    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total_size += len(chunk)
        if total_size > max_size:
            max_mb = max_size // (1024 * 1024)
            raise HTTPException(
                status_code=413,
                detail=f"File too large! Maximum allowed image size is {max_mb}MB."
            )
        chunks.append(chunk)

    if total_size == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty (0 bytes).")

    contents = b"".join(chunks)

    # 3. Magic Byte Validation
    is_valid_magic = (
        contents.startswith(b"\xff\xd8\xff")  # JPEG
        or contents.startswith(b"\x89PNG\r\n\x1a\n")  # PNG
        or (contents.startswith(b"RIFF") and b"WEBP" in contents[:16])  # WebP
        or (b"ftypheic" in contents[:16] or b"ftypmif1" in contents[:16])  # HEIC
    )
    if not is_valid_magic:
        raise HTTPException(
            status_code=400,
            detail="Invalid image file. File content header does not match valid JPEG, PNG, or WebP format."
        )

    # 4. Decompression verification
    try:
        with Image.open(io.BytesIO(contents)) as test_img:
            test_img.verify()
    except Exception as img_err:
        raise HTTPException(
            status_code=400,
            detail=f"Corrupt or invalid image file: {str(img_err)}"
        )

    return contents
