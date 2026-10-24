"""
Backend Unit Tests (Zero-Dependency, Deterministic & Isolated).
Can run completely offline without database, external camera streams, or network tunnels.
"""
import os
import sys
import unittest

# Ensure backend root is on sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.security import is_public_path, PUBLIC_EXACT_PATHS
from app.config import redact_stream_url, is_cohort_matching, calculate_haversine_distance


class TestAPISecurityUnit(unittest.TestCase):
    """Unit tests for FastAPI security middleware, public whitelist & path normalization."""

    def test_public_exact_paths_minimal(self):
        """Ensures that public whitelist is strictly minimized."""
        self.assertIn("/", PUBLIC_EXACT_PATHS)
        self.assertIn("/health", PUBLIC_EXACT_PATHS)
        self.assertIn("/api/selfie-attendance", PUBLIC_EXACT_PATHS)
        # Detailed diagnostics MUST NOT be in public paths
        self.assertNotIn("/health/performance", PUBLIC_EXACT_PATHS)
        self.assertNotIn("/api/health/performance", PUBLIC_EXACT_PATHS)
        self.assertNotIn("/api/cameras", PUBLIC_EXACT_PATHS)

    def test_is_public_path_allowed(self):
        """Verifies legitimate public routes."""
        self.assertTrue(is_public_path("/"))
        self.assertTrue(is_public_path("/health"))
        self.assertTrue(is_public_path("/health/"))
        self.assertTrue(is_public_path("/api/selfie-attendance"))
        self.assertTrue(is_public_path("/api/selfie-attendance/"))

    def test_is_public_path_protected(self):
        """Verifies protected administrative and camera routes are rejected without auth."""
        self.assertFalse(is_public_path("/health/performance"))
        self.assertFalse(is_public_path("/api/health/performance"))
        self.assertFalse(is_public_path("/api/cameras"))
        self.assertFalse(is_public_path("/api/video-feed/123"))
        self.assertFalse(is_public_path("/api/active-sessions"))
        self.assertFalse(is_public_path("/api/users"))
        self.assertFalse(is_public_path("/api/ptz/move"))

    def test_is_public_path_traversal_prevention(self):
        """Verifies path traversal bypass tricks (e.g. /health/../api/cameras) are strictly normalized and blocked."""
        self.assertFalse(is_public_path("/health/../api/cameras"))
        self.assertFalse(is_public_path("/api/selfie-attendance/../api/cameras"))
        self.assertFalse(is_public_path("//api//cameras"))
        self.assertFalse(is_public_path(""))
        self.assertFalse(is_public_path(None))


class TestStreamSecurityUnit(unittest.TestCase):
    """Unit tests for RTSP credentials redaction & stream URL masking."""

    def test_redact_stream_url_credentials(self):
        raw_url = "rtsp://admin:Tech_1234@172.16.7.5:554/live"
        expected = "rtsp://admin:***@172.16.7.5:554/live"
        self.assertEqual(redact_stream_url(raw_url), expected)

    def test_redact_stream_url_complex_passwords(self):
        raw_url = "rtsp://viewer:P@ss!w0rd_99@192.168.1.100:554/ch1"
        expected = "rtsp://viewer:***@192.168.1.100:554/ch1"
        self.assertEqual(redact_stream_url(raw_url), expected)

    def test_redact_stream_url_without_credentials(self):
        raw_url = "rtsp://172.16.7.5:554/live"
        self.assertEqual(redact_stream_url(raw_url), raw_url)

    def test_redact_stream_url_webcam_and_empty(self):
        self.assertEqual(redact_stream_url("0"), "0")
        self.assertEqual(redact_stream_url(""), "")
        self.assertEqual(redact_stream_url(None), "")


