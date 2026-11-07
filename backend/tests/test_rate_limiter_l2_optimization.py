import unittest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException

from app.rate_limiter import (
    check_device_lock,
    record_device_lock,
    check_fail_cooldown,
    record_face_failure,
    clear_face_failure,
    prune_all_expired_rate_limit_state,
    _memory_dev_locks,
    _memory_fail_cooldowns,
    _session_devlocks_initialized,
    _session_fails_initialized,
)


class TestRateLimiterL2Optimization(unittest.TestCase):
    def setUp(self):
        prune_all_expired_rate_limit_state()

    def tearDown(self):
        prune_all_expired_rate_limit_state()

    @patch("app.rate_limiter.supabase")
    def test_clear_face_failure_skips_db_delete_when_zero_failures(self, mock_supabase):
        """
        Verifies that innocent students with 0 recorded failures do NOT trigger
        an unnecessary DELETE query against Supabase settings table.
        """
        mock_delete = MagicMock()
        mock_supabase.table.return_value.delete.return_value.eq.return_value = mock_delete

        session_id = "sess-test-clear-1"
        roll = "26001"
        ip = "192.168.1.10"

        # 1. Student with 0 failures passes face verification
        clear_face_failure(session_id, roll, ip)

        # Supabase DELETE must NOT be called
        mock_supabase.table.assert_not_called()
        self.assertEqual(mock_delete.execute.call_count, 0)

        # 2. Student who DID fail previously
        record_face_failure(session_id, roll, ip, current_fails=0)
        self.assertIn(f"{session_id}:{roll}:{ip}", _memory_fail_cooldowns)

        # Now clear_face_failure is called after eventual recovery
        clear_face_failure(session_id, roll, ip)

        # Supabase DELETE MUST be called to purge the genuine failure record from L2
        mock_supabase.table.return_value.delete.assert_called_once()
        self.assertNotIn(f"{session_id}:{roll}:{ip}", _memory_fail_cooldowns)

    @patch("app.rate_limiter.supabase")
    def test_session_device_lock_batch_initialization_eliminates_individual_selects(self, mock_supabase):
        """
        Verifies that session device locks are batch-initialized once, eliminating individual
        SELECT queries for subsequent students in the same lecture session.
        """
        mock_query = MagicMock()
        mock_res = MagicMock()
        # Initial state in DB: roll 26099 already locked on dev-99 from before
        mock_res.data = [
            {
                "key": "devlock:sess-batch-1:dev-99",
                "value": {"student_roll": "26099", "session_id": "sess-batch-1"}
            }
        ]
        mock_query.execute.return_value = mock_res
        mock_supabase.table.return_value.select.return_value.like.return_value = mock_query

        session_id = "sess-batch-1"

        # Student 1 checks in from a new device dev-1
        check_device_lock(session_id, "dev-1", "26001")
        # Exactly 1 batch query was executed to initialize session devlocks
        self.assertEqual(mock_query.execute.call_count, 1)

        # Student 2 checks in from a new device dev-2
        check_device_lock(session_id, "dev-2", "26002")
        # Still exactly 1 batch query! Zero individual SELECT queries!
        self.assertEqual(mock_query.execute.call_count, 1)

        # Student 3 tries to use pre-existing locked device dev-99 with different roll
        with self.assertRaises(HTTPException) as ctx:
            check_device_lock(session_id, "dev-99", "26003")
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("26099", ctx.exception.detail)

        # Still exactly 1 batch query! (Proxy blocked entirely in RAM)
        self.assertEqual(mock_query.execute.call_count, 1)

    @patch("app.rate_limiter.supabase")
    def test_session_fail_cooldown_batch_initialization(self, mock_supabase):
        """
        Verifies that session fail cooldowns are batch-initialized once, eliminating individual
        SELECT queries for innocent students with zero failures.
        """
        mock_query = MagicMock()
        mock_res = MagicMock()
        mock_res.data = []  # No failures in session initially
        mock_query.execute.return_value = mock_res
        mock_supabase.table.return_value.select.return_value.like.return_value = mock_query

        session_id = "sess-fail-batch-1"

        # Student 1 check
        info1 = check_fail_cooldown(session_id, "26010", "10.0.0.1")
        self.assertEqual(info1["fails"], 0)
        self.assertEqual(mock_query.execute.call_count, 1)

        # Student 2 check
        info2 = check_fail_cooldown(session_id, "26020", "10.0.0.2")
        self.assertEqual(info2["fails"], 0)
        # Still exactly 1 batch query! Zero individual queries for Student 2
        self.assertEqual(mock_query.execute.call_count, 1)

        # Student 3 check
        info3 = check_fail_cooldown(session_id, "26030", "10.0.0.3")
        self.assertEqual(info3["fails"], 0)
        self.assertEqual(mock_query.execute.call_count, 1)

    @patch("app.rate_limiter.supabase")
    def test_simulated_150_student_classroom_query_savings(self, mock_supabase):
        """
        Simulates 150 students completing attendance:
        - 1 batch init for device locks
        - 1 batch init for fail cooldowns
        - 0 individual fail selects
        - 0 individual devlock selects
        - 0 fail clears
        - 150 devlock upserts
        Total settings queries: 152 instead of ~600!
        """
        select_query_mock = MagicMock()
        res_mock = MagicMock()
        res_mock.data = []
        select_query_mock.execute.return_value = res_mock

        mock_supabase.table.return_value.select.return_value.like.return_value = select_query_mock
        upsert_mock = MagicMock()
        mock_supabase.table.return_value.upsert.return_value = upsert_mock

        session_id = "sess-mbbs-150-rush"

        for i in range(1, 151):
            roll = f"ROLL-{i}"
            dev_id = f"phone-hw-{i}"
            ip = f"192.168.1.{i % 250}"

            # Step 1: Check fail cooldown (fast-path)
            check_fail_cooldown(session_id, roll, ip)

            # Step 2: Check device lock (fast-path)
            check_device_lock(session_id, dev_id, roll)

            # Step 3: Face match succeeds -> clear face failure
            clear_face_failure(session_id, roll, ip)

            # Step 4: Record device lock
            record_device_lock(session_id, dev_id, roll)

        # Exactly 2 batch SELECTs (1 for devlocks, 1 for fails)
        self.assertEqual(select_query_mock.execute.call_count, 2)

        # Zero DELETE queries were sent
        mock_supabase.table.return_value.delete.assert_not_called()

        # Exactly 150 legitimate device lock upserts
        self.assertEqual(upsert_mock.execute.call_count, 150)


if __name__ == "__main__":
    unittest.main()

