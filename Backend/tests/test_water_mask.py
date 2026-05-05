"""Unit tests for the optional water-mask framework."""

import os
import sys

import numpy as np
import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import water_mask


def test_noop_provider_returns_none():
    provider = water_mask.NoWaterMaskProvider()
    provider.load()
    assert provider.mask_for_bounds((0.0, 0.0, 1.0, 1.0), (8, 8), None, "EPSG:3857") is None


def test_raster_provider_can_load_and_reproject(tmp_path):
    rasterio = pytest.importorskip("rasterio")
    from rasterio.transform import from_bounds

    path = tmp_path / "mask.tif"
    arr = np.zeros((4, 4), dtype=np.uint8)
    arr[1:3, 1:3] = 1

    with rasterio.open(
        path,
        mode="w",
        driver="GTiff",
        height=4,
        width=4,
        count=1,
        dtype="uint8",
        crs="EPSG:4326",
        transform=from_bounds(0.0, 0.0, 1.0, 1.0, 4, 4),
    ) as dst:
        dst.write(arr, 1)

    provider = water_mask.RasterWaterMaskProvider(str(path))
    provider.load()
    mask = provider.mask_for_bounds((0.0, 0.0, 1.0, 1.0), (8, 8), from_bounds(0.0, 0.0, 1.0, 1.0, 8, 8), "EPSG:4326")
    assert mask is not None
    assert mask.dtype == bool
    assert mask.shape == (8, 8)