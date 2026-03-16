"""Vertical land motion (VLM) correction layer.

Combines:
1. ICE-6G_C GIA grid (global baseline, 1 degree resolution, mm/year)
2. NGL/MIDAS GPS total VLM (replaces GIA where stations are nearby)

Negative rate = subsidence (land sinking, increases effective SLR)
Positive rate = uplift (land rising, decreases effective SLR)
"""

import json
import os
import numpy as np
from functools import lru_cache
from typing import Optional, Dict

_gia_grid = None   # ICE-6G_C: {"lats": [...], "lons": [...], "rates": 2D list}
_gps_stations = None  # MIDAS: [{"lat", "lon", "vlm_mm_yr", "name"}, ...]
_gps_tree = None

# Use GPS total VLM if a station is within this distance (degrees, ~55 km)
GPS_MAX_DISTANCE_DEG = 0.5


def load_vlm(gia_path: str = None, gps_path: str = None) -> bool:
    """Load VLM correction data. Returns True if at least one source loaded."""
    global _gia_grid, _gps_stations, _gps_tree

    loaded_any = False

    if gia_path and os.path.exists(gia_path):
        try:
            with open(gia_path) as f:
                _gia_grid = json.load(f)
            _gia_grid["_lats"] = np.array(_gia_grid["lats"], dtype=np.float64)
            _gia_grid["_lons"] = np.array(_gia_grid["lons"], dtype=np.float64)
            _gia_grid["_rates"] = np.array(_gia_grid["rates"], dtype=np.float64)
            print(f"✓ Loaded GIA grid: {len(_gia_grid['lats'])}×{len(_gia_grid['lons'])} cells")
            loaded_any = True
        except Exception as e:
            print(f"✗ Failed to load GIA grid: {e}")
            _gia_grid = None
    else:
        if gia_path:
            print(f"ℹ GIA grid not found at {gia_path}")

    if gps_path and os.path.exists(gps_path):
        try:
            with open(gps_path) as f:
                _gps_stations = json.load(f)

            from scipy.spatial import cKDTree
            coords = np.array([[s["lat"], s["lon"]] for s in _gps_stations])
            _gps_tree = cKDTree(np.radians(coords))
            print(f"✓ Loaded {len(_gps_stations)} GPS/MIDAS VLM stations")
            loaded_any = True
        except Exception as e:
            print(f"✗ Failed to load GPS VLM data: {e}")
            _gps_stations = None
            _gps_tree = None
    else:
        if gps_path:
            print(f"ℹ GPS VLM data not found at {gps_path}")

    if not loaded_any:
        print("ℹ No VLM data loaded (run download_vlm.py for GIA + GPS corrections)")

    return loaded_any


def is_loaded() -> bool:
    return _gia_grid is not None or _gps_stations is not None


@lru_cache(maxsize=8192)
def get_vlm_rate(lat: float, lon: float) -> float:
    """Get vertical land motion rate at a location in mm/year.

    Negative = subsidence, Positive = uplift.

    Priority:
    1. NGL/MIDAS GPS total VLM if station within ~55km (includes GIA + anthropogenic)
    2. ICE-6G_C GIA grid (GIA only, global fallback)
    3. 0.0 if no data available
    """
    # GPS total VLM first (already includes GIA — don't double-count)
    if _gps_tree is not None:
        query_rad = np.radians([lat, lon])
        max_dist_rad = np.radians(GPS_MAX_DISTANCE_DEG)
        dist, idx = _gps_tree.query(query_rad)

        if dist <= max_dist_rad:
            return float(_gps_stations[int(idx)]["vlm_mm_yr"])

    # GIA grid fallback
    if _gia_grid is not None:
        return _lookup_gia(lat, lon)

    return 0.0


def _lookup_gia(lat: float, lon: float) -> float:
    """Bilinear interpolation from the ICE-6G_C GIA grid."""
    lats = _gia_grid["_lats"]
    lons = _gia_grid["_lons"]
    rates = _gia_grid["_rates"]

    # Normalize longitude to grid range
    grid_lon = lon
    if grid_lon < lons[0]:
        grid_lon += 360
    elif grid_lon > lons[-1]:
        grid_lon -= 360

    # Find bracketing indices
    lat_idx = int(np.searchsorted(lats, lat)) - 1
    lon_idx = int(np.searchsorted(lons, grid_lon)) - 1

    lat_idx = max(0, min(lat_idx, len(lats) - 2))
    lon_idx = max(0, min(lon_idx, len(lons) - 2))

    # Bilinear interpolation weights
    lat_frac = (lat - lats[lat_idx]) / max(lats[lat_idx + 1] - lats[lat_idx], 1e-10)
    lon_frac = (grid_lon - lons[lon_idx]) / max(lons[lon_idx + 1] - lons[lon_idx], 1e-10)
    lat_frac = max(0.0, min(1.0, float(lat_frac)))
    lon_frac = max(0.0, min(1.0, float(lon_frac)))

    v00 = rates[lat_idx, lon_idx]
    v01 = rates[lat_idx, lon_idx + 1]
    v10 = rates[lat_idx + 1, lon_idx]
    v11 = rates[lat_idx + 1, lon_idx + 1]

    return float(
        v00 * (1 - lat_frac) * (1 - lon_frac) +
        v01 * (1 - lat_frac) * lon_frac +
        v10 * lat_frac * (1 - lon_frac) +
        v11 * lat_frac * lon_frac
    )


def get_vlm_info(lat: float, lon: float) -> Dict:
    """Get detailed VLM info for a location (for API response)."""
    result = {
        "vlm_mm_yr": get_vlm_rate(lat, lon),
        "source": "none",
        "lat": lat,
        "lon": lon,
    }

    if _gps_tree is not None:
        query_rad = np.radians([lat, lon])
        max_dist_rad = np.radians(GPS_MAX_DISTANCE_DEG)
        dist, idx = _gps_tree.query(query_rad)

        if dist <= max_dist_rad:
            station = _gps_stations[int(idx)]
            result["source"] = "gps_midas"
            result["station_dist_km"] = round(float(dist) * 6371, 1)
            result["station_name"] = station.get("name", "unknown")
            return result

    if _gia_grid is not None:
        result["source"] = "gia_ice6g"

    return result


def resolve_vlm_offset(lat: float, lon: float, year: int,
                       baseline_year: int = 2005) -> float:
    """Compute cumulative VLM offset in meters for a projection year.

    Positive return = additional effective SLR (land subsiding).
    Negative return = reduced effective SLR (land uplifting).
    """
    rate_mm_yr = get_vlm_rate(lat, lon)
    years_elapsed = year - baseline_year
    # Negate: subsidence (negative VLM) increases effective SLR (positive offset)
    return (-rate_mm_yr * years_elapsed) / 1000.0
