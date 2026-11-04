import unittest
from unittest.mock import patch, MagicMock
import time

from app.config import (
    get_server_geofence_config,
    invalidate_server_geofence_cache,
    DEFAULT_GEOFENCE_CONFIG,
    GEOFENCE_CACHE_TTL_SECONDS,
)


class TestGeofenceCache(unittest.TestCase):
    def setUp(self):
        invalidate_server_geofence_cache()

    def tearDown(self):
        invalidate_server_geofence_cache()

    def test_geofence_cache_hit_avoids_repeated_db_queries(self):
        """Verifies that consecutive calls within TTL reuse the cached config without querying Supabase."""
        mock_db_res = MagicMock()
        mock_db_res.data = [{
            "value": {
                "enabled": True,
                "latitude": 22.4998,
                "longitude": 88.3716,
                "radiusMeters": 50.0,
                "campusName": "Medical College Campus",
            }
        }]

        with patch("app.config.supabase") as mock_supabase:
            mock_table = MagicMock()
            mock_supabase.table.return_value = mock_table
            mock_table.select.return_value = mock_table
            mock_table.eq.return_value = mock_table
            mock_table.execute.return_value = mock_db_res

            # First call: cache miss -> queries DB
            cfg1 = get_server_geofence_config()
            self.assertEqual(cfg1["latitude"], 22.4998)
            self.assertEqual(cfg1["radiusMeters"], 50.0)
            self.assertEqual(mock_table.execute.call_count, 1)

            # Second call: cache hit -> must NOT query DB again
            cfg2 = get_server_geofence_config()
            self.assertEqual(cfg2["latitude"], 22.4998)
            self.assertEqual(mock_table.execute.call_count, 1)

            # Third call: cache hit -> still 1 DB query
            cfg3 = get_server_geofence_config()
            self.assertEqual(cfg3["campusName"], "Medical College Campus")
            self.assertEqual(mock_table.execute.call_count, 1)

    def test_force_refresh_bypasses_cache(self):
        """Verifies that force_refresh=True re-queries the database."""
        mock_db_res = MagicMock()
        mock_db_res.data = [{
            "value": {
                "enabled": True,
                "latitude": 22.4998,
                "longitude": 88.3716,
                "radiusMeters": 40.0,
                "campusName": "Campus",
            }
        }]

        with patch("app.config.supabase") as mock_supabase:
            mock_table = MagicMock()
            mock_supabase.table.return_value = mock_table
            mock_table.select.return_value = mock_table
            mock_table.eq.return_value = mock_table
            mock_table.execute.return_value = mock_db_res

            get_server_geofence_config()
            self.assertEqual(mock_table.execute.call_count, 1)

            # Force refresh triggers 2nd query
            get_server_geofence_config(force_refresh=True)
            self.assertEqual(mock_table.execute.call_count, 2)

    def test_invalidate_cache_clears_memory(self):
        """Verifies that invalidate_server_geofence_cache forces next call to re-query DB."""
        mock_db_res = MagicMock()
        mock_db_res.data = [{
            "value": {
                "enabled": True,
                "latitude": 22.4998,
                "longitude": 88.3716,
                "radiusMeters": 40.0,
                "campusName": "Campus",
            }
        }]

        with patch("app.config.supabase") as mock_supabase:
            mock_table = MagicMock()
            mock_supabase.table.return_value = mock_table
            mock_table.select.return_value = mock_table
            mock_table.eq.return_value = mock_table
            mock_table.execute.return_value = mock_db_res

            get_server_geofence_config()
            self.assertEqual(mock_table.execute.call_count, 1)

            invalidate_server_geofence_cache()

            get_server_geofence_config()
            self.assertEqual(mock_table.execute.call_count, 2)

    def test_fault_tolerant_fallback_on_db_exception(self):
        """Verifies that if DB throws an exception, cached config is preserved rather than failing."""
        mock_db_res = MagicMock()
        mock_db_res.data = [{
            "value": {
                "enabled": True,
                "latitude": 22.5000,
                "longitude": 88.3700,
                "radiusMeters": 60.0,
                "campusName": "Cached Campus",
            }
        }]

        with patch("app.config.supabase") as mock_supabase:
            mock_table = MagicMock()
            mock_supabase.table.return_value = mock_table
            mock_table.select.return_value = mock_table
            mock_table.eq.return_value = mock_table
            mock_table.execute.return_value = mock_db_res

            # Warm cache
            cfg = get_server_geofence_config()
            self.assertEqual(cfg["campusName"], "Cached Campus")

            # Now simulate DB crash during force refresh
            mock_table.execute.side_effect = Exception("Supabase Connection Timeout")

            fallback_cfg = get_server_geofence_config(force_refresh=True)
            self.assertEqual(fallback_cfg["campusName"], "Cached Campus")
            self.assertEqual(fallback_cfg["latitude"], 22.5000)


if __name__ == "__main__":
    unittest.main()
