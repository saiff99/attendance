import os
from typing import Optional, Tuple
import cv2
import numpy as np

MIN_FACE_CROP_DIM = int(os.getenv("ANTISPOOF_MIN_CROP_DIM", "60"))
MIN_FACE_CONTRAST_STD = float(os.getenv("ANTISPOOF_MIN_CONTRAST_STD", "4.0"))


def detect_moire_patterns(face_bgr: np.ndarray) -> Tuple[bool, float, float]:
    """
    Analyzes 2D Fourier Transform (FFT) spectrum of the face region to detect
    Moiré fringes and periodic high-frequency raster spikes caused by photographing
    computer/laptop monitors or mobile OLED/LCD displays.
    
    Returns: (is_moire_detected, peak_to_median_ratio, high_freq_ratio)
    Raises RuntimeError on invalid inputs or analysis failures to enforce fail-closed security.
    """
    if face_bgr is None or not isinstance(face_bgr, np.ndarray) or face_bgr.size == 0:
        raise ValueError("Invalid or empty image crop provided to Moiré detection.")

    # Standardize face crop size for consistent frequency domain analysis
    resized = cv2.resize(face_bgr, (256, 256), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    
    # Apply 2D Fast Fourier Transform
    f = np.fft.fft2(gray.astype(np.float32))
    fshift = np.fft.fftshift(f)
    magnitude_spectrum = np.abs(fshift)
    
    # Logarithmic scale power spectrum
    log_mag = np.log1p(magnitude_spectrum)
    
    h, w = log_mag.shape
    cy, cx = h // 2, w // 2
    
    # Create distance grid from DC center
    y, x = np.ogrid[:h, :w]
    dist_from_center = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    
    # High-frequency annular ring (where screen Moiré subpixel harmonics appear)
    # Radius between 35 and 115 in 256x256 image
    r_inner = 35.0
    r_outer = 115.0
    ring_mask = (dist_from_center >= r_inner) & (dist_from_center <= r_outer)
    
    ring_values = log_mag[ring_mask]
    if len(ring_values) == 0:
        raise RuntimeError("Failed to compute frequency distribution in annular ring.")
        
    med = float(np.median(ring_values))
    max_val = float(np.max(ring_values))
    p99 = float(np.percentile(ring_values, 99.5))
    
    # Peak-to-median ratio in high frequency annular band
    peak_to_med = (max_val / (med + 1e-6)) if med > 0 else 0.0
    p99_to_med = (p99 / (med + 1e-6)) if med > 0 else 0.0
    
    # High frequency energy ratio
    total_energy = float(np.sum(log_mag))
    high_freq_energy = float(np.sum(ring_values))
    high_freq_ratio = (high_freq_energy / (total_energy + 1e-6)) if total_energy > 0 else 0.0
    
    # Configurable threshold (tuned for realistic mobile front phone cameras)
    moire_thresh = float(os.getenv("ANTISPOOF_MOIRE_THRESH", "2.40"))
    
    # Screen Moiré patterns show sharp periodic spikes along with concentrated high-frequency harmonics
    is_screen = bool(
        (p99_to_med > moire_thresh and high_freq_ratio > 0.30) or 
        (peak_to_med > 2.80 and high_freq_ratio > 0.40)
    )
    return is_screen, float(p99_to_med), float(high_freq_ratio)


def detect_chromatic_subpixel_distortion(face_bgr: np.ndarray) -> Tuple[bool, float]:
    """
    Detects RGB sub-pixel stripe patterns and color crosstalk typical of LCD/OLED backlights.
    In natural human skin, chrominance gradients (Cr, Cb in YCrCb) are smooth and cohesive.
    When a screen is photographed, sub-pixel color borders cause high chrominance dispersion.
    """
    if face_bgr is None or not isinstance(face_bgr, np.ndarray) or face_bgr.size == 0:
        raise ValueError("Invalid or empty image crop provided to chromatic analysis.")

    resized = cv2.resize(face_bgr, (256, 256), interpolation=cv2.INTER_AREA)
    ycrcb = cv2.cvtColor(resized, cv2.COLOR_BGR2YCrCb)
    y, cr, cb = cv2.split(ycrcb)
    
    # Laplacian variance of Y (luminance) vs Cr & Cb (chrominance)
    var_y = float(cv2.Laplacian(y, cv2.CV_64F).var())
    var_cr = float(cv2.Laplacian(cr, cv2.CV_64F).var())
    var_cb = float(cv2.Laplacian(cb, cv2.CV_64F).var())
    
    # Chromatic dispersion ratio
    chroma_ratio = ((var_cr + var_cb) / (var_y + 1e-5)) if var_y > 10.0 else 0.0
    
    # Color channel clipping (screen photos often have clipped highlights in blue/red channels)
    r, g, b = cv2.split(resized)
    clipped_pixels = np.sum((r > 250) | (g > 250) | (b > 250))
    clip_ratio = float(clipped_pixels) / float(256 * 256)
    
    # Threshold: screens show high chromatic dispersion combined with subpixel color edges
    is_subpixel_spoof = bool(chroma_ratio > 0.95 and clip_ratio > 0.08)
    return is_subpixel_spoof, float(chroma_ratio)


def verify_face_liveness(image_bgr: np.ndarray, face_bbox: np.ndarray) -> Tuple[bool, str, dict]:
    """
    Zero-Trust Anti-Spoofing & Liveness Verification.
    Enforces strict Fail-Closed security:
    1. Rejects invalid, empty, or degenerate images and bounding boxes.
    2. Rejects small face crops below MIN_FACE_CROP_DIM (default: 60x60).
    3. Rejects low-contrast/solid color crops.
    4. Analyzes 2D FFT Moiré screen frequency harmonics.
    5. Analyzes chromatic sub-pixel stripe distortion and backlight glare.
    6. Fails closed on any analysis exception or uncertainty.

    Returns:
        (is_live: bool, rejection_reason: str, diagnostics: dict)
    """
    try:
        # 1. Validate image container
        if image_bgr is None or not isinstance(image_bgr, np.ndarray) or image_bgr.size == 0:
            return False, "Invalid image data provided for liveness verification.", {
                "status": "rejected_invalid_image",
                "error": "Image is None or empty"
            }

        if len(image_bgr.shape) < 2 or image_bgr.shape[0] < 10 or image_bgr.shape[1] < 10:
            return False, "Image dimensions are too small to contain a verifiable face.", {
                "status": "rejected_invalid_image_dimensions",
                "dimensions": image_bgr.shape if hasattr(image_bgr, "shape") else None
            }

        # 2. Validate face bounding box
        if face_bbox is None or not hasattr(face_bbox, "__len__") or len(face_bbox) < 4:
            return False, "Invalid or missing face bounding box for liveness verification.", {
                "status": "rejected_invalid_bbox"
            }

        try:
            x1, y1, x2, y2 = [int(v) for v in face_bbox[:4]]
        except (ValueError, TypeError) as e:
            return False, "Malformed face bounding box coordinates.", {
                "status": "rejected_malformed_bbox",
                "error": str(e)
            }

        bw = x2 - x1
        bh = y2 - y1
        if bw <= 0 or bh <= 0:
            return False, "Degenerate face bounding box detected (non-positive width or height).", {
                "status": "rejected_degenerate_bbox",
                "width": bw,
                "height": bh
            }

        h_img, w_img = image_bgr.shape[:2]

        # Extract bounding box coordinates with 10% context margin
        margin_x = int(bw * 0.10)
        margin_y = int(bh * 0.10)

        crop_x1 = max(0, x1 - margin_x)
        crop_y1 = max(0, y1 - margin_y)
        crop_x2 = min(w_img, x2 + margin_x)
        crop_y2 = min(h_img, y2 + margin_y)

        if crop_x2 <= crop_x1 or crop_y2 <= crop_y1:
            return False, "Face bounding box lies completely outside valid image boundaries.", {
                "status": "rejected_out_of_bounds",
                "crop": [crop_x1, crop_y1, crop_x2, crop_y2],
                "image_size": [w_img, h_img]
            }

        face_crop = image_bgr[crop_y1:crop_y2, crop_x1:crop_x2]

        # 3. Strict Fail-Closed Checks for Empty or Sub-resolution Crops
        if face_crop.size == 0:
            return False, "Empty face region extracted. Liveness verification rejected.", {
                "status": "rejected_empty_crop"
            }

        crop_h, crop_w = face_crop.shape[:2]
        if crop_w < MIN_FACE_CROP_DIM or crop_h < MIN_FACE_CROP_DIM:
            return False, (
                f"Face crop resolution ({crop_w}x{crop_h}) is too small for anti-spoofing verification "
                f"(minimum {MIN_FACE_CROP_DIM}x{MIN_FACE_CROP_DIM} required). Please hold the camera closer."
            ), {
                "status": "rejected_small_crop",
                "width": crop_w,
                "height": crop_h,
                "min_required": MIN_FACE_CROP_DIM
            }

        # 4. Image Quality & Contrast Check
        gray_crop = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY) if len(face_crop.shape) == 3 else face_crop
        std_dev = float(np.std(gray_crop))
        if std_dev < MIN_FACE_CONTRAST_STD:
            return False, "Face region has insufficient contrast or lighting for reliable verification. Please ensure proper lighting.", {
                "status": "rejected_low_contrast",
                "std_dev": round(std_dev, 2),
                "min_required": MIN_FACE_CONTRAST_STD
            }

        # 5. Check 1: 2D FFT Moiré pattern in frequency domain
        is_moire, peak_ratio, hf_ratio = detect_moire_patterns(face_crop)

        # 6. Check 2: Chromatic subpixel stripe distortion
        is_chroma, chroma_ratio = detect_chromatic_subpixel_distortion(face_crop)

        diag = {
            "status": "evaluated",
            "crop_resolution": [crop_w, crop_h],
            "contrast_std": round(std_dev, 2),
            "moire_detected": is_moire,
            "peak_ratio": round(peak_ratio, 3),
            "hf_energy_ratio": round(hf_ratio, 3),
            "chroma_spoof": is_chroma,
            "chroma_ratio": round(chroma_ratio, 3)
        }

        # If Moiré screen patterns or severe subpixel chromatic artifacts are detected
        if is_moire:
            return False, "Screen / Moiré pattern detected! Please capture your live face directly, not a photo displayed on a computer or mobile screen.", diag

        if is_chroma:
            return False, "Digital screen reflection detected! Please take a direct live selfie.", diag

        return True, "", diag

    except Exception as e:
        # Strict Fail-Closed: Never treat processing uncertainty as legitimate liveness!
        print(f"[AntiSpoof FATAL ERROR] Liveness verification failed: {e}")
        return False, "Liveness verification encountered an internal processing error. Verification rejected for security.", {
            "status": "rejected_processing_error",
            "error": str(e)
        }
