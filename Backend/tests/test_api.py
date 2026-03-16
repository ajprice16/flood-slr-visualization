"""Integration tests for the FastAPI endpoints in main.py.

These tests run against a TestClient with the lifespan startup bypassed
(no DEM tiles, no population rasters), which exercises parameter validation,
response shapes, and error handling without needing the full dataset.
"""

import sys
import os
import io
import numpy as np
import pytest
from collections import defaultdict
from unittest.mock import patch, MagicMock

BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_dem_bytes(elevation=0.5, height=10, width=10,
                    west=139.0, south=35.0, east=140.0, north=36.0):
    """Create an in-memory GeoTIFF for a 1°×1° region."""
    import rasterio
    from rasterio.transform import from_bounds

    arr = np.full((height, width), elevation, dtype=np.float32)
    buf = io.BytesIO()
    transform = from_bounds(west=west, south=south, east=east, north=north,
                             width=width, height=height)
    with rasterio.open(
        buf, mode='w', driver='GTiff',
        height=height, width=width, count=1,
        dtype='float32', crs='EPSG:4326', transform=transform
    ) as dst:
        dst.write(arr, 1)
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# Shared client fixture — lifespan bypassed
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def client():
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def _noop_lifespan(app):
        yield

    # Patch at import time before the module is imported
    with patch("main.build_tile_index", return_value={}), \
         patch("main.load_population_data", return_value=False):
        import main as app_module
        # Swap lifespan so TestClient doesn't call the real startup
        app_module.app.router.lifespan_context = _noop_lifespan
        from starlette.testclient import TestClient
        with TestClient(app_module.app, raise_server_exceptions=True) as c:
            yield c, app_module


# ---------------------------------------------------------------------------
# /health
# ---------------------------------------------------------------------------

class TestHealth:
    def test_returns_ok(self, client):
        c, _ = client
        resp = c.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "tiles_indexed" in data


# ---------------------------------------------------------------------------
# /tiles/info
# ---------------------------------------------------------------------------

class TestTilesInfo:
    def test_returns_total_tiles(self, client):
        c, app_module = client
        app_module.TILE_INDEX = {}
        resp = c.get("/tiles/info")
        assert resp.status_code == 200
        assert resp.json()["total_tiles"] == 0


# ---------------------------------------------------------------------------
# /tiles/{z}/{x}/{y} — parameter validation
# ---------------------------------------------------------------------------

class TestGetTileValidation:
    def test_negative_zoom_rejected(self, client):
        c, _ = client
        resp = c.get("/tiles/-1/0/0?slr=1.0")
        assert resp.status_code == 400

    def test_zoom_too_large_rejected(self, client):
        c, _ = client
        resp = c.get("/tiles/23/0/0?slr=1.0")
        assert resp.status_code == 400

    def test_x_out_of_range_rejected(self, client):
        c, _ = client
        # At zoom=0 only tile (0,0) is valid
        resp = c.get("/tiles/0/2/0?slr=1.0")
        assert resp.status_code == 400

    def test_y_out_of_range_rejected(self, client):
        c, _ = client
        resp = c.get("/tiles/0/0/2?slr=1.0")
        assert resp.status_code == 400

    def test_valid_tile_no_dem_returns_transparent_png(self, client):
        c, app_module = client
        app_module.TILE_INDEX = {}
        app_module.TILE_GRID = defaultdict(list)
        resp = c.get("/tiles/9/156/200?slr=1.0")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "image/png"

    def test_valid_tile_returns_png_content_type(self, client):
        c, app_module = client
        app_module.TILE_INDEX = {}
        app_module.TILE_GRID = defaultdict(list)
        resp = c.get("/tiles/5/0/0?slr=0.0")
        assert resp.status_code == 200
        assert "image/png" in resp.headers["content-type"]


# ---------------------------------------------------------------------------
# /tiles/{z}/{x}/{y} — with a real in-memory DEM tile
# ---------------------------------------------------------------------------

