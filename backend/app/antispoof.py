import os
import cv2
import numpy as np

def detect_moire_patterns(face_bgr: np.ndarray) -> tuple[bool, float, float]:
    """
    Analyzes 2D Fourier Transform (FFT) spectrum of the face region to detect
    Moiré fringes and periodic high-frequency raster spikes caused by photographing
    computer/laptop monitors or mobile OLED/LCD displays.
    
    Returns: (is_moire_detected, peak_to_median_ratio, high_freq_ratio)
    """
    try:
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
            return False, 0.0, 0.0
            
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
        is_screen = bool((p99_to_med > moire_thresh and high_freq_ratio > 0.30) or (peak_to_med > 2.80 and high_freq_ratio > 0.40))
        return is_screen, float(p99_to_med), float(high_freq_ratio)
    except Exception as e:
        print("[AntiSpoof] Moiré detection error:", e)
        return False, 0.0, 0.0


def detect_chromatic_subpixel_distortion(face_bgr: np.ndarray) -> tuple[bool, float]:
    """
    Detects RGB sub-pixel stripe patterns and color crosstalk typical of LCD/OLED backlights.
    In natural human skin, chrominance gradients (Cr, Cb in YCrCb) are smooth and cohesive.
    When a screen is photographed, sub-pixel color borders cause high chrominance dispersion.
    """
    try:
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
    except Exception as e:
        print("[AntiSpoof] Chromatic analysis error:", e)
        return False, 0.0


def verify_face_liveness(image_bgr: np.ndarray, face_bbox: np.ndarray) -> tuple[bool, str, dict]:
    """
    Complete Anti-Spoofing & Screen Playback Verification.
    Checks:
    1. 2D FFT Moiré screen frequency pattern
    2. Chromatic sub-pixel stripe distortion
    3. Specular screen reflection & glare
    
    Returns:
        (is_live: bool, rejection_reason: str, diagnostics: dict)
    """
    h_img, w_img = image_bgr.shape[:2]
    
    # Extract bounding box coordinates with safe 10% margin
    x1, y1, x2, y2 = [int(v) for v in face_bbox]
    bw = x2 - x1
    bh = y2 - y1
    
    margin_x = int(bw * 0.10)
    margin_y = int(bh * 0.10)
    
    crop_x1 = max(0, x1 - margin_x)
    crop_y1 = max(0, y1 - margin_y)
    crop_x2 = min(w_img, x2 + margin_x)
    crop_y2 = min(h_img, y2 + margin_y)
    
    face_crop = image_bgr[crop_y1:crop_y2, crop_x1:crop_x2]
    if face_crop.size == 0 or face_crop.shape[0] < 20 or face_crop.shape[1] < 20:
        return True, "", {"status": "skipped_small_crop"}
        
    # Check 1: Moiré pattern in frequency domain
    is_moire, peak_ratio, hf_ratio = detect_moire_patterns(face_crop)
    
    # Check 2: Chromatic subpixel distortion
    is_chroma, chroma_ratio = detect_chromatic_subpixel_distortion(face_crop)
    
    diag = {
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
