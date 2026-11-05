import unittest
import os
import sys
import time
from unittest.mock import MagicMock, patch
import threading

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import app.biometric_cache as bc


class TestBiometricCache(unittest.TestCase):
    """
    Exhaustive unit test suite for In-Memory Biometric Vector Caching with Invalidation Hooks.
    Verifies TTL freshness, thread safety, cohort filtering, fault-tolerant fallback, and instant invalidation.
    """

    def setUp(self):
        # Reset cache state before each test
        bc.invalidate_biometric_cache(None)

        self.mock_students_data = [
            {
                "id": "student-1",
                "full_name": "Rahim Ahmed",
                "academic_year": "1st Year MBBS",
                "is_active": True,
                "face_encoding": [0.1] * 512
            },
            {
                "id": "student-2",
                "full_name": "Karim Hossain",
                "academic_year": "2nd Year MBBS",
                "is_active": True,
                "face_encoding": [0.2] * 512
            },
            {
                "id": "student-3",
                "full_name": "Fatima Begum",
                "academic_year": "1st Year MBBS (Group B)",
                "is_active": True,
                "face_encoding": [0.3] * 512
            },
            {
                "id": "student-archived",
                "full_name": "Archived Student",
                "academic_year": "[ARCHIVED] 2023",
                "is_active": False,
                "face_encoding": [0.4] * 512
            }
        ]

    def tearDown(self):
        bc.invalidate_biometric_cache(None)

    def test_cache_population_and_hit(self):
        """Verify initial call loads from Supabase, subsequent calls hit in-memory cache without DB queries."""
        mock_query = MagicMock()
        mock_response = MagicMock()
        mock_response.data = self.mock_students_data
        mock_query.execute.return_value = mock_response

        with patch.object(bc, "supabase") as mock_sb:
            mock_sb.table.return_value.select.return_value.not_.is_.return_value = mock_query

            # First call: populates cache from DB
            t0 = time.perf_counter()
            res1 = bc.get_cached_enrolled_students(target_academic_year="All")
            t_first = time.perf_counter() - t0

            # 3 active non-archived students
            self.assertEqual(len(res1), 3)
            self.assertEqual(mock_query.execute.call_count, 1)

            # Second call: served from memory cache (0ms)
            t0 = time.perf_counter()
            res2 = bc.get_cached_enrolled_students(target_academic_year="All")
            t_cached = time.perf_counter() - t0

            self.assertEqual(len(res2), 3)
            # Call count should STILL be 1 (zero additional DB hits)
            self.assertEqual(mock_query.execute.call_count, 1)
            self.assertLess(t_cached, 0.005, "Cached retrieval must take < 5ms")

    def test_cohort_filtering_from_cache(self):
        """Verify cohort filtering works cleanly on cached records."""
        mock_query = MagicMock()
        mock_response = MagicMock()
        mock_response.data = self.mock_students_data
        mock_query.execute.return_value = mock_response

        with patch.object(bc, "supabase") as mock_sb:
            mock_sb.table.return_value.select.return_value.not_.is_.return_value = mock_query

            # Query 1st Year (Group B)
            res_group_b = bc.get_cached_enrolled_students(target_academic_year="1st Year MBBS (Group B)")
            self.assertEqual(len(res_group_b), 1)
            self.assertEqual(res_group_b[0]["id"], "student-3")

            # Query 2nd Year
            res_2nd = bc.get_cached_enrolled_students(target_academic_year="2nd Year MBBS")
            self.assertEqual(len(res_2nd), 1)
            self.assertEqual(res_2nd[0]["id"], "student-2")

            # Query All
            res_all = bc.get_cached_enrolled_students(target_academic_year="All")
            self.assertEqual(len(res_all), 3)

    def test_instant_invalidation_by_student_id(self):
        """Verify invalidate_biometric_cache(student_id) removes target student instantly."""
        mock_query = MagicMock()
        mock_response = MagicMock()
        mock_response.data = self.mock_students_data
        mock_query.execute.return_value = mock_response

        with patch.object(bc, "supabase") as mock_sb:
            mock_sb.table.return_value.select.return_value.not_.is_.return_value = mock_query

            # Populate cache
            bc.get_cached_enrolled_students()
            stats_before = bc.get_biometric_cache_stats()
            self.assertEqual(stats_before["cached_students_count"], 3)

            # Invalidate student-1 (e.g. upon biometric consent revocation)
            inv_res = bc.invalidate_biometric_cache("student-1")
            self.assertTrue(inv_res["success"])

            # Verify student-1 is immediately gone from in-memory cache
            stats_after = bc.get_biometric_cache_stats()
            self.assertEqual(stats_after["cached_students_count"], 2)

    def test_full_invalidation(self):
        """Verify invalidate_biometric_cache(None) purges all cached vectors."""
        mock_query = MagicMock()
        mock_response = MagicMock()
        mock_response.data = self.mock_students_data
        mock_query.execute.return_value = mock_response

        with patch.object(bc, "supabase") as mock_sb:
            mock_sb.table.return_value.select.return_value.not_.is_.return_value = mock_query

            bc.get_cached_enrolled_students()
            self.assertEqual(bc.get_biometric_cache_stats()["cached_students_count"], 3)

            # Invalidate all
            bc.invalidate_biometric_cache(None)
            stats = bc.get_biometric_cache_stats()
            self.assertEqual(stats["cached_students_count"], 0)
            self.assertFalse(stats["is_warm"])

    def test_ttl_expiration_re_fetches(self):
        """Verify cache automatically re-queries Supabase when TTL expires."""
        mock_query = MagicMock()
        mock_response = MagicMock()
        mock_response.data = self.mock_students_data
        mock_query.execute.return_value = mock_response

        with patch.object(bc, "supabase") as mock_sb:
            mock_sb.table.return_value.select.return_value.not_.is_.return_value = mock_query

            # First fetch
            bc.get_cached_enrolled_students()
            self.assertEqual(mock_query.execute.call_count, 1)

            # Artificially age the cache past TTL (60s)
            bc._cache_last_fetched = time.time() - 65.0

            # Second fetch should trigger re-query due to TTL expiry
            bc.get_cached_enrolled_students()
            self.assertEqual(mock_query.execute.call_count, 2)

    def test_fault_tolerant_stale_cache_on_db_outage(self):
        """Verify that if Supabase network drops, warm in-memory cache is served gracefully."""
        mock_query = MagicMock()
        mock_response = MagicMock()
        mock_response.data = self.mock_students_data
        mock_query.execute.return_value = mock_response

        with patch.object(bc, "supabase") as mock_sb:
            mock_sb.table.return_value.select.return_value.not_.is_.return_value = mock_query

            # 1. Warm cache
            res1 = bc.get_cached_enrolled_students()
            self.assertEqual(len(res1), 3)

            # 2. Simulate DB crash on forced refresh
            mock_query.execute.side_effect = ConnectionError("Supabase network timeout")

            # 3. Must serve stale cache without raising exception
            res2 = bc.get_cached_enrolled_students(force_refresh=True)
            self.assertEqual(len(res2), 3)
            self.assertEqual(res2[0]["id"], "student-1")

    def test_thread_safe_concurrent_access(self):
        """Verify concurrent multi-threaded requests do not corrupt cache or cause stampedes."""
        mock_query = MagicMock()
        mock_response = MagicMock()
        mock_response.data = self.mock_students_data
        mock_query.execute.return_value = mock_response

        with patch.object(bc, "supabase") as mock_sb:
            mock_sb.table.return_value.select.return_value.not_.is_.return_value = mock_query

            threads = []
            results = []

            def worker():
                res = bc.get_cached_enrolled_students()
                results.append(len(res))

            for _ in range(10):
                t = threading.Thread(target=worker)
                threads.append(t)
                t.start()

            for t in threads:
                t.join()

            self.assertEqual(len(results), 10)
            self.assertTrue(all(r == 3 for r in results))
            # Exactly 1 DB execution despite 10 simultaneous threads
            self.assertEqual(mock_query.execute.call_count, 1)

    def test_stream_delegates_to_centralized_biometric_cache(self):
        """Verify stream.py's get_enrolled_data delegates to get_cached_enrolled_students (Issue 11)."""
        import app.stream as stream_mod

        # Reset stream state
        stream_mod.session_enrolled_cache.clear()
        stream_mod.session_matrix_cache.clear()
        stream_mod.session_last_fetch.clear()

        mock_session_query = MagicMock()
        mock_session_res = MagicMock()
        mock_session_res.data = [{"target_academic_year": "1st Year MBBS"}]
        mock_session_query.execute.return_value = mock_session_res

        with patch.object(stream_mod, "supabase") as mock_sb:
            mock_sb.table.return_value.select.return_value.eq.return_value = mock_session_query

            with patch("app.biometric_cache.get_cached_enrolled_students") as mock_get_cached:
                mock_get_cached.return_value = [
                    {
                        "id": "student-1",
                        "full_name": "Rahim Ahmed",
                        "student_roll": "101",
                        "academic_year": "1st Year MBBS",
                        "is_active": True,
                        "biometric_consent": True,
                        "face_encoding": [0.1] * 512
                    }
                ]

                enrolled, matrix = stream_mod.get_enrolled_data("test-session-123")

                # Verify get_cached_enrolled_students was called with target_academic_year
                mock_get_cached.assert_called_once_with(target_academic_year="1st Year MBBS")
                self.assertEqual(len(enrolled), 1)
                self.assertEqual(enrolled[0]["id"], "student-1")
                self.assertIsNotNone(matrix)
                self.assertEqual(matrix.shape, (1, 512))

                # Verify clean cache hit on subsequent call
                enrolled2, matrix2 = stream_mod.get_enrolled_data("test-session-123")
                # Still called only once due to stream session cache within 60s
                self.assertEqual(mock_get_cached.call_count, 1)

    def test_pre_stacked_normalized_matrix_caching(self):
        """Verify get_cached_enrolled_data returns pre-stacked normalized 2D matrix and caches it."""
        mock_query = MagicMock()
        mock_response = MagicMock()
        mock_response.data = self.mock_students_data
        mock_query.execute.return_value = mock_response

        with patch.object(bc, "supabase") as mock_sb:
            mock_sb.table.return_value.select.return_value.not_.is_.return_value = mock_query

            # First call: computes and caches 2D matrix
            students, matrix = bc.get_cached_enrolled_data(target_academic_year="All")
            self.assertEqual(len(students), 3)
            self.assertIsNotNone(matrix)
            self.assertEqual(matrix.shape, (3, 512))

            # Verify each vector in matrix is pre-normalized (L2 norm == 1.0)
            from numpy.linalg import norm
            for i in range(matrix.shape[0]):
                row_norm = float(norm(matrix[i]))
                self.assertAlmostEqual(row_norm, 1.0, places=5)

            # Second call: served from in-memory matrix cache
            students2, matrix2 = bc.get_cached_enrolled_data(target_academic_year="All")
            self.assertEqual(len(students2), 3)
            self.assertIs(matrix2, matrix, "Matrix object must be cached identity in RAM")

            # Check stats
            stats = bc.get_biometric_cache_stats()
            self.assertIn("All", stats["cached_matrix_cohorts"])

            # Invalidate cache
            bc.invalidate_biometric_cache()
            stats_after = bc.get_biometric_cache_stats()
            self.assertEqual(len(stats_after["cached_matrix_cohorts"]), 0)


if __name__ == "__main__":
    unittest.main()

