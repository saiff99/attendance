import numpy as np
from numpy.linalg import norm

# Initialize AI modules
app_fa = None
try:
    from insightface.app import FaceAnalysis
    # buffalo_sc provides ultra-fast (15ms) inference with MobileFaceNet 512D embeddings
    # det_thresh=0.20 enables high recall for small and distant faces in lecture halls
    app_fa = FaceAnalysis(name='buffalo_sc', allowed_modules=['detection', 'recognition'])
    app_fa.prepare(ctx_id=-1, det_thresh=0.20, det_size=(1024, 1024))
    AI_ENABLED = True
    print("InsightFace AI Engine (buffalo_sc / MobileFaceNet 512D @ 1024x1024) Initialized successfully.")
except Exception as e:
    AI_ENABLED = False
    print("WARNING: insightface failed to initialize. AI disabled:", e)

def calculate_confidence_score(sim: float) -> float:
    """
    Maps a raw ArcFace cosine similarity score (typically 0.28 to 0.70+ for valid matches)
    into a polished, intuitive confidence score ranging from 0.75 to 0.99 for live reporting.
    """
    if sim < 0.28:
        return round(float(sim), 2)
    # Map [0.28, 0.70] to [0.75, 0.99]
    clamped_sim = min(max(sim, 0.28), 0.70)
    mapped = 0.75 + ((clamped_sim - 0.28) / (0.70 - 0.28)) * (0.99 - 0.75)
    return round(float(mapped), 2)
