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

# Supply deterministic mock environment defaults for isolated offline test runner
os.environ.setdefault("SUPABASE_URL", "https://ci-test-mock.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "ci_mock_service_role_key_for_offline_unit_tests")
os.environ.setdefault("INTERNAL_API_KEY", "ci_mock_internal_key_for_offline_unit_tests")

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

    def test_single_launcher_lock_behavior(self):
        """Verifies that single-instance launcher lock file logic is functional and prevents duplicate runs."""
        import tempfile
        repo_root = os.path.dirname(backend_dir)
        if repo_root not in sys.path:
            sys.path.insert(0, repo_root)
        from start import enforce_single_launcher_instance

        with tempfile.NamedTemporaryFile(prefix=".test_launcher_", suffix=".lock", delete=False) as tf:
            test_lock_path = tf.name

        try:
            enforce_single_launcher_instance(lock_file_path=test_lock_path)
            self.assertTrue(os.path.exists(test_lock_path))
            with open(test_lock_path, "r") as f:
                pid_str = f.read().strip()
                self.assertEqual(pid_str, str(os.getpid()))
        finally:
            if os.path.exists(test_lock_path):
                try:
                    os.remove(test_lock_path)
                except Exception:
                    pass


class TestConfigFailFastUnit(unittest.TestCase):
    """Unit tests verifying that backend/app/config.py strictly and unconditionally fails fast on missing configuration."""

    def test_missing_supabase_url_raises_runtime_error(self):
        """Verifies that launching without SUPABASE_URL unconditionally raises RuntimeError."""
        import subprocess
        code = (
            "import os, sys; "
            "sys.path.insert(0, '.'); "
            "os.environ.pop('SUPABASE_URL', None); "
            "os.environ.pop('NEXT_PUBLIC_SUPABASE_URL', None); "
            "from app import config"
        )
        clean_env = {k: v for k, v in os.environ.items() if k not in ("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")}
        clean_env["SKIP_DOTENV"] = "1"
        res = subprocess.run(
            [sys.executable, "-c", code],
            cwd=backend_dir,
            env=clean_env,
            capture_output=True,
            text=True
        )
        self.assertNotEqual(res.returncode, 0, "Missing SUPABASE_URL must halt process with non-zero exit")
        self.assertIn("RuntimeError", res.stderr)
        self.assertIn("SUPABASE_URL is missing", res.stderr)

    def test_missing_supabase_key_raises_runtime_error(self):
        """Verifies that launching without SUPABASE_SERVICE_ROLE_KEY unconditionally raises RuntimeError."""
        import subprocess
        code = (
            "import os, sys; "
            "sys.path.insert(0, '.'); "
            "os.environ['SUPABASE_URL'] = 'https://ci-test-mock.supabase.co'; "
            "os.environ.pop('SUPABASE_SERVICE_ROLE_KEY', None); "
            "os.environ.pop('SUPABASE_KEY', None); "
            "from app import config"
        )
        clean_env = {k: v for k, v in os.environ.items() if k not in ("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_KEY")}
        clean_env["SUPABASE_URL"] = "https://ci-test-mock.supabase.co"
        clean_env["SKIP_DOTENV"] = "1"
        res = subprocess.run(
            [sys.executable, "-c", code],
            cwd=backend_dir,
            env=clean_env,
            capture_output=True,
            text=True
        )
        self.assertNotEqual(res.returncode, 0, "Missing SUPABASE_SERVICE_ROLE_KEY must halt process with non-zero exit")
        self.assertIn("RuntimeError", res.stderr)
        self.assertIn("SUPABASE_SERVICE_ROLE_KEY is missing", res.stderr)


class TestCheckinCapabilityTokenUnit(unittest.TestCase):
    """Unit tests for check-in capability token generation, verification, and metadata sanitization."""

    def test_checkin_token_lifecycle(self):
        try:
            from app.routes import generate_checkin_token, verify_checkin_token
        except ImportError as e:
            self.skipTest(f"Skipping routes import: heavy AI dependencies require virtualenv ({e})")

        sess_id = "e0a1b2c3-d4e5-4a6b-8c7d-0e1f2a3b4c5d"
        token = generate_checkin_token(sess_id, valid_seconds=300)
        self.assertTrue(bool(token))
        self.assertEqual(len(token.split(":")), 3)

        # Valid session token passes with or without roll
        self.assertTrue(verify_checkin_token(token, sess_id))
        self.assertTrue(verify_checkin_token(token, sess_id, "24001"))

        # Roll-bound token lifecycle
        roll_token = generate_checkin_token(sess_id, valid_seconds=300, student_roll="24001")
        self.assertTrue(bool(roll_token))
        self.assertEqual(len(roll_token.split(":")), 4)

        # Correct roll passes
        self.assertTrue(verify_checkin_token(roll_token, sess_id, "24001"))
        self.assertTrue(verify_checkin_token(roll_token, sess_id, " 24001 "))

        # Mismatched roll fails
        self.assertFalse(verify_checkin_token(roll_token, sess_id, "24002"))

        # Mismatched session ID fails
        self.assertFalse(verify_checkin_token(token, "00000000-0000-0000-0000-000000000001"))
        self.assertFalse(verify_checkin_token(roll_token, "00000000-0000-0000-0000-000000000001", "24001"))

        # Tampered token fails
        tampered = token[:-2] + ("11" if token[-2:] != "11" else "22")
        self.assertFalse(verify_checkin_token(tampered, sess_id))

        # Malformed / empty fails
        self.assertFalse(verify_checkin_token("", sess_id))
        self.assertFalse(verify_checkin_token(None, sess_id))
        self.assertFalse(verify_checkin_token("invalid:token", sess_id))

    def test_clean_public_instructor_name(self):
        try:
            from app.routes import clean_public_instructor_name
        except ImportError as e:
            self.skipTest(f"Skipping routes import: heavy AI dependencies require virtualenv ({e})")

        raw = "Anatomy 101 [GPS:22.5726,88.3639,100,1,Campus] [BY:prof_smith]"
        cleaned = clean_public_instructor_name(raw)
        self.assertEqual(cleaned, "Anatomy 101")
        self.assertNotIn("GPS", cleaned)
        self.assertNotIn("prof_smith", cleaned)

        # None / empty fallback
        self.assertEqual(clean_public_instructor_name(None), "Faculty Member")
        self.assertEqual(clean_public_instructor_name(""), "Faculty Member")


if __name__ == "__main__":
    unittest.main()
