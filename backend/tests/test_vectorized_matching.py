import unittest
import os
import sys
import numpy as np
from numpy.linalg import norm
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.ai import match_faces_vectorized, calculate_confidence_score


class MockFace:
    def __init__(self, embedding, det_score=0.95):
        self.embedding = embedding
        self.det_score = det_score


class TestVectorizedFaceMatching(unittest.TestCase):
    """
    Exhaustive unit test suite for Vectorized 2D Matrix Cosine Matching (InsightFace 512D ArcFace).
    Verifies mathematical equivalence, strict thresholding, deduplication, and performance.
    """

    def setUp(self):
        np.random.seed(42)
        # Create 5 distinct students with normalized 512D unit embeddings
        self.students = []
        for i in range(5):
            vec = np.random.randn(512).astype(np.float32)
            vec = vec / float(norm(vec))
            self.students.append({
                "id": f"student-uuid-{i+1}",
                "student_roll": f"ROLL-{100+i}",
                "full_name": f"Student {i+1}",
                "academic_year": "2024-2028",
                "face_encoding": vec.tolist()
            })

    def test_single_face_exact_match(self):
        """Test exact embedding match produces expected student and confidence >= 0.95."""
        target = self.students[0]
        probe = np.array(target["face_encoding"], dtype=np.float32)
        face = MockFace(embedding=probe, det_score=0.98)

        results = match_faces_vectorized([face], self.students, similarity_threshold=0.42)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], target["id"])
        self.assertEqual(results[0]["full_name"], target["full_name"])
        # For identical vectors, similarity is 1.0, confidence maps to 0.99
        self.assertEqual(results[0]["confidence"], 0.99)

    def test_multiple_faces_distinct_students(self):
        """Test batch of faces correctly matches respective students in a single pass."""
        faces = [
            MockFace(embedding=np.array(self.students[0]["face_encoding"]), det_score=0.90),
            MockFace(embedding=np.array(self.students[2]["face_encoding"]), det_score=0.92),
            MockFace(embedding=np.array(self.students[4]["face_encoding"]), det_score=0.88),
        ]

        results = match_faces_vectorized(faces, self.students, similarity_threshold=0.42)
        self.assertEqual(len(results), 3)
        matched_ids = [r["id"] for r in results]
        self.assertIn(self.students[0]["id"], matched_ids)
        self.assertIn(self.students[2]["id"], matched_ids)
        self.assertIn(self.students[4]["id"], matched_ids)

    def test_threshold_boundary_conditions(self):
        """Verify strict cutoff at 0.42: 0.41 rejected, 0.43 accepted."""
        target_vec = np.array(self.students[0]["face_encoding"], dtype=np.float32)

        # Generate an orthogonal vector to blend with
        rand_vec = np.random.randn(512).astype(np.float32)
        ortho_vec = rand_vec - np.dot(rand_vec, target_vec) * target_vec
        ortho_vec = ortho_vec / float(norm(ortho_vec))

        # Blend target_vec and ortho_vec to achieve exact target cosine similarities:
        # sim = cos(theta). v = cos(theta)*target + sin(theta)*ortho
        # For sim = 0.41:
        cos_theta_41 = 0.41
        sin_theta_41 = np.sqrt(1.0 - cos_theta_41**2)
        probe_41 = cos_theta_41 * target_vec + sin_theta_41 * ortho_vec
        sim_check_41 = float(np.dot(probe_41, target_vec))
        self.assertAlmostEqual(sim_check_41, 0.41, places=4)

        face_below = MockFace(embedding=probe_41, det_score=0.95)
        res_below = match_faces_vectorized([face_below], self.students, similarity_threshold=0.42)
        self.assertEqual(len(res_below), 0, "Similarity 0.41 must NOT trigger a match when threshold is 0.42")

        # For sim = 0.43:
        cos_theta_43 = 0.43
        sin_theta_43 = np.sqrt(1.0 - cos_theta_43**2)
        probe_43 = cos_theta_43 * target_vec + sin_theta_43 * ortho_vec
        sim_check_43 = float(np.dot(probe_43, target_vec))
        self.assertAlmostEqual(sim_check_43, 0.43, places=4)

        face_above = MockFace(embedding=probe_43, det_score=0.95)
        res_above = match_faces_vectorized([face_above], self.students, similarity_threshold=0.42)
        self.assertEqual(len(res_above), 1, "Similarity 0.43 must trigger a match when threshold is 0.42")
        self.assertEqual(res_above[0]["id"], self.students[0]["id"])

    def test_duplicate_face_deduplication(self):
        """Verify that multiple detections of the same student yield only 1 attendance entry."""
        # 3 detections of the exact same student (e.g. multi-crop / overlap)
        probe = np.array(self.students[1]["face_encoding"], dtype=np.float32)
        faces = [
            MockFace(embedding=probe, det_score=0.95),
            MockFace(embedding=probe, det_score=0.85),
            MockFace(embedding=probe, det_score=0.75),
        ]

        results = match_faces_vectorized(faces, self.students, similarity_threshold=0.42)
        self.assertEqual(len(results), 1, "Duplicate detections of the same student must be deduplicated")
        self.assertEqual(results[0]["id"], self.students[1]["id"])

    def test_low_detector_score_rejection(self):
        """Verify faces with det_score < 0.20 are safely ignored."""
        probe = np.array(self.students[0]["face_encoding"], dtype=np.float32)
        face = MockFace(embedding=probe, det_score=0.15)  # Below 0.20

        results = match_faces_vectorized([face], self.students, similarity_threshold=0.42, det_score_threshold=0.20)
        self.assertEqual(len(results), 0, "Low det_score (<0.20) must be discarded")

    def test_empty_and_malformed_inputs(self):
        """Verify graceful error-free handling of edge cases (empty lists, None, zero norms)."""
        self.assertEqual(match_faces_vectorized([], self.students), [])
        self.assertEqual(match_faces_vectorized([MockFace(embedding=None)], self.students), [])
        self.assertEqual(match_faces_vectorized([MockFace(embedding=np.zeros(512))], self.students), [])
        self.assertEqual(match_faces_vectorized([MockFace(embedding=np.ones(512))], []), [])

    def test_equivalence_with_legacy_sequential_loop(self):
        """Mathematical proof of equivalence between vectorized 2D matrix dot product and legacy loop."""
        probe = np.random.randn(512).astype(np.float32)
        probe = probe / float(norm(probe))
        face = MockFace(embedding=probe, det_score=0.90)

        # 1. Legacy loop implementation
        legacy_matched = []
        highest_sim = 0.42
        best_match = None
        for student in self.students:
            known = np.array(student['face_encoding'])
            sim = float(np.dot(known, probe) / (norm(known) * norm(probe)))
            if sim > highest_sim:
                highest_sim = sim
                best_match = student
        if best_match:
            legacy_matched.append({
                **best_match,
                "confidence": calculate_confidence_score(highest_sim)
            })

        # 2. Vectorized 2D matrix implementation
        vectorized_matched = match_faces_vectorized([face], self.students, similarity_threshold=0.42)

        self.assertEqual(len(legacy_matched), len(vectorized_matched))
        if legacy_matched:
            self.assertEqual(legacy_matched[0]["id"], vectorized_matched[0]["id"])
            self.assertEqual(legacy_matched[0]["confidence"], vectorized_matched[0]["confidence"])

    def test_performance_benchmark(self):
        """Benchmark 50 faces across 300 enrolled students to confirm high-speed execution."""
        large_roster = []
        for i in range(300):
            v = np.random.randn(512).astype(np.float32)
            large_roster.append({
                "id": f"student-{i}",
                "face_encoding": (v / float(norm(v))).tolist()
            })

        faces = []
        for j in range(50):
            v = np.random.randn(512).astype(np.float32)
            faces.append(MockFace(embedding=v / float(norm(v)), det_score=0.95))

        # Time vectorized matching
        t0 = time.perf_counter()
        results = match_faces_vectorized(faces, large_roster, similarity_threshold=0.42)
        t_vec = time.perf_counter() - t0

        # Vectorized matching for 50 faces x 300 students must complete in under 50ms (typically <5ms)
        self.assertLess(t_vec, 0.050, f"Vectorized matching took too long: {t_vec*1000:.2f}ms")


if __name__ == "__main__":
    unittest.main()
