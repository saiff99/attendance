import os
import numpy as np
from numpy.linalg import norm
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
ort = None

try:
    import onnxruntime as ort
    from insightface.app import FaceAnalysis
    
    # 1. Determine optimal hardware execution providers
    # Priority: Apple Neural Engine (CoreML) -> Nvidia GPU (CUDA) -> Windows GPU (DirectML) -> CPU
    available_providers = ort.get_available_providers() if ort else []
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


def match_faces_vectorized(
    faces: list,
    enrolled_students: list,
    similarity_threshold: float = 0.42,
    det_score_threshold: float = 0.20
) -> list:
    """
    Vectorized 2D Matrix Cosine Similarity matching for batch face recognition.
    Accelerated via NumPy BLAS / AVX2 matrix operations (O(1) matrix multiplication).
    
    Args:
        faces: List of detected face objects (InsightFace Face objects or objects with .embedding and optional .det_score)
        enrolled_students: List of student dicts containing 'face_encoding' and 'id'
        similarity_threshold: Cosine similarity threshold (default 0.42 for ArcFace 512D)
        det_score_threshold: Minimum face detection confidence to consider (default 0.20)
        
    Returns:
        List of matched student dicts with added 'confidence' score, deduplicated by student id.
    """
    if not faces or not enrolled_students:
        return []

    # 1. Stack enrolled students into a normalized 2D matrix for vectorized matching
    valid_students = []
    valid_encodings = []
    legacy_students = []

    for s in enrolled_students:
        enc = s.get("face_encoding")
        if enc is not None:
            if isinstance(enc, (list, np.ndarray)) and len(enc) == 512:
                arr = np.asarray(enc, dtype=np.float32)
                arr_norm = float(norm(arr))
                if arr_norm > 1e-6:
                    valid_encodings.append(arr / arr_norm)
                    valid_students.append(s)
                    continue
            # Legacy or non-standard dimension
            legacy_students.append(s)

    has_matrix = len(valid_encodings) > 0
    enc_matrix = np.vstack(valid_encodings) if has_matrix else None

    recognized = []

    for face in faces:
        if hasattr(face, 'det_score') and face.det_score is not None and face.det_score < det_score_threshold:
            continue

        unknown_encoding = getattr(face, 'embedding', None)
        if unknown_encoding is None:
            continue

        best_match_student = None
        highest_sim = float(similarity_threshold)

        # Fast Vectorized 2D Matrix Path (AVX2/BLAS accelerated)
        if has_matrix and enc_matrix is not None and len(unknown_encoding) == 512:
            unknown_arr = np.asarray(unknown_encoding, dtype=np.float32)
            unknown_norm = float(norm(unknown_arr))
            if unknown_norm > 1e-6:
                unknown_unit = unknown_arr / unknown_norm
                sims = np.dot(enc_matrix, unknown_unit)
                best_idx = int(np.argmax(sims))
                max_sim = float(sims[best_idx])
                if max_sim >= highest_sim:
                    highest_sim = max_sim
                    best_match_student = valid_students[best_idx]

        # Safe fallback for any legacy student records with non-512D vectors
        if legacy_students:
            for student in legacy_students:
                try:
                    known_encoding = np.asarray(student['face_encoding'])
                    if known_encoding.shape != np.asarray(unknown_encoding).shape:
                        continue
                    norm_prod = norm(known_encoding) * norm(unknown_encoding)
                    if norm_prod > 1e-6:
                        sim = float(np.dot(known_encoding, unknown_encoding) / norm_prod)
                        if sim > highest_sim:
                            highest_sim = sim
                            best_match_student = student
                except Exception:
                    continue

        if best_match_student:
            # Avoid duplicates in the same scan
            if not any(s['id'] == best_match_student['id'] for s in recognized):
                recognized.append({
                    **best_match_student,
                    "confidence": calculate_confidence_score(float(highest_sim))
                })

    return recognized