class TestGetTileWithDem:
    def test_flooded_tile_non_empty(self, client, tmp_path):
        """With a low-elevation DEM and slr=2.0, the tile should not be the
        transparent empty tile (it should have some coloured pixels)."""
        c, app_module = client
        import math

        dem_bytes = _make_dem_bytes(elevation=0.5)
        dem_path = tmp_path / "DiluviumDEM_N35_00_E139_00.tif"
        dem_path.write_bytes(dem_bytes)

        tile_name = "DiluviumDEM_N35_00_E139_00"
        app_module.TILE_INDEX = {
            tile_name: {
                "bounds": (139.0, 35.0, 140.0, 36.0),
                "lat_min": 35.0, "lat_max": 36.0,
                "lon_min": 139.0, "lon_max": 140.0,
                "path": str(dem_path),
            }
        }
        app_module.TILE_GRID = defaultdict(list)
        for lat_cell in range(35, 36):
            for lon_cell in range(139, 140):
                app_module.TILE_GRID[(lat_cell, lon_cell)].append(tile_name)
        # Clear the LRU cache so it doesn't reuse a previous empty result
        app_module.render_tile_png_multi_cached.cache_clear()

        # Tile 14/13743/6405 covers Tokyo area; use a zoom/tile that overlaps the DEM
        # We find one dynamically with mercantile
        import mercantile
        tiles = list(mercantile.tiles(139.0, 35.0, 140.0, 36.0, zooms=10))
        assert tiles, "mercantile returned no tiles"
        t = tiles[0]
        resp = c.get(f"/tiles/{t.z}/{t.x}/{t.y}?slr=2.0")
        assert resp.status_code == 200
        assert "image/png" in resp.headers["content-type"]


# ---------------------------------------------------------------------------
# /analyze_region — parameter handling
# ---------------------------------------------------------------------------