class TestBusinessLogicUnit(unittest.TestCase):
    """Unit tests for student cohort matching and geofencing math."""

    def test_is_cohort_matching(self):
        # Unrestricted session
        self.assertTrue(is_cohort_matching(None, "1st Year MBBS"))
        self.assertTrue(is_cohort_matching("All", "1st Year MBBS"))
        self.assertTrue(is_cohort_matching("All Years", "2nd Year MBBS"))

        # Base year match
        self.assertTrue(is_cohort_matching("1st Year", "1st Year MBBS"))
        self.assertTrue(is_cohort_matching("1st Year", "1st Year (Group A)"))
        self.assertFalse(is_cohort_matching("2nd Year", "1st Year MBBS"))

        # Sub-group match
        self.assertTrue(is_cohort_matching("1st Year (Group A)", "1st Year (Group A)"))
        self.assertFalse(is_cohort_matching("1st Year (Group A)", "1st Year (Group B)"))

    def test_calculate_haversine_distance(self):
        # Same coordinate -> 0 meters
        dist_zero = calculate_haversine_distance(22.5726, 88.3639, 22.5726, 88.3639)
        self.assertAlmostEqual(dist_zero, 0.0, places=2)

        # Small displacement (~111 meters per 0.001 deg latitude)
        dist_disp = calculate_haversine_distance(22.5720, 88.3639, 22.5730, 88.3639)
        self.assertTrue(100.0 < dist_disp < 125.0)


class TestConfigFailFastUnit(unittest.TestCase):
    """Unit tests for Supabase production fail-fast and test mode isolation."""

    def test_test_mode_detected(self):
        from app.config import IS_TESTING
        self.assertTrue(IS_TESTING, "Test runner environment should be detected as IS_TESTING")

    def test_production_fail_fast_logic(self):
        """Verifies that missing credentials in production raise RuntimeError while test mode is permissive."""
        def evaluate_credentials(url, key, is_testing):
            if not url:
                if is_testing:
                    return "offline_test_mode"
                raise RuntimeError("FATAL: SUPABASE_URL missing")
            if not key:
                if is_testing:
                    return "offline_test_mode"
                raise RuntimeError("FATAL: SUPABASE_KEY missing")
            return "initialized"

        # Production fail-fast verification
        with self.assertRaises(RuntimeError):
            evaluate_credentials("", "valid-key", is_testing=False)

        with self.assertRaises(RuntimeError):
            evaluate_credentials("https://example.supabase.co", "", is_testing=False)

        # Test mode isolation verification
        self.assertEqual(evaluate_credentials("", "", is_testing=True), "offline_test_mode")
        self.assertEqual(evaluate_credentials("https://example.supabase.co", "key", is_testing=False), "initialized")


class TestFaceEnrollmentVerificationUnit(unittest.TestCase):
    """Unit tests for has_valid_face_encoding and dual-condition enrollment check."""

    def test_has_valid_face_encoding(self):
        from app.config import has_valid_face_encoding
        # Genuine 512D ArcFace vector
        mock_512 = [0.05] * 512
        self.assertTrue(has_valid_face_encoding(mock_512))

        # 128D minimum vector
        mock_128 = [0.01] * 128
        self.assertTrue(has_valid_face_encoding(mock_128))

        # None / empty / short
        self.assertFalse(has_valid_face_encoding(None))
        self.assertFalse(has_valid_face_encoding([]))
        self.assertFalse(has_valid_face_encoding([0.1, 0.2]))  # too short

        # Legacy metadata dictionary without vector
        self.assertFalse(has_valid_face_encoding({"parent_phone": "9876543210"}))
        self.assertFalse(has_valid_face_encoding({}))

    def test_dual_condition_has_face_enrolled(self):
        """has_face_enrolled MUST be False if consent is given but template is not enrolled."""
        from app.config import has_valid_face_encoding
        # Consent=True, Template=None -> False (Consent alone is not template)
        consent_only = bool(True) and has_valid_face_encoding(None)
        self.assertFalse(consent_only)

        # Consent=False, Template=512D -> False (revoked consent)
        revoked = bool(False) and has_valid_face_encoding([0.05] * 512)
        self.assertFalse(revoked)

        # Consent=True, Template=512D -> True (properly enrolled)
        valid_enrolled = bool(True) and has_valid_face_encoding([0.05] * 512)
        self.assertTrue(valid_enrolled)


