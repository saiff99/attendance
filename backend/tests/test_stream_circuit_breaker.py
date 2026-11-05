import unittest
import time
from unittest.mock import patch, MagicMock
from app.stream import (
    CircuitState,
    StreamCircuitBreaker,
    CameraStreamManager,
    ThreadedRTSPStream,
)


class TestStreamCircuitBreaker(unittest.TestCase):
    """
    Unit tests for Issue 6: StreamCircuitBreaker and Exponential Backoff.
    Verifies state transitions (CLOSED -> OPEN -> HALF_OPEN -> CLOSED),
    backoff scaling, dormancy detection, and recovery.
    """

    def setUp(self):
        self.cb = StreamCircuitBreaker(
            name="TestCam",
            failure_threshold=3,
            initial_backoff=10.0,
            max_backoff=80.0,
            backoff_multiplier=2.0,
        )

    def test_initial_state_is_closed(self):
        self.assertEqual(self.cb.state, CircuitState.CLOSED)
        self.assertEqual(self.cb.consecutive_failures, 0)
        self.assertFalse(self.cb.is_open())
        self.assertTrue(self.cb.allow_attempt())

    def test_trips_to_open_after_reaching_failure_threshold(self):
        # 1st failure: below threshold
        self.cb.record_failure("Socket timeout 1")
        self.assertEqual(self.cb.state, CircuitState.CLOSED)
        self.assertEqual(self.cb.consecutive_failures, 1)
        self.assertTrue(self.cb.allow_attempt())

        # 2nd failure: below threshold
        self.cb.record_failure("Socket timeout 2")
        self.assertEqual(self.cb.state, CircuitState.CLOSED)
        self.assertEqual(self.cb.consecutive_failures, 2)
        self.assertTrue(self.cb.allow_attempt())

        # 3rd failure: reaches threshold -> trips to OPEN
        self.cb.record_failure("Socket timeout 3")
        self.assertEqual(self.cb.state, CircuitState.OPEN)
        self.assertEqual(self.cb.consecutive_failures, 3)
        self.assertTrue(self.cb.is_open())
        self.assertFalse(self.cb.allow_attempt())

    def test_exponential_backoff_and_half_open_transition(self):
        # Trip the circuit
        for i in range(3):
            self.cb.record_failure(f"Fail {i+1}")
        self.assertEqual(self.cb.state, CircuitState.OPEN)
        self.assertEqual(self.cb.current_backoff, 10.0)

        # Before backoff expires: attempts disallowed
        with patch("time.time", return_value=self.cb.last_state_change + 5.0):
            self.assertTrue(self.cb.is_open())
            self.assertFalse(self.cb.allow_attempt())

        # When backoff expires: transitions to HALF_OPEN
        with patch("time.time", return_value=self.cb.last_state_change + 10.1):
            self.assertTrue(self.cb.allow_attempt())
            self.assertEqual(self.cb.state, CircuitState.HALF_OPEN)

        # Trial probe fails: Trips back to OPEN with doubled backoff (10 * 2 = 20s)
        self.cb.record_failure("Trial probe failed")
        self.assertEqual(self.cb.state, CircuitState.OPEN)
        self.assertEqual(self.cb.current_backoff, 20.0)

        # Next backoff trial: 20s later
        with patch("time.time", return_value=self.cb.last_state_change + 20.1):
            self.assertTrue(self.cb.allow_attempt())
            self.assertEqual(self.cb.state, CircuitState.HALF_OPEN)

        # Another failure: doubles again (20 * 2 = 40s)
        self.cb.record_failure("Second trial failed")
        self.assertEqual(self.cb.state, CircuitState.OPEN)
        self.assertEqual(self.cb.current_backoff, 40.0)

        # Another failure: doubles again (40 * 2 = 80s, hits max_backoff)
        with patch("time.time", return_value=self.cb.last_state_change + 40.1):
            self.assertTrue(self.cb.allow_attempt())
        self.cb.record_failure("Third trial failed")
        self.assertEqual(self.cb.current_backoff, 80.0)

        # Subsequent failure capped at max_backoff (80.0)
        with patch("time.time", return_value=self.cb.last_state_change + 80.1):
            self.assertTrue(self.cb.allow_attempt())
        self.cb.record_failure("Fourth trial failed")
        self.assertEqual(self.cb.current_backoff, 80.0)

    def test_recovery_resets_circuit_to_closed(self):
        # Trip the circuit
        for _ in range(3):
            self.cb.record_failure("Fail")
        self.assertEqual(self.cb.state, CircuitState.OPEN)

        # Successful frame read recovers the circuit
        self.cb.record_success()
        self.assertEqual(self.cb.state, CircuitState.CLOSED)
        self.assertEqual(self.cb.consecutive_failures, 0)
        self.assertEqual(self.cb.current_backoff, 10.0)
        self.assertFalse(self.cb.is_open())
        self.assertTrue(self.cb.allow_attempt())

    def test_manual_reset(self):
        # Trip the circuit
        for _ in range(3):
            self.cb.record_failure("Fail")
        self.assertEqual(self.cb.state, CircuitState.OPEN)

        # Manual reset forces immediate HALF_OPEN trial
        self.cb.reset()
        self.assertEqual(self.cb.state, CircuitState.HALF_OPEN)
        self.assertTrue(self.cb.allow_attempt())

    def test_get_status_structure(self):
        self.cb.record_failure("Test error reason")
        status = self.cb.get_status()
        self.assertIn("state", status)
        self.assertIn("consecutive_failures", status)
        self.assertIn("current_backoff_sec", status)
        self.assertIn("next_probe_remaining_sec", status)
        self.assertIn("is_dormant", status)
        self.assertIn("last_failure_reason", status)
        self.assertEqual(status["last_failure_reason"], "Test error reason")
        self.assertEqual(status["consecutive_failures"], 1)

    def test_camera_stream_manager_recheck_all(self):
        manager = CameraStreamManager()
        mock_cctv = MagicMock()
        mock_ptz = MagicMock()

        manager.cctv_streams[0] = mock_cctv
        manager.ptz_streams[0] = mock_ptz

        results = manager.recheck_all_cameras()
        mock_cctv.recheck.assert_called_once()
        mock_ptz.recheck.assert_called_once()
        self.assertIn("cctv_0", results)
        self.assertIn("ptz_0", results)


if __name__ == "__main__":
    unittest.main()

