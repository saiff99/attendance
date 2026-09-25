import numpy as np
from numpy.linalg import norm

# Initialize AI modules
app_fa = None
try:
    from insightface.app import FaceAnalysis
    # buffalo_l uses RetinaFace ResNet50 (det_10g) & ArcFace ResNet50 (w600k_r50)
    # This provides state-of-the-art detection for small, distant, and crowded faces in large halls
    app_fa = FaceAnalysis(name='buffalo_l', allowed_modules=['detection', 'recognition'])
    app_fa.prepare(ctx_id=-1, det_thresh=0.28, det_size=(960, 960))
    AI_ENABLED = True
    print("InsightFace High-Precision AI Engine (buffalo_l / RetinaFace 10G) Initialized successfully.")
except Exception as e:
    try:
        from insightface.app import FaceAnalysis
        app_fa = FaceAnalysis(name='buffalo_sc', allowed_modules=['detection', 'recognition'])
        app_fa.prepare(ctx_id=-1, det_thresh=0.35, det_size=(640, 640))
        AI_ENABLED = True
        print(f"Fallback to buffalo_sc AI Engine: {e}")
    except Exception as e2:
        AI_ENABLED = False
        print("WARNING: insightface not installed or failed to initialize. AI disabled:", e2)

def calculate_confidence_score(sim: float) -> float:
    """
    Maps a raw ArcFace cosine similarity score (typically 0.38 to 0.75+ for valid matches)
    into a polished, intuitive confidence score ranging from 0.70 to 0.99 for live reporting.
    """
    if sim < 0.38:
        return round(float(sim), 2)
    # Map [0.38, 0.75] to [0.70, 0.99]
    clamped_sim = min(max(sim, 0.38), 0.75)
    mapped = 0.70 + ((clamped_sim - 0.38) / (0.75 - 0.38)) * (0.99 - 0.70)
    return round(float(mapped), 2)
