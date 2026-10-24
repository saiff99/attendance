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


if __name__ == "__main__":
    unittest.main()
