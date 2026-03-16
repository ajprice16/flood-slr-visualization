"""IPCC AR6 sea level projection resolver.

Loads regional SLR projections and resolves scenario+year+percentile to meters
for any geographic location using spatial interpolation.

Includes embedded global mean fallback data from AR6 Table 9.9 so the app
works without downloading the full regional dataset.
"""

import json
import os
import numpy as np
from functools import lru_cache
from typing import Optional, Dict, List

_projection_data = None
_kdtree = None

SCENARIOS = ["ssp126", "ssp245", "ssp370", "ssp585"]
SCENARIO_LABELS = {
    "ssp126": "SSP1-2.6 (Very Low)",
    "ssp245": "SSP2-4.5 (Intermediate)",
    "ssp370": "SSP3-7.0 (High)",
    "ssp585": "SSP5-8.5 (Very High)",
}
PERCENTILES = [5, 50, 95]

# Embedded IPCC AR6 global mean SLR (meters above 1995-2014 baseline)
# Source: AR6 WG1 Chapter 9, Table 9.9 + Figure 9.28 interpolation
_GLOBAL_MEAN_YEARS = [2030, 2040, 2050, 2060, 2070, 2080, 2090, 2100, 2110, 2120, 2130, 2140, 2150]

_GLOBAL_MEAN = {
    "ssp126": {
        "5":  [0.06, 0.10, 0.13, 0.16, 0.19, 0.22, 0.25, 0.28, 0.29, 0.30, 0.31, 0.32, 0.33],
        "50": [0.08, 0.13, 0.18, 0.22, 0.26, 0.30, 0.34, 0.38, 0.40, 0.42, 0.43, 0.44, 0.46],
        "95": [0.10, 0.16, 0.23, 0.29, 0.35, 0.41, 0.48, 0.55, 0.59, 0.63, 0.66, 0.69, 0.72],
    },
    "ssp245": {
        "5":  [0.07, 0.11, 0.15, 0.20, 0.25, 0.31, 0.37, 0.44, 0.47, 0.49, 0.51, 0.53, 0.55],
        "50": [0.09, 0.14, 0.20, 0.27, 0.34, 0.41, 0.48, 0.56, 0.61, 0.66, 0.70, 0.73, 0.77],
        "95": [0.11, 0.18, 0.26, 0.35, 0.45, 0.55, 0.65, 0.76, 0.84, 0.93, 1.01, 1.08, 1.15],
    },
    "ssp370": {
        "5":  [0.07, 0.12, 0.16, 0.22, 0.29, 0.37, 0.46, 0.55, 0.59, 0.64, 0.67, 0.71, 0.75],
        "50": [0.09, 0.15, 0.22, 0.30, 0.39, 0.49, 0.59, 0.68, 0.76, 0.84, 0.89, 0.95, 1.01],
        "95": [0.12, 0.20, 0.28, 0.39, 0.51, 0.64, 0.78, 0.93, 1.05, 1.18, 1.28, 1.39, 1.50],
    },
    "ssp585": {
        "5":  [0.07, 0.12, 0.17, 0.24, 0.32, 0.41, 0.52, 0.63, 0.69, 0.75, 0.80, 0.84, 0.88],
        "50": [0.10, 0.16, 0.23, 0.32, 0.42, 0.53, 0.65, 0.77, 0.87, 0.97, 1.05, 1.12, 1.19],
        "95": [0.13, 0.21, 0.30, 0.42, 0.56, 0.71, 0.87, 1.01, 1.16, 1.32, 1.45, 1.59, 1.72],
    },
}


def load_projections(data_path: str) -> bool:
    """Load IPCC AR6 regional projection data from JSON file.

    If the file doesn't exist, the module still works using embedded global
    mean values. Returns True if regional data loaded, False if using fallback.
    """
    global _projection_data, _kdtree

    if not os.path.exists(data_path):
        print(f"ℹ Regional IPCC projections not found at {data_path}")
        print("  Using embedded global mean fallback (run download_ipcc_ar6.py for regional data)")
        return False

    try:
        with open(data_path) as f:
            _projection_data = json.load(f)

        from scipy.spatial import cKDTree
        points = np.array(_projection_data["grid_points"])  # Nx2 (lat, lon)
        _kdtree = cKDTree(np.radians(points))

        n_pts = len(_projection_data["grid_points"])
        scenarios = _projection_data.get("scenarios", [])
        years = _projection_data.get("years", [])
        print(f"✓ Loaded IPCC AR6 regional projections: {n_pts} grid points, "
              f"{len(scenarios)} scenarios, years {years[0]}-{years[-1]}")
        return True
    except Exception as e:
        print(f"✗ Failed to load regional projections: {e}")
        print("  Using embedded global mean fallback")
        _projection_data = None
        _kdtree = None
        return False