class TestAnalyzeRegion:
    def test_no_dem_data_returns_404(self, client):
        c, app_module = client
        app_module.TILE_INDEX = {}
        app_module.TILE_GRID = defaultdict(list)
        resp = c.get("/analyze_region?lon_min=10&lat_min=10&lon_max=11&lat_max=11&slr=1.0")
        assert resp.status_code == 404

    def test_zero_slr_returns_zero_flood(self, client, tmp_path):
        """slr ≤ 0 must short-circuit and return flooded_count=0."""
        c, app_module = client
        dem_bytes = _make_dem_bytes(elevation=0.5)
        dem_path = tmp_path / "DiluviumDEM_N35_00_E139_00.tif"
        dem_path.write_bytes(dem_bytes)
        tile_name = "DiluviumDEM_N35_00_E139_00"
        app_module.TILE_INDEX = {
            tile_name: {
                "bounds": (139.0, 35.0, 140.0, 36.0),
                "lat_min": 35.0, "lat_max": 36.0,
                "lon_min": 139.0, "lon_max": 140.0,
                "path": str(dem_path),
            }
        }
        app_module.TILE_GRID = defaultdict(list)
        app_module.TILE_GRID[(35, 139)].append(tile_name)

        resp = c.get("/analyze_region?lon_min=139&lat_min=35&lon_max=140&lat_max=36&slr=0")
        assert resp.status_code == 200
        data = resp.json()
        assert data["flooded_count"] == 0
        assert data["flood_ratio"] == 0.0

    def test_response_schema(self, client, tmp_path):
        c, app_module = client
        dem_bytes = _make_dem_bytes(elevation=0.5)
        dem_path = tmp_path / "DiluviumDEM_N35_00_E139_00.tif"
        dem_path.write_bytes(dem_bytes)
        tile_name = "DiluviumDEM_N35_00_E139_00"
        app_module.TILE_INDEX = {
            tile_name: {
                "bounds": (139.0, 35.0, 140.0, 36.0),
                "lat_min": 35.0, "lat_max": 36.0,
                "lon_min": 139.0, "lon_max": 140.0,
                "path": str(dem_path),
            }
        }
        app_module.TILE_GRID = defaultdict(list)
        app_module.TILE_GRID[(35, 139)].append(tile_name)

        resp = c.get("/analyze_region?lon_min=139&lat_min=35&lon_max=140&lat_max=36&slr=2.0")
        assert resp.status_code == 200
        data = resp.json()
        required_keys = {"bbox", "slr", "tiles_used", "flooded_count",
                         "total_valid", "flood_ratio", "flooded_pixels",
                         "elevation_min", "elevation_max"}
        assert required_keys.issubset(data.keys())

    def test_all_flooded_when_slr_above_elevation(self, client, tmp_path):
        """All pixels are at 0.5 m; slr=2.0 should flood everything."""
        c, app_module = client
        dem_bytes = _make_dem_bytes(elevation=0.5)
        dem_path = tmp_path / "DiluviumDEM_N35_00_E139_00.tif"
        dem_path.write_bytes(dem_bytes)
        tile_name = "DiluviumDEM_N35_00_E139_00"
        app_module.TILE_INDEX = {
            tile_name: {
                "bounds": (139.0, 35.0, 140.0, 36.0),
                "lat_min": 35.0, "lat_max": 36.0,
                "lon_min": 139.0, "lon_max": 140.0,
                "path": str(dem_path),
            }
        }
        app_module.TILE_GRID = defaultdict(list)
        app_module.TILE_GRID[(35, 139)].append(tile_name)

        resp = c.get("/analyze_region?lon_min=139&lat_min=35&lon_max=140&lat_max=36&slr=2.0")
        assert resp.status_code == 200
        data = resp.json()
        assert data["flood_ratio"] == pytest.approx(1.0)

    def test_none_flooded_when_slr_below_elevation(self, client, tmp_path):
        """All pixels are at 5.0 m; slr=1.0 should flood nothing."""
        c, app_module = client
        dem_bytes = _make_dem_bytes(elevation=5.0)
        dem_path = tmp_path / "DiluviumDEM_N35_00_E139_00.tif"
        dem_path.write_bytes(dem_bytes)
        tile_name = "DiluviumDEM_N35_00_E139_00"
        app_module.TILE_INDEX = {
            tile_name: {
                "bounds": (139.0, 35.0, 140.0, 36.0),
                "lat_min": 35.0, "lat_max": 36.0,
                "lon_min": 139.0, "lon_max": 140.0,
                "path": str(dem_path),
            }
        }
        app_module.TILE_GRID = defaultdict(list)
        app_module.TILE_GRID[(35, 139)].append(tile_name)

        resp = c.get("/analyze_region?lon_min=139&lat_min=35&lon_max=140&lat_max=36&slr=1.0")
        assert resp.status_code == 200
        data = resp.json()
        assert data["flooded_count"] == 0
        assert data["flood_ratio"] == 0.0


# ---------------------------------------------------------------------------
# /resolve_slr
# ---------------------------------------------------------------------------

class TestResolveSlrEndpoint:
    def test_returns_expected_fields(self, client):
        c, _ = client
        resp = c.get("/resolve_slr?lat=25.0&lon=-80.0&scenario=ssp245&year=2100&pct=50")
        assert resp.status_code == 200
        data = resp.json()
        for key in ("slr_meters", "ipcc_slr_meters", "vlm_offset_meters",
                    "scenario", "year", "percentile"):
            assert key in data

    def test_slr_meters_positive(self, client):
        c, _ = client
        resp = c.get("/resolve_slr?lat=25.0&lon=-80.0&scenario=ssp245&year=2100&pct=50")
        assert resp.json()["slr_meters"] > 0

    def test_invalid_scenario_returns_400(self, client):
        c, _ = client
        resp = c.get("/resolve_slr?lat=25.0&lon=-80.0&scenario=rcp85&year=2100&pct=50")
        assert resp.status_code == 400

    def test_invalid_percentile_returns_400(self, client):
        c, _ = client
        resp = c.get("/resolve_slr?lat=25.0&lon=-80.0&scenario=ssp245&year=2100&pct=33")
        assert resp.status_code == 400

    def test_higher_scenario_higher_slr(self, client):
        c, _ = client
        r1 = c.get("/resolve_slr?lat=0&lon=0&scenario=ssp126&year=2100&pct=50").json()
        r2 = c.get("/resolve_slr?lat=0&lon=0&scenario=ssp585&year=2100&pct=50").json()
        assert r2["slr_meters"] > r1["slr_meters"]


