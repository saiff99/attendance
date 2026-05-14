import numpy as np
from numpy.linalg import norm

# Initialize AI modules
app_fa = None
try:
    from insightface.app import FaceAnalysis
    app_fa = FaceAnalysis(name='buffalo_sc')
    app_fa.prepare(ctx_id=0, det_size=(640, 640))
    AI_ENABLED = True
    print("InsightFace AI Engine Initialized successfully.")
except ImportError:
    AI_ENABLED = False
    print("WARNING: insightface not installed. AI disabled.")

def calculate_confidence_score(sim: float) -> float:
    """
    Maps a raw ArcFace cosine similarity score (typically 0.42 to 0.75+ for valid matches)
    into a polished, intuitive confidence score ranging from 0.70 to 0.99 for live reporting.
    """
    if sim < 0.42:
        return round(float(sim), 2)
    # Map [0.42, 0.75] to [0.70, 0.99]
    clamped_sim = min(max(sim, 0.42), 0.75)
    mapped = 0.70 + ((clamped_sim - 0.42) / (0.75 - 0.42)) * (0.99 - 0.70)
    return round(float(mapped), 2)
