"""Shared pytest fixtures for the backend test suite.

The FastAPI app and its lifespan startup require rasterio datasets and
projection files that are not present in the test environment.  We patch
the lifespan so the app can be mounted in a TestClient without hitting
the file system, and then provide targeted mocks for each test module.
"""

import sys
import os
import io
import types
import numpy as np
import pytest

# Ensure the Backend directory is on sys.path so `import main`, `import projection` etc. work
BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


# ---------------------------------------------------------------------------
# Lightweight rasterio stub used when DEM files are not available
# ---------------------------------------------------------------------------

def make_fake_dem_bytes(elevation_array: np.ndarray = None) -> bytes:
    """Return the bytes of a minimal in-memory GeoTIFF."""
    import rasterio
    from rasterio.transform import from_bounds

    if elevation_array is None:
        elevation_array = np.zeros((10, 10), dtype=np.float32)

    buf = io.BytesIO()
    transform = from_bounds(west=139.0, south=35.0, east=140.0, north=36.0,
                             width=elevation_array.shape[1], height=elevation_array.shape[0])
    with rasterio.open(
        buf, mode='w', driver='GTiff',
        height=elevation_array.shape[0], width=elevation_array.shape[1],
        count=1, dtype=str(elevation_array.dtype),
        crs='EPSG:4326', transform=transform
    ) as dst:
        dst.write(elevation_array, 1)
    buf.seek(0)
    return buf.read()


@pytest.fixture(scope="session")
def fake_dem_bytes():
    """Session-scoped fixture: in-memory 10×10 zero-elevation GeoTIFF."""
    arr = np.zeros((10, 10), dtype=np.float32)
    return make_fake_dem_bytes(arr)


@pytest.fixture(scope="session")
def fake_dem_bytes_low():
    """Session-scoped fixture: 10×10 DEM where all elevations are 0.5 m (floods at slr>0.5)."""
    arr = np.full((10, 10), 0.5, dtype=np.float32)
    return make_fake_dem_bytes(arr)


# ---------------------------------------------------------------------------
# FastAPI TestClient fixture — app started without lifespan side-effects
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def test_client():
    """Return a Starlette/FastAPI TestClient with the lifespan bypassed.

    The lifespan calls build_tile_index(), load_population_data() and
    tries to load optional data files.  We patch those functions to no-ops
    so the client can be created in a clean test environment.
    """
    from contextlib import asynccontextmanager
    from unittest.mock import patch, MagicMock

    @asynccontextmanager
    async def _noop_lifespan(app):
        yield

    with patch("main.lifespan", _noop_lifespan), \
         patch("main.build_tile_index", return_value={}), \
         patch("main.load_population_data", return_value=False):
        import main as app_module
        # Replace the lifespan on the already-created app instance
        app_module.app.router.lifespan_context = _noop_lifespan
        from starlette.testclient import TestClient
        with TestClient(app_module.app, raise_server_exceptions=True) as client:
            yield client, app_module
