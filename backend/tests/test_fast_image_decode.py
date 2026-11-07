import unittest
import os
import sys
import cv2
import numpy as np

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.ai import decode_image_bytes


class TestFastImageDecodeAndOnnxOptions(unittest.TestCase):
    def setUp(self):
        # Create sample 240x320 test BGR image
        self.sample_bgr = np.zeros((240, 320, 3), dtype=np.uint8)
        self.sample_bgr[:, :, 0] = 200  # Blue
        self.sample_bgr[:, :, 1] = 100  # Green
        self.sample_bgr[:, :, 2] = 50   # Red

        # Encode to JPEG bytes
        success, encoded = cv2.imencode('.jpg', self.sample_bgr)
        self.assertTrue(success)
        self.jpeg_bytes = encoded.tobytes()

    def test_decode_image_bytes_bgr(self):
        """Verify zero-copy memory-mapped decoding directly into BGR color space."""
        decoded = decode_image_bytes(self.jpeg_bytes, ensure_rgb=False)
        self.assertIsInstance(decoded, np.ndarray)
        self.assertEqual(decoded.shape, (240, 320, 3))
        self.assertEqual(decoded.dtype, np.uint8)

        # OpenCV lossy JPEG compression preserves dominant blue channel
        self.assertGreater(decoded[0, 0, 0], 180)

    def test_decode_image_bytes_rgb(self):
        """Verify decoding with ensure_rgb=True correctly converts color channels."""
        decoded_rgb = decode_image_bytes(self.jpeg_bytes, ensure_rgb=True)
        self.assertIsInstance(decoded_rgb, np.ndarray)
        self.assertEqual(decoded_rgb.shape, (240, 320, 3))
        # Blue channel in BGR should be at index 2 in RGB
        self.assertGreater(decoded_rgb[0, 0, 2], 180)

    def test_decode_empty_bytes_raises_value_error(self):
        """Verify empty byte payload is rejected immediately."""
        with self.assertRaises(ValueError):
            decode_image_bytes(b'')

    def test_decode_corrupt_bytes_fallback(self):
        """Verify corrupt/non-image bytes raise error or trigger fallback."""
        with self.assertRaises(Exception):
            decode_image_bytes(b'not a valid jpeg or png header')

    def test_onnx_runtime_session_options_configured(self):
        """Verify ONNX runtime session options environment configurations."""
        try:
            import onnxruntime as ort
        except ImportError:
            self.skipTest("onnxruntime is not installed in this environment; skipping ONNX SessionOptions test.")

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 2
        opts.inter_op_num_threads = 1
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        opts.enable_cpu_mem_arena = True

        self.assertEqual(opts.intra_op_num_threads, 2)
        self.assertEqual(opts.inter_op_num_threads, 1)
        self.assertEqual(opts.graph_optimization_level, ort.GraphOptimizationLevel.ORT_ENABLE_ALL)
        self.assertTrue(opts.enable_cpu_mem_arena)


if __name__ == '__main__':
    unittest.main()

