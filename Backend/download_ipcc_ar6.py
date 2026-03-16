#!/usr/bin/env python3
"""Download and convert IPCC AR6 sea level projections to compact JSON.

Source: IPCC AR6 WG1 sea-level projections (Garner et al., 2022)
Zenodo: https://doi.org/10.5281/zenodo.6382554

Usage:
    python download_ipcc_ar6.py [--out data/ipcc_ar6_slr.json]

The output JSON contains regional SLR projections at ~1000 coastal grid points
for 4 SSP scenarios, decades 2020-2150, and percentiles 5/50/95.
"""

import argparse
import json
import os
import sys
import tempfile
import zipfile

try:
    import requests
except ImportError:
    print("Install requests: pip install requests")
    sys.exit(1)


# Zenodo record for AR6 sea-level projections
ZENODO_RECORD = "6382554"
ZENODO_API = f"https://zenodo.org/api/records/{ZENODO_RECORD}"

SCENARIOS = ["ssp126", "ssp245", "ssp370", "ssp585"]
TARGET_QUANTILES = [0.05, 0.50, 0.95]
CONFIDENCE = "medium_confidence"


def download_ar6_data(out_dir: str) -> list:
    """Download AR6 NetCDF files from Zenodo. Returns list of downloaded paths."""
    print(f"Fetching Zenodo record {ZENODO_RECORD}...")
    resp = requests.get(ZENODO_API, timeout=30)
    resp.raise_for_status()
    record = resp.json()

    files = record.get("files", [])
    downloaded = []

    for scenario in SCENARIOS:
        pattern = f"total_{scenario}_{CONFIDENCE}_values"
        matching = [f for f in files if pattern in f.get("key", "")]
        if not matching:
            print(f"  ⚠ No file found for {scenario} ({pattern})")
            continue

        file_info = matching[0]
        url = file_info["links"]["self"]
        fname = file_info["key"]
        dest = os.path.join(out_dir, fname)

        if os.path.exists(dest):
            print(f"  ✓ Already downloaded: {fname}")
            downloaded.append((scenario, dest))
            continue

        print(f"  Downloading {fname} ({file_info.get('size', '?')} bytes)...")
        r = requests.get(url, stream=True, timeout=120)
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)

        downloaded.append((scenario, dest))
        print(f"  ✓ Downloaded: {fname}")

    return downloaded


def convert_to_json(nc_files: list, out_path: str):
    """Convert AR6 NetCDF files to compact JSON."""
    try:
        import netCDF4
    except ImportError:
        print("Install netCDF4: pip install netCDF4")
        sys.exit(1)

    result = {
        "grid_points": None,  # [[lat, lon], ...]
        "scenarios": [],
        "years": None,
        "percentiles": [5, 50, 95],
        "values": {},       # scenario -> pct_str -> [[val_per_year], ...]
        "global_mean": {},  # scenario -> pct_str -> [val_per_year]
    }

    for scenario, nc_path in nc_files:
        print(f"  Processing {scenario}...")
        ds = netCDF4.Dataset(nc_path, "r")

        # Extract coordinates
        lats = ds.variables["lat"][:].data
        lons = ds.variables["lon"][:].data
        years = ds.variables["years"][:].data.astype(int).tolist()
        quantiles = ds.variables["quantiles"][:].data.tolist()

        if result["grid_points"] is None:
            result["grid_points"] = [[float(lat), float(lon)] for lat, lon in zip(lats, lons)]
            result["years"] = years

        result["scenarios"].append(scenario)
        result["values"][scenario] = {}

        # sea_level_change shape: (locations, years, quantiles) — units typically mm
        slc = ds.variables["sea_level_change"][:].data

        for target_q, pct_key in zip(TARGET_QUANTILES, ["5", "50", "95"]):
            # Find nearest quantile index
            q_idx = min(range(len(quantiles)), key=lambda i: abs(quantiles[i] - target_q))

            # Extract values and convert mm -> meters
            vals = slc[:, :, q_idx]
            # Handle potential fill values
            vals = vals.astype(float)
            vals[vals > 1e10] = 0.0
            vals[vals < -1e10] = 0.0
            vals_m = vals / 1000.0  # mm to meters

            result["values"][scenario][pct_key] = [
                [round(float(v), 4) for v in row] for row in vals_m
            ]

            # Global mean (average across all grid points)
            global_mean = vals_m.mean(axis=0)
            if "global_mean" not in result:
                result["global_mean"] = {}
            if scenario not in result["global_mean"]:
                result["global_mean"][scenario] = {}
            result["global_mean"][scenario][pct_key] = [round(float(v), 4) for v in global_mean]

        ds.close()

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(result, f, separators=(",", ":"))

    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    n_pts = len(result["grid_points"]) if result["grid_points"] else 0
    print(f"✓ Wrote {out_path} ({size_mb:.1f} MB, {n_pts} grid points, "
          f"{len(result['scenarios'])} scenarios)")


def main():
    parser = argparse.ArgumentParser(description="Download IPCC AR6 SLR projections")
    parser.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "data", "ipcc_ar6_slr.json"))
    parser.add_argument("--cache-dir", default=None, help="Directory to cache raw NetCDF files")
    args = parser.parse_args()

    cache_dir = args.cache_dir or tempfile.mkdtemp(prefix="ar6_")
    os.makedirs(cache_dir, exist_ok=True)

    print("=== IPCC AR6 Sea Level Projection Downloader ===")
    print(f"Cache dir: {cache_dir}")
    print(f"Output: {args.out}")

    nc_files = download_ar6_data(cache_dir)
    if not nc_files:
        print("✗ No data downloaded. Check network and try again.")
        sys.exit(1)

    convert_to_json(nc_files, args.out)
    print("Done!")


if __name__ == "__main__":
    main()
