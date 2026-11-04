import unittest
from unittest.mock import MagicMock, patch
import time

from app.session_cache import (
    get_cached_session_metadata,
    invalidate_backend_session_cache,
    SESSION_METADATA_CACHE_TTL_SECONDS,
)


class TestBackendSessionCache(unittest.TestCase):
    def setUp(self):
        invalidate_backend_session_cache()

    def tearDown(self):
        invalidate_backend_session_cache()

    def test_empty_or_invalid_session_id(self):
        self.assertIsNone(get_cached_session_metadata(""))
        self.assertIsNone(get_cached_session_metadata("   "))
        self.assertIsNone(get_cached_session_metadata(None))

    @patch("app.session_cache.supabase")
    def test_cache_hit_within_ttl(self, mock_supabase):
        mock_query = MagicMock()
        mock_res = MagicMock()
        mock_res.data = [{
            "id": "sess-test-1",
            "class_name": "Anatomy 101",
            "start_time": "2026-11-04T10:00:00Z",
            "created_at": "2026-11-04T10:00:00Z",
            "target_academic_year": "1st Year MBBS",
            "is_archived": False,
            "instructor_name": "Dr. Roy [GPS:22.5726,88.3639,200,1]"
        }]
        mock_query.execute.return_value = mock_res
        mock_supabase.table.return_value.select.return_value.eq.return_value = mock_query

        # 1st call -> Cache miss, queries DB
        first = get_cached_session_metadata("sess-test-1")
        self.assertIsNotNone(first)
        self.assertEqual(first["class_name"], "Anatomy 101")
        self.assertEqual(mock_query.execute.call_count, 1)

        # 2nd call -> Cache hit, does NOT query DB again
        second = get_cached_session_metadata("sess-test-1")
        self.assertIsNotNone(second)
        self.assertEqual(second["class_name"], "Anatomy 101")
        self.assertEqual(mock_query.execute.call_count, 1)

    @patch("app.session_cache.supabase")
    def test_cache_expiration_after_ttl(self, mock_supabase):
        mock_query = MagicMock()
        mock_res = MagicMock()
        mock_res.data = [{
            "id": "sess-test-2",
            "class_name": "Physiology 201",
            "start_time": "2026-11-04T11:00:00Z",
            "created_at": "2026-11-04T11:00:00Z",
            "target_academic_year": "2nd Year MBBS",
            "is_archived": False,
            "instructor_name": "Dr. Sen"
        }]
        mock_query.execute.return_value = mock_res
        mock_supabase.table.return_value.select.return_value.eq.return_value = mock_query

        with patch("app.session_cache.time.time") as mock_time:
            mock_time.return_value = 1000.0
            first = get_cached_session_metadata("sess-test-2")
            self.assertEqual(first["class_name"], "Physiology 201")
            self.assertEqual(mock_query.execute.call_count, 1)

            # Within TTL (15s later) -> Cache hit
            mock_time.return_value = 1015.0
            second = get_cached_session_metadata("sess-test-2")
            self.assertEqual(second["class_name"], "Physiology 201")
            self.assertEqual(mock_query.execute.call_count, 1)

            # Past TTL (35s later) -> Cache expired, queries DB again
            mock_time.return_value = 1035.0
            third = get_cached_session_metadata("sess-test-2")
            self.assertEqual(third["class_name"], "Physiology 201")
            self.assertEqual(mock_query.execute.call_count, 2)

    @patch("app.session_cache.supabase")
    def test_invalidation_specific_and_all(self, mock_supabase):
        mock_query = MagicMock()
        mock_res = MagicMock()
        mock_res.data = [{
            "id": "sess-test-3",
            "class_name": "Biochemistry",
            "start_time": "2026-11-04T12:00:00Z",
            "created_at": "2026-11-04T12:00:00Z",
            "target_academic_year": "1st Year MBBS",
            "is_archived": False,
            "instructor_name": "Dr. Das"
        }]
        mock_query.execute.return_value = mock_res
        mock_supabase.table.return_value.select.return_value.eq.return_value = mock_query

        # Initial fetch
        get_cached_session_metadata("sess-test-3")
        self.assertEqual(mock_query.execute.call_count, 1)

        # Invalidate specific session
        invalidate_backend_session_cache("sess-test-3")

        # Next fetch should re-query DB
        get_cached_session_metadata("sess-test-3")
        self.assertEqual(mock_query.execute.call_count, 2)

        # Invalidate all
        invalidate_backend_session_cache()
        get_cached_session_metadata("sess-test-3")
        self.assertEqual(mock_query.execute.call_count, 3)

    @patch("app.session_cache.supabase")
    def test_fault_tolerant_stale_serving_on_db_error(self, mock_supabase):
        mock_query = MagicMock()
        mock_res = MagicMock()
        mock_res.data = [{
            "id": "sess-test-4",
            "class_name": "Pathology",
            "start_time": "2026-11-04T14:00:00Z",
            "created_at": "2026-11-04T14:00:00Z",
            "target_academic_year": "2nd Year MBBS",
            "is_archived": False,
            "instructor_name": "Dr. Roy"
        }]
        mock_query.execute.return_value = mock_res
        mock_supabase.table.return_value.select.return_value.eq.return_value = mock_query

        with patch("app.session_cache.time.time") as mock_time:
            mock_time.return_value = 1000.0
            first = get_cached_session_metadata("sess-test-4")
            self.assertEqual(first["class_name"], "Pathology")

            # Simulate DB network failure after TTL
            mock_time.return_value = 1040.0
            mock_query.execute.side_effect = Exception("Supabase connection timeout")

            # Call should NOT raise exception, but return last known valid metadata
            stale = get_cached_session_metadata("sess-test-4")
            self.assertIsNotNone(stale)
            self.assertEqual(stale["class_name"], "Pathology")


if __name__ == "__main__":
    unittest.main()