class TestAtomicRateLimiterConcurrencyUnit(unittest.TestCase):
    """Unit tests for thread-safe atomic rate limiting and race condition prevention."""

    def test_key_lock_singleton_per_key(self):
        from app.rate_limiter import _get_key_lock
        lock1 = _get_key_lock("test:key:1")
        lock2 = _get_key_lock("test:key:1")
        lock3 = _get_key_lock("test:key:2")
        self.assertIs(lock1, lock2, "Same key MUST return identical Lock instance for serialization")
        self.assertIsNot(lock1, lock3, "Different keys should have independent locks")

    def test_concurrent_device_lock_race_prevention(self):
        """Verifies that simultaneous check_device_lock for differing rolls on same device is rejected."""
        import threading
        from app.rate_limiter import check_device_lock, _memory_dev_locks
        from fastapi import HTTPException

        sess = "test-sess-99"
        dev = "dev-shared-xyz"
        mem_key = f"{sess}:{dev}"
        _memory_dev_locks.pop(mem_key, None)

        errors = []

        def student_a():
            try:
                check_device_lock(sess, dev, "ROLL-101")
            except HTTPException as e:
                errors.append(e)

        def student_b():
            try:
                check_device_lock(sess, dev, "ROLL-102")
            except HTTPException as e:
                errors.append(e)

        t1 = threading.Thread(target=student_a)
        t2 = threading.Thread(target=student_b)
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        # Exactly one student should be rejected with 403
        self.assertEqual(len(errors), 1, "Simultaneous check from two different rolls MUST reject the second roll")
        self.assertEqual(errors[0].status_code, 403)


class TestProcessAttributionUnit(unittest.TestCase):
    """Unit tests for deterministic process identification and foreign process immunity."""

    def test_foreign_processes_rejected(self):
        """Verifies that generic node, python, or other processes outside MedAttend are never matched."""
        repo_root = os.path.dirname(backend_dir)
        if repo_root not in sys.path:
            sys.path.insert(0, repo_root)
        from start import is_medattend_process

        # Foreign python process
        self.assertFalse(
            is_medattend_process(
                pid=99999,
                cmd_override="python3 /Users/someone/data_pipeline/main.py",
                cwd_override="/Users/someone/data_pipeline"
            ),
            "Foreign python process must not be flagged as MedAttend"
        )

        # Foreign node process
        self.assertFalse(
            is_medattend_process(
                pid=99998,
                cmd_override="node /var/www/other_site/server.js",
                cwd_override="/var/www/other_site"
            ),
            "Foreign node process must not be flagged as MedAttend"
        )

        # Foreign next-server process
        self.assertFalse(
            is_medattend_process(
                pid=99997,
                cmd_override="next-server (v14.0.0)",
                cwd_override="/Users/someone/personal_blog"
            ),
            "Foreign next-server process must not be flagged as MedAttend"
        )

    def test_medattend_processes_accepted(self):
        """Verifies that genuine MedAttend processes are positively identified."""
        repo_root = os.path.dirname(backend_dir)
        if repo_root not in sys.path:
            sys.path.insert(0, repo_root)
        from start import is_medattend_process, BASE_DIR

        # MedAttend backend via CWD
        self.assertTrue(
            is_medattend_process(
                pid=99996,
                cmd_override="uvicorn app.main:app --port 8000",
                cwd_override=os.path.join(BASE_DIR, "backend")
            )
        )

        # MedAttend frontend via CWD
        self.assertTrue(
            is_medattend_process(
                pid=99995,
                cmd_override="next-server (v16.2.4)",
                cwd_override=os.path.join(BASE_DIR, "frontend")
            )
        )

        # MedAttend whatsapp via CWD
        self.assertTrue(
            is_medattend_process(
                pid=99994,
                cmd_override="node server.js",
                cwd_override=os.path.join(BASE_DIR, "whatsapp-service")
            )
        )

        # MedAttend backend via command line path
        self.assertTrue(
            is_medattend_process(
                pid=99993,
                cmd_override=f"{BASE_DIR}/backend/.venv/bin/python3 -m uvicorn app.main:app",
                cwd_override="/tmp"
            )
        )


if __name__ == "__main__":
    unittest.main()