def is_loaded() -> bool:
    """True if regional data is loaded; False means global mean fallback."""
    return _projection_data is not None and _kdtree is not None


def _interpolate_years(values: list, years: list, target_year: int) -> float:
    """Linearly interpolate a value for a target year from decade-spaced data."""
    if target_year <= years[0]:
        return values[0]
    if target_year >= years[-1]:
        return values[-1]
    for i in range(len(years) - 1):
        if years[i] <= target_year <= years[i + 1]:
            frac = (target_year - years[i]) / (years[i + 1] - years[i])
            return values[i] + frac * (values[i + 1] - values[i])
    return values[-1]


def _resolve_global_mean(scenario: str, year: int, percentile: int) -> Optional[float]:
    """Resolve SLR from embedded global mean data."""
    pct_key = str(percentile)
    gm = _GLOBAL_MEAN.get(scenario, {}).get(pct_key)
    if gm is None:
        return None
    return _interpolate_years(gm, _GLOBAL_MEAN_YEARS, year)


@lru_cache(maxsize=4096)
def resolve_slr(lat: float, lon: float, scenario: str, year: int,
                percentile: int = 50) -> Optional[float]:
    """Resolve regional SLR in meters for a location and scenario.

    Uses inverse-distance weighted interpolation from nearest IPCC grid points.
    Falls back to global mean if no regional data or no grid point within 5 degrees.

    Args:
        lat, lon: Geographic coordinates (EPSG:4326)
        scenario: SSP scenario (e.g., "ssp245")
        year: Projection year (2030-2150)
        percentile: 5, 50, or 95

    Returns:
        SLR in meters relative to 1995-2014 baseline, or None if invalid params.
    """
    if scenario not in SCENARIOS:
        return None
    if percentile not in PERCENTILES:
        return None

    # Without regional data, use global mean
    if not is_loaded():
        return _resolve_global_mean(scenario, year, percentile)

    data = _projection_data
    pct_key = str(percentile)
    if pct_key not in data["values"].get(scenario, {}):
        return _resolve_global_mean(scenario, year, percentile)

    years = data["years"]

    # Find nearest grid points (up to 4 for IDW)
    query_rad = np.radians([lat, lon])
    k = min(4, len(data["grid_points"]))
    dists, indices = _kdtree.query(query_rad, k=k)

    if np.isscalar(dists):
        dists = np.array([dists])
        indices = np.array([indices])

    # If nearest point is beyond ~5 degrees, fall back to global mean
    max_dist_rad = np.radians(5.0)
    if dists[0] > max_dist_rad:
        return _resolve_global_mean(scenario, year, percentile)

    # IDW interpolation from nearby grid points
    values_arr = data["values"][scenario][pct_key]
    total_weight = 0.0
    weighted_val = 0.0

    for dist, idx in zip(dists, indices):
        if dist > max_dist_rad:
            continue
        weight = 1.0 / max(float(dist), 1e-10)

        # Interpolate across years for this grid point
        point_values = values_arr[int(idx)]
        val = _interpolate_years(point_values, years, year)

        weighted_val += weight * val
        total_weight += weight

    if total_weight == 0:
        return _resolve_global_mean(scenario, year, percentile)

    return weighted_val / total_weight


def get_projection_at(lat: float, lon: float) -> Dict:
    """Get full projection table for a location (all scenarios, years, percentiles)."""
    source = "regional" if is_loaded() else "global_mean"
    years = _projection_data["years"] if is_loaded() else _GLOBAL_MEAN_YEARS

    result = {
        "source": source,
        "years": years,
        "lat": lat,
        "lon": lon,
        "scenarios": {},
    }

    for scenario in SCENARIOS:
        result["scenarios"][scenario] = {}
        for pct in PERCENTILES:
            vals = []
            for yr in years:
                v = resolve_slr(lat, lon, scenario, yr, pct)
                vals.append(round(v, 4) if v is not None else None)
            result["scenarios"][scenario][str(pct)] = vals

    return result


def get_available_info() -> Dict:
    """Return metadata about available projections."""
    return {
        "regional_loaded": is_loaded(),
        "scenarios": SCENARIOS,
        "scenario_labels": SCENARIO_LABELS,
        "years": _projection_data["years"] if is_loaded() else _GLOBAL_MEAN_YEARS,
        "percentiles": PERCENTILES,
        "grid_point_count": len(_projection_data["grid_points"]) if is_loaded() else 0,
    }