# ---------------------------------------------------------------------------
# /projection_info
# ---------------------------------------------------------------------------

class TestProjectionInfo:
    def test_no_location(self, client):
        c, _ = client
        resp = c.get("/projection_info")
        assert resp.status_code == 200
        data = resp.json()
        assert "scenarios" in data
        assert "years" in data

    def test_with_location(self, client):
        c, _ = client
        resp = c.get("/projection_info?lat=35.0&lon=139.0")
        assert resp.status_code == 200
        data = resp.json()
        assert "projection_at" in data
        assert "vlm" in data


# ---------------------------------------------------------------------------
# /analyze (legacy single-city endpoint)
# ---------------------------------------------------------------------------

class TestAnalyzeLegacy:
    def test_missing_city_returns_404(self, client):
        c, _ = client
        resp = c.get("/analyze?city=nonexistent_city&slr=1.0")
        assert resp.status_code == 404

    def test_with_dem_file(self, client, tmp_path):
        c, app_module = client
        dem_bytes = _make_dem_bytes(elevation=0.5)
        city_name = "test_city"
        dem_path = tmp_path / f"{city_name}.tif"
        dem_path.write_bytes(dem_bytes)

        # Temporarily point DATA_DIR at tmp_path
        original_data_dir = app_module.DATA_DIR
        app_module.DATA_DIR = str(tmp_path)
        try:
            resp = c.get(f"/analyze?city={city_name}&slr=2.0")
            assert resp.status_code == 200
            data = resp.json()
            assert data["city"] == city_name
            assert data["flood_ratio"] == pytest.approx(1.0)
        finally:
            app_module.DATA_DIR = original_data_dir


# ---------------------------------------------------------------------------
# /cities (legacy — always empty)
# ---------------------------------------------------------------------------

class TestCitiesLegacy:
    def test_returns_empty_list(self, client):
        c, _ = client
        resp = c.get("/cities")
        assert resp.status_code == 200
        assert resp.json() == {"cities": []}


# ---------------------------------------------------------------------------
# /debug/tiles_in_bbox
# ---------------------------------------------------------------------------

class TestDebugTilesInBbox:
    def test_empty_index_returns_zero(self, client):
        c, app_module = client
        app_module.TILE_INDEX = {}
        app_module.TILE_GRID = defaultdict(list)
        resp = c.get("/debug/tiles_in_bbox?lon_min=0&lat_min=0&lon_max=1&lat_max=1")
        assert resp.status_code == 200
        assert resp.json()["count"] == 0

    def test_with_tile_returns_count(self, client):
        c, app_module = client
        app_module.TILE_INDEX = {
            "T1": {
                "bounds": (0.0, 0.0, 1.0, 1.0),
                "lat_min": 0.0, "lat_max": 1.0,
                "lon_min": 0.0, "lon_max": 1.0,
                "path": "/fake/T1.tif",
            }
        }
        app_module.TILE_GRID = defaultdict(list)
        app_module.TILE_GRID[(0, 0)].append("T1")
        resp = c.get("/debug/tiles_in_bbox?lon_min=0.1&lat_min=0.1&lon_max=0.9&lat_max=0.9")
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 1
        assert "T1" in data["tiles"]
