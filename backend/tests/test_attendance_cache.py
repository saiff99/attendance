import unittest
import time
import threading
from unittest.mock import MagicMock, patch

from app.attendance_cache import (
    get_cached_session_attendance,
    record_cached_session_attendance,
    invalidate_session_attendance_cache,
    get_attendance_cache_stats,
    SESSION_ATTENDANCE_CACHE_TTL_SECONDS,
)


class TestAttendanceCache(unittest.TestCase):
    def setUp(self):
        invalidate_session_attendance_cache()

    def tearDown(self):
        invalidate_session_attendance_cache()

    def test_empty_or_invalid_inputs(self):
        self.assertIsNone(get_cached_session_attendance("", "student-1"))
        self.assertIsNone(get_cached_session_attendance("sess-1", ""))
        self.assertIsNone(get_cached_session_attendance("   ", "student-1"))
        self.assertIsNone(get_cached_session_attendance("sess-1", "   "))
        self.assertIsNone(get_cached_session_attendance(None, "student-1"))
        self.assertIsNone(get_cached_session_attendance("sess-1", None))

    @patch("app.attendance_cache.supabase")
    def test_lazy_db_init_and_fast_path_cache_hit(self, mock_supabase):
        mock_query = MagicMock()
        mock_res = MagicMock()
        mock_res.data = [
            {
                "student_id": "stu-101",
                "recorded_at": "2026-11-06 10:00:00",
                "confidence_score": 0.88,
                "capture_mode": "Live Scan",
            },
            {
                "student_id": "stu-102",
                "recorded_at": "2026-11-06 10:01:00",
                "confidence_score": 0.92,
                "capture_mode": "Live Scan",
            },
        ]
        mock_query.execute.return_value = mock_res
        mock_supabase.table.return_value.select.return_value.eq.return_value = mock_query

        # 1st call for stu-101 -> Initializes session from DB (1 DB query)
        rec1 = get_cached_session_attendance("sess-alpha", "stu-101")
        self.assertIsNotNone(rec1)
        self.assertEqual(rec1["recorded_at"], "2026-11-06 10:00:00")
        self.assertAlmostEqual(rec1["confidence"], 0.88)
        self.assertEqual(mock_query.execute.call_count, 1)

        # 2nd call for stu-102 in same session -> Cache hit, 0 additional DB queries!
        rec2 = get_cached_session_attendance("sess-alpha", "stu-102")
        self.assertIsNotNone(rec2)
        self.assertEqual(rec2["recorded_at"], "2026-11-06 10:01:00")
        self.assertEqual(mock_query.execute.call_count, 1)

        # 3rd call for unknown student stu-999 in same session -> Cache hit (not marked), 0 DB queries!
        rec3 = get_cached_session_attendance("sess-alpha", "stu-999")
        self.assertIsNone(rec3)
        self.assertEqual(mock_query.execute.call_count, 1)

    def test_record_cached_session_attendance(self):
        record_cached_session_attendance("sess-beta", "stu-201", {
            "recorded_at": "2026-11-06 11:30:00",
            "confidence": 0.95,
            "capture_mode": "Live Scan",
        })

        rec = get_cached_session_attendance("sess-beta", "stu-201", allow_db_init=False)
        self.assertIsNotNone(rec)
        self.assertEqual(rec["recorded_at"], "2026-11-06 11:30:00")
        self.assertAlmostEqual(rec["confidence"], 0.95)

        stats = get_attendance_cache_stats()
        self.assertEqual(stats["cached_sessions"], 1)
        self.assertEqual(stats["total_cached_records"], 1)

    def test_invalidation(self):
        record_cached_session_attendance("sess-1", "stu-1", {"recorded_at": "now", "confidence": 0.9})
        record_cached_session_attendance("sess-2", "stu-2", {"recorded_at": "now", "confidence": 0.9})

        self.assertEqual(get_attendance_cache_stats()["cached_sessions"], 2)

        # Target invalidation for sess-1
        invalidate_session_attendance_cache("sess-1")
        self.assertIsNone(get_cached_session_attendance("sess-1", "stu-1", allow_db_init=False))
        self.assertIsNotNone(get_cached_session_attendance("sess-2", "stu-2", allow_db_init=False))

        # Full invalidation
        invalidate_session_attendance_cache(None)
        self.assertEqual(get_attendance_cache_stats()["cached_sessions"], 0)

    @patch("app.attendance_cache.supabase")
    def test_simulated_classroom_rush_150_students(self, mock_supabase):
        """
        Simulates 150 students arriving in a live lecture:
        - 1 initial session query to load empty or existing state.
        - 150 students marked with 0 individual SELECT queries.
        - 50 duplicate retries answered with 0 DB queries.
        """
        mock_query = MagicMock()
        mock_res = MagicMock()
        mock_res.data = []  # Session just started, 0 students initially
        mock_query.execute.return_value = mock_res
        mock_supabase.table.return_value.select.return_value.eq.return_value = mock_query

        session_id = "sess-mbbs-class-1"

        # 1. First student lookup initializes session attendance set (1 DB query)
        first = get_cached_session_attendance(session_id, "student-1")
        self.assertIsNone(first)
        self.assertEqual(mock_query.execute.call_count, 1)

        # 2. 150 students are marked one by one
        for i in range(1, 151):
            stu_id = f"student-{i}"
            # Check cache before insert (0 DB queries because session is cached)
            cached = get_cached_session_attendance(session_id, stu_id)
            self.assertIsNone(cached)
            # Record attendance in cache
            record_cached_session_attendance(session_id, stu_id, {
                "recorded_at": "2026-11-06 10:15:00",
                "confidence": 0.91,
                "capture_mode": "Live Scan"
            })

        # DB query count MUST remain exactly 1 (0 individual student SELECTs)
        self.assertEqual(mock_query.execute.call_count, 1)

        # 3. 50 students accidentally retry or refresh the page
        for i in range(1, 51):
            stu_id = f"student-{i}"
            retry_rec = get_cached_session_attendance(session_id, stu_id)
            self.assertIsNotNone(retry_rec)
            self.assertEqual(retry_rec["recorded_at"], "2026-11-06 10:15:00")

        # DB query count MUST still remain exactly 1!
        self.assertEqual(mock_query.execute.call_count, 1)

    def test_concurrent_access_thread_safety(self):
        """Verifies concurrent threads can record and read without race conditions."""
        session_id = "sess-concurrent"
        errors = []

        def worker(thread_idx: int):
            try:
                for i in range(50):
                    stu_id = f"stu-t{thread_idx}-{i}"
                    record_cached_session_attendance(session_id, stu_id, {
                        "recorded_at": "2026-11-06 12:00:00",
                        "confidence": 0.85,
                        "capture_mode": "Live Scan"
                    })
                    val = get_cached_session_attendance(session_id, stu_id, allow_db_init=False)
                    if val is None or val["recorded_at"] != "2026-11-06 12:00:00":
                        errors.append(f"Mismatch for {stu_id}")
            except Exception as e:
                errors.append(str(e))

        threads = [threading.Thread(target=worker, args=(t,)) for t in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(len(errors), 0)
        stats = get_attendance_cache_stats()
        self.assertEqual(stats["total_cached_records"], 250)


if __name__ == "__main__":
    unittest.main()

