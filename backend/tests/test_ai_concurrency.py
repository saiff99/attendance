import unittest
import os
import sys
import asyncio
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.ai import get_ai_semaphore, reset_ai_semaphore


class TestAIConcurrencyLimiter(unittest.IsolatedAsyncioTestCase):
    """
    Unit test suite verifying AI Inference Concurrency Limiting (asyncio.Semaphore guard).
    Protects InsightFace ONNX neural models from CPU thread thrashing and memory exhaustion
    when 100+ students submit selfies simultaneously during classroom attendance spikes.
    """

    def setUp(self):
        reset_ai_semaphore()

    def tearDown(self):
        reset_ai_semaphore()
        if "AI_CONCURRENCY_LIMIT" in os.environ:
            del os.environ["AI_CONCURRENCY_LIMIT"]

    async def test_default_concurrency_limit(self):
        """Verifies default semaphore capacity is 4."""
        sem = get_ai_semaphore()
        self.assertIsInstance(sem, asyncio.Semaphore)
        # Value starts at 4
        self.assertEqual(sem._value, 4)

    async def test_custom_concurrency_limit_via_env(self):
        """Verifies AI_CONCURRENCY_LIMIT environment variable configures capacity."""
        os.environ["AI_CONCURRENCY_LIMIT"] = "2"
        reset_ai_semaphore()
        sem = get_ai_semaphore()
        self.assertEqual(sem._value, 2)

    async def test_concurrency_limit_clamping(self):
        """Verifies limit is clamped between 1 and 16."""
        # Test lower bound (0 or negative clamped to 1)
        os.environ["AI_CONCURRENCY_LIMIT"] = "0"
        reset_ai_semaphore()
        sem_min = get_ai_semaphore()
        self.assertEqual(sem_min._value, 1)

        # Test upper bound (clamped to 16)
        os.environ["AI_CONCURRENCY_LIMIT"] = "50"
        reset_ai_semaphore()
        sem_max = get_ai_semaphore()
        self.assertEqual(sem_max._value, 16)

    async def test_strict_concurrency_bounding_under_load(self):
        """
        Simulates 20 concurrent student inference requests under limit=3.
        Asserts active parallel executions never exceed 3 at any point in time.
        """
        os.environ["AI_CONCURRENCY_LIMIT"] = "3"
        reset_ai_semaphore()
        sem = get_ai_semaphore()

        active_count = 0
        max_active_observed = 0
        lock = asyncio.Lock()
        completed = 0

        async def simulate_student_inference(idx: int):
            nonlocal active_count, max_active_observed, completed
            async with sem:
                async with lock:
                    active_count += 1
                    if active_count > max_active_observed:
                        max_active_observed = active_count

                # Simulate AI neural inference delay (~15ms)
                await asyncio.sleep(0.015)

                async with lock:
                    active_count -= 1
                    completed += 1

        tasks = [simulate_student_inference(i) for i in range(20)]
        await asyncio.gather(*tasks)

        self.assertEqual(completed, 20, "All 20 simulated students must complete")
        self.assertLessEqual(max_active_observed, 3, "Max concurrent active inferences must not exceed 3")
        self.assertEqual(active_count, 0, "All slots must be cleanly released back to 0 active")
        self.assertEqual(sem._value, 3, "Semaphore capacity must return to initial state")

    async def test_exception_safety_and_slot_release(self):
        """Verifies that an error inside an inference block releases the semaphore slot immediately."""
        os.environ["AI_CONCURRENCY_LIMIT"] = "2"
        reset_ai_semaphore()
        sem = get_ai_semaphore()

        async def failing_inference():
            async with sem:
                raise ValueError("Simulated corrupted image input")

        with self.assertRaises(ValueError):
            await failing_inference()

        # Slot was released despite exception
        self.assertEqual(sem._value, 2, "Semaphore capacity must be fully restored after exception")

        # Next normal task can acquire without blockage
        acquired = False
        async with sem:
            acquired = True
        self.assertTrue(acquired)


if __name__ == "__main__":
    unittest.main()
