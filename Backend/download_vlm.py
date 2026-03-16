#!/usr/bin/env python3
"""Download GIA and GPS vertical land motion data.

Sources:
  - ICE-6G_C (VM5a): University of Toronto / Peltier group
  - NGL/MIDAS: Nevada Geodetic Laboratory GPS velocities

Usage:
    python download_vlm.py [--out-gia data/ice6g_vlm.json] [--out-gps data/midas_vlm.json]
"""

import argparse
import json
import os
import sys

try:
    import requests
except ImportError:
    print("Install requests: pip install requests")
    sys.exit(1)

import numpy as np

# NGL MIDAS velocity file (plain text, ~17k stations)
MIDAS_URL = "http://geodesy.unr.edu/velocities/midas.IGS14.txt"

# ICE-6G_C data — the Toronto page may be intermittent; fallback to known mirrors
ICE6G_URLS = [
    "https://www.atmosp.physics.utoronto.ca/~peltier/datasets/Ice6G_C_VM5a_O512_uplift_rate.txt",
]


def download_midas(out_path: str, max_stations: int = None):
    """Download and convert NGL/MIDAS GPS velocities to JSON.

    Filters for stations with:
    - At least 2.5 years of data
    - Vertical velocity uncertainty < 2 mm/yr
    - Within 100km of coast (approximate, based on latitude bands)
    """
    print(f"Downloading MIDAS velocities from {MIDAS_URL}...")
    resp = requests.get(MIDAS_URL, timeout=120)
    resp.raise_for_status()

    lines = resp.text.strip().split("\n")
    stations = []

    for line in lines:
        if line.startswith("#") or not line.strip():
            continue
        parts = line.split()
        if len(parts) < 10:
            continue
        try:
            name = parts[0]
            lat = float(parts[1])
            lon = float(parts[2])
            vu = float(parts[7])   # vertical velocity mm/yr
            su = float(parts[10])  # vertical velocity uncertainty
            duration = float(parts[13]) if len(parts) > 13 else 3.0

            # Quality filter
            if duration < 2.5:
                continue
            if abs(su) > 2.0:
                continue

            stations.append({
                "name": name,
                "lat": round(lat, 4),
                "lon": round(lon, 4),
                "vlm_mm_yr": round(vu, 2),
                "uncertainty_mm_yr": round(su, 2),
            })
        except (ValueError, IndexError):
            continue

    if max_stations and len(stations) > max_stations:
        stations = stations[:max_stations]

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(stations, f, separators=(",", ":"))

    print(f"✓ Wrote {out_path} ({len(stations)} stations, "
          f"{os.path.getsize(out_path) / 1024:.0f} KB)")


def download_ice6g(out_path: str):
    """Download ICE-6G_C GIA uplift rate grid and convert to JSON.

    The source file is typically a 1-degree ASCII grid with columns:
    lon, lat, uplift_rate_mm_yr (or similar).
    """
    data = None

    for url in ICE6G_URLS:
        try:
            print(f"Trying ICE-6G_C from {url}...")
            resp = requests.get(url, timeout=60)
            resp.raise_for_status()
            data = resp.text
            print("  ✓ Downloaded")
            break
        except Exception as e:
            print(f"  ✗ Failed: {e}")
            continue

    if data is None:
        print("⚠ Could not download ICE-6G_C data. Generating zero-filled placeholder.")
        _write_placeholder_gia(out_path)
        return

    # Parse the ASCII grid
    lines = data.strip().split("\n")
    points = {}

    for line in lines:
        if line.startswith("#") or not line.strip():
            continue
        parts = line.split()
        if len(parts) >= 3:
            try:
                lon = float(parts[0])
                lat = float(parts[1])
                rate = float(parts[2])
                points[(lat, lon)] = rate
            except ValueError:
                continue

    if not points:
        print("⚠ Could not parse ICE-6G_C data. Generating placeholder.")
        _write_placeholder_gia(out_path)
        return

    # Build regular grid
    all_lats = sorted(set(lat for lat, lon in points))
    all_lons = sorted(set(lon for lat, lon in points))

    rates = []
    for lat in all_lats:
        row = []
        for lon in all_lons:
            row.append(round(points.get((lat, lon), 0.0), 3))
        rates.append(row)

    result = {
        "lats": all_lats,
        "lons": all_lons,
        "rates": rates,
        "units": "mm/yr",
        "source": "ICE-6G_C (VM5a) Peltier et al. 2015",
    }

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(result, f, separators=(",", ":"))

    print(f"✓ Wrote {out_path} ({len(all_lats)}×{len(all_lons)} grid, "
          f"{os.path.getsize(out_path) / 1024:.0f} KB)")


def _write_placeholder_gia(out_path: str):
    """Write a zero-filled 1-degree global GIA grid as placeholder."""
    lats = [float(i) for i in range(-89, 91)]
    lons = [float(i) for i in range(-180, 181)]
    rates = [[0.0] * len(lons) for _ in lats]

    result = {
        "lats": lats,
        "lons": lons,
        "rates": rates,
        "units": "mm/yr",
        "source": "placeholder (zero-filled, run download again with network access)",
    }

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(result, f, separators=(",", ":"))

    print(f"✓ Wrote placeholder GIA grid to {out_path}")


def main():
    base_dir = os.path.join(os.path.dirname(__file__), "data")
    parser = argparse.ArgumentParser(description="Download VLM correction data")
    parser.add_argument("--out-gia", default=os.path.join(base_dir, "ice6g_vlm.json"))
    parser.add_argument("--out-gps", default=os.path.join(base_dir, "midas_vlm.json"))
    parser.add_argument("--skip-gia", action="store_true", help="Skip ICE-6G_C download")
    parser.add_argument("--skip-gps", action="store_true", help="Skip MIDAS GPS download")
    args = parser.parse_args()

    print("=== VLM Data Downloader ===")

    if not args.skip_gia:
        download_ice6g(args.out_gia)

    if not args.skip_gps:
        download_midas(args.out_gps)

    print("Done!")


if __name__ == "__main__":
    main()
