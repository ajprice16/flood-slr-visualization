"""Optional water-mask framework for tile rendering.

The application does not currently ship with an authoritative water-mask
dataset. This module provides a no-op default plus an optional raster-backed
provider so future masks can be plugged in without changing the renderer again.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from typing import Optional, Tuple

import numpy as np


Bounds = Tuple[float, float, float, float]


class WaterMaskProvider(ABC):
    """Abstract water-mask provider."""

    @abstractmethod
    def load(self) -> None:
        """Load any backing resources."""

    @abstractmethod
    def mask_for_bounds(self, bounds: Bounds, shape: Tuple[int, int], dst_transform, dst_crs) -> Optional[np.ndarray]:
        """Return a boolean mask aligned to the destination grid, or None."""


class NoWaterMaskProvider(WaterMaskProvider):
    """Fallback provider used when no water-mask data is configured."""

    def load(self) -> None:
        return None

    def mask_for_bounds(self, bounds: Bounds, shape: Tuple[int, int], dst_transform, dst_crs) -> Optional[np.ndarray]:
        return None


class RasterWaterMaskProvider(WaterMaskProvider):
    """Optional raster-backed provider.

    The raster is interpreted as a binary water mask where values > 0.5 indicate
    water or areas where flood propagation should be allowed.
    """

    def __init__(self, raster_path: str):
        self.raster_path = raster_path
        self.dataset = None

    def load(self) -> None:
        if not self.raster_path or not os.path.exists(self.raster_path):
            self.dataset = None
            return
        import rasterio

        self.dataset = rasterio.open(self.raster_path)

    def mask_for_bounds(self, bounds: Bounds, shape: Tuple[int, int], dst_transform, dst_crs) -> Optional[np.ndarray]:
        if self.dataset is None:
            return None

        import rasterio
        from rasterio.warp import reproject, Resampling

        mask = np.full(shape, np.nan, dtype=np.float32)
        reproject(
            source=rasterio.band(self.dataset, 1),
            destination=mask,
            src_transform=self.dataset.transform,
            src_crs=self.dataset.crs,
            dst_transform=dst_transform,
            dst_crs=dst_crs,
            src_nodata=self.dataset.nodata,
            dst_nodata=np.nan,
            resampling=Resampling.nearest,
        )
        finite = np.isfinite(mask)
        return finite & (mask > 0.5)


def load_provider() -> WaterMaskProvider:
    """Create and load the configured water-mask provider."""
    raster_path = os.environ.get("WATER_MASK_RASTER", "").strip()
    if not raster_path:
        provider = NoWaterMaskProvider()
        provider.load()
        return provider

    provider = RasterWaterMaskProvider(raster_path)
    try:
        provider.load()
    except Exception:
        provider = NoWaterMaskProvider()
        provider.load()
    return provider