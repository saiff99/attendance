"""
Automated Test Suite for Anti-Spoofing & Liveness Verification
Covers:
- Invalid, None, or empty image inputs
- Invalid, malformed, or degenerate bounding boxes
- Out-of-bounds bounding boxes
- Empty crop extraction
- Small crop rejection (sub-resolution bypass prevention)
- Low-contrast / solid-color image rejection
- Screen Moiré frequency pattern detection (spoof rejection)
- Genuine natural live face verification (successful pass)
"""

import sys
import numpy as np
import cv2
from app.antispoof import verify_face_liveness, detect_moire_patterns, detect_chromatic_subpixel_distortion, MIN_FACE_CROP_DIM


def test_suite():
    print("=" * 65)
    print("🛡️  Running Anti-Spoofing & Liveness Verification Security Tests")
    print("=" * 65)

    passed = 0
    total = 0

    def assert_test(condition: bool, name: str, details: str = ""):
        nonlocal passed, total
        total += 1
        if condition:
            passed += 1
            print(f"  ✅ PASS: {name}")
        else:
            print(f"  ❌ FAIL: {name} - {details}")

    # Test 1: None image input
    is_live, reason, diag = verify_face_liveness(None, np.array([50, 50, 200, 200]))
    assert_test(not is_live and diag.get("status") == "rejected_invalid_image", "Reject None image input", f"Got is_live={is_live}, diag={diag}")

    # Test 2: Empty numpy array image
    empty_img = np.zeros((0, 0, 3), dtype=np.uint8)
    is_live, reason, diag = verify_face_liveness(empty_img, np.array([10, 10, 50, 50]))
    assert_test(not is_live and "rejected_invalid_image" in diag.get("status", ""), "Reject empty image array", f"Got is_live={is_live}")

    # Test 3: None or malformed bounding box
    valid_img = np.zeros((400, 400, 3), dtype=np.uint8)
    is_live, reason, diag = verify_face_liveness(valid_img, None)
    assert_test(not is_live and diag.get("status") == "rejected_invalid_bbox", "Reject None bounding box", f"Got is_live={is_live}")

    is_live, reason, diag = verify_face_liveness(valid_img, np.array([10, 20]))
    assert_test(not is_live and diag.get("status") == "rejected_invalid_bbox", "Reject malformed bbox (< 4 coords)", f"Got is_live={is_live}")

    # Test 4: Degenerate bounding box (width or height <= 0)
    is_live, reason, diag = verify_face_liveness(valid_img, np.array([100, 100, 50, 50]))
    assert_test(not is_live and diag.get("status") == "rejected_degenerate_bbox", "Reject inverted / degenerate bbox", f"Got is_live={is_live}")

    is_live, reason, diag = verify_face_liveness(valid_img, np.array([100, 100, 100, 200]))
    assert_test(not is_live and diag.get("status") == "rejected_degenerate_bbox", "Reject zero-width bbox", f"Got is_live={is_live}")

    # Test 5: Out of bounds bounding box
    is_live, reason, diag = verify_face_liveness(valid_img, np.array([500, 500, 600, 600]))
    assert_test(not is_live and ("rejected_out_of_bounds" in diag.get("status", "") or "rejected_empty_crop" in diag.get("status", "")), "Reject out-of-bounds bbox", f"Got is_live={is_live}")

    # Test 6: Small face crop (Old Vulnerability: was previously returning True!)
    # A 15x15 crop MUST be strictly rejected now
    test_img = np.random.randint(50, 200, (400, 400, 3), dtype=np.uint8)
    small_bbox = np.array([100, 100, 115, 115])  # 15x15 face box
    is_live, reason, diag = verify_face_liveness(test_img, small_bbox)
    assert_test(not is_live and diag.get("status") == "rejected_small_crop", f"Strictly REJECT small face crop (< {MIN_FACE_CROP_DIM}px)", f"Got is_live={is_live}, diag={diag}")

    # Test 7: Another sub-resolution crop (30x30)
    sub_bbox = np.array([50, 50, 80, 80])  # 30x30 face box
    is_live, reason, diag = verify_face_liveness(test_img, sub_bbox)
    assert_test(not is_live and diag.get("status") == "rejected_small_crop", f"Strictly REJECT 30x30 crop (< {MIN_FACE_CROP_DIM}px)", f"Got is_live={is_live}")

    # Test 8: Low-contrast / Solid black crop
    black_img = np.zeros((400, 400, 3), dtype=np.uint8)
    large_bbox = np.array([50, 50, 250, 250])  # 200x200 solid black
    is_live, reason, diag = verify_face_liveness(black_img, large_bbox)
    assert_test(not is_live and diag.get("status") == "rejected_low_contrast", "Reject solid black / zero-contrast face crop", f"Got is_live={is_live}, diag={diag}")

    # Test 9: Screen Moiré Pattern Simulation (High frequency periodic raster spikes)
    moire_img = np.zeros((400, 400, 3), dtype=np.uint8)
    # Generate high-frequency sine grating characteristic of mobile display subpixel grids
    x_coords = np.arange(400)
    y_coords = np.arange(400)
    xx, yy = np.meshgrid(x_coords, y_coords)
    grating = (np.sin(xx * 0.8) * np.sin(yy * 0.8) * 120 + 128).astype(np.uint8)
    moire_img[:, :, 0] = grating
    moire_img[:, :, 1] = grating
    moire_img[:, :, 2] = grating
    is_live, reason, diag = verify_face_liveness(moire_img, np.array([50, 50, 300, 300]))
    assert_test(not is_live and diag.get("moire_detected") is True, "Detect simulated high-frequency screen Moiré pattern", f"Got is_live={is_live}, diag={diag}")

    # Test 10: Genuine Live Face Crop (Realistic smooth gradients & natural skin tone)
    # Create natural skin gradient with healthy variance and realistic frequency spectrum
    real_face = np.zeros((400, 400, 3), dtype=np.uint8)
    # Natural skin tones (BGR: ~140, 170, 210)
    for i in range(400):
        for j in range(400):
            # Smooth radial gradient simulating face contours
            dist = np.sqrt((i - 200) ** 2 + (j - 200) ** 2)
            factor = max(0.6, 1.0 - dist / 300.0)
            real_face[i, j, 0] = int(140 * factor + (i % 7))
            real_face[i, j, 1] = int(170 * factor + (j % 5))
            real_face[i, j, 2] = int(210 * factor + ((i + j) % 9))

    is_live, reason, diag = verify_face_liveness(real_face, np.array([50, 50, 350, 350]))
    assert_test(is_live is True and diag.get("status") == "evaluated", "Accept genuine live face with natural contrast & spectrum", f"Got is_live={is_live}, reason={reason}, diag={diag}")

    # Test 11: MiniFASNet Deep-Learning Evaluation Verification
    assert_test(
        diag.get("minifasnet_evaluated") is True and diag.get("minifasnet_real") is True,
        "MiniFASNet ONNX engine evaluates live face with high confidence (> 0.60)",
        f"Diag: {diag}"
    )

    # Test 12: MiniFASNet Rejection on Replay Attack / Synthetic Screen Grating
    is_live_moire, reason_moire, diag_moire = verify_face_liveness(moire_img, np.array([50, 50, 300, 300]))
    assert_test(
        not is_live_moire and diag_moire.get("minifasnet_real") is False,
        "MiniFASNet ONNX engine strictly detects and blocks fake face presentation attack",
        f"Diag: {diag_moire}"
    )

    print("=" * 65)
    print(f"📊 Anti-Spoofing Test Summary: {passed}/{total} Passed")
    print("=" * 65)

    if passed == total:
        return 0
    else:
        return 1


if __name__ == "__main__":
    sys.exit(test_suite())
