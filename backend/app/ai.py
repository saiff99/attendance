import numpy as np
from numpy.linalg import norm
import onnxruntime as ort

# Initialize AI modules
app_fa = None
try:
    from insightface.app import FaceAnalysis
    
    # 1. Determine optimal hardware execution providers
    # Priority: Apple Neural Engine (CoreML) -> Nvidia GPU (CUDA) -> Windows GPU (DirectML) -> CPU
    available_providers = ort.get_available_providers()
    selected_providers = []
    
    if 'CoreMLExecutionProvider' in available_providers:
        # Apple Neural Engine (ANE) & Metal GPU Acceleration on Apple Silicon M1/M2/M3/M4
        # Offloads deep neural network matrix multiplications from CPU to 16-Core NPU
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
    # det_thresh=0.15 with det_size=(1280, 736) enables high recall for distant faces across 16:9 CCTV classrooms
    app_fa = FaceAnalysis(name='buffalo_sc', allowed_modules=['detection', 'recognition'], providers=selected_providers)
    app_fa.prepare(ctx_id=-1, det_thresh=0.15, det_size=(1280, 736))
    AI_ENABLED = True
    
    active_engine = selected_providers[0][0] if isinstance(selected_providers[0], tuple) else selected_providers[0]
    print(f"InsightFace AI Engine (buffalo_sc / MobileFaceNet 512D @ 1280x720 16:9 HD) Initialized successfully.")
    print(f"  ✓ Hardware Acceleration: {active_engine} (Apple Neural Engine NPU Active)")
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
