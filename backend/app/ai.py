import os
import numpy as np
from numpy.linalg import norm
import onnxruntime as ort

# Configurable InsightFace Detector Tuning for Large Classroom (300+ Students)
AI_FRAME_WIDTH = int(os.getenv("AI_FRAME_WIDTH", "960"))
AI_FRAME_HEIGHT = int(os.getenv("AI_FRAME_HEIGHT", "540"))
AI_DET_THRESH = float(os.getenv("INSIGHTFACE_DET_THRESH", os.getenv("AI_DET_THRESH", "0.15")))

det_size_raw = os.getenv("INSIGHTFACE_DET_SIZE", os.getenv("AI_DET_SIZE", "640")).strip()
if "," in det_size_raw:
    parts = det_size_raw.split(",")
    AI_DET_SIZE = (int(parts[0].strip()), int(parts[1].strip()))
else:
    size_val = int(det_size_raw)
    AI_DET_SIZE = (size_val, size_val)

# Initialize AI modules
app_fa = None
active_engine = "Disabled"

try:
    from insightface.app import FaceAnalysis
    
    # 1. Determine optimal hardware execution providers
    # Priority: Apple Neural Engine (CoreML) -> Nvidia GPU (CUDA) -> Windows GPU (DirectML) -> CPU
    available_providers = ort.get_available_providers()
    selected_providers = []
    
    if 'CoreMLExecutionProvider' in available_providers:
        # Apple Neural Engine (ANE) & Metal GPU Acceleration on Apple Silicon M1/M2/M3/M4
        selected_providers.append(('CoreMLExecutionProvider', {
            'enable_on_subgraph': 1,
            'coreml_flags': 0
        }))
    if 'CUDAExecutionProvider' in available_providers:
        # Nvidia GPU on Windows / Linux
        selected_providers.append('CUDAExecutionProvider')
    if 'DirectMLExecutionProvider' in available_providers:
        # DirectX GPU on Windows
        selected_providers.append('DirectMLExecutionProvider')
    
    # Universal fallback to standard CPU
    selected_providers.append('CPUExecutionProvider')
    
    # buffalo_sc provides ultra-fast inference with MobileFaceNet 512D embeddings
    app_fa = FaceAnalysis(name='buffalo_sc', allowed_modules=['detection', 'recognition'], providers=selected_providers)
    app_fa.prepare(ctx_id=-1, det_thresh=AI_DET_THRESH, det_size=AI_DET_SIZE)
    AI_ENABLED = True
    
    active_engine = selected_providers[0][0] if isinstance(selected_providers[0], tuple) else selected_providers[0]
    
    print("\n" + "="*60)
    print("  🚀 [AI ENGINE] InsightFace Initialization Summary")
    print("="*60)
    print(f"  • AI Frame Resolution : {AI_FRAME_WIDTH}x{AI_FRAME_HEIGHT}")
    print(f"  • Detector Size (det_size): {AI_DET_SIZE}")
    print(f"  • Detection Threshold : {AI_DET_THRESH}")
    print(f"  • Available Providers : {available_providers}")
    print(f"  • Selected Provider   : {active_engine}")
    print("="*60 + "\n")
except Exception as e:
    AI_ENABLED = False
    active_engine = "Disabled"
    print("WARNING: insightface failed to initialize. AI disabled:", e)


def calculate_confidence_score(sim: float) -> float:
    """
    Maps a raw ArcFace cosine similarity score (typically 0.42 to 0.75+ for valid matches)
    into an intuitive confidence score ranging from 0.80 to 0.99 for live reporting.
    """
    if sim < 0.42:
        return round(float(sim), 2)
    # Map [0.42, 0.75] to [0.80, 0.99]
    clamped_sim = min(max(sim, 0.42), 0.75)
    mapped = 0.80 + ((clamped_sim - 0.42) / (0.75 - 0.42)) * (0.99 - 0.80)
    return round(float(mapped), 2)
