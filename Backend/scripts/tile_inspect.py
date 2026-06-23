#!/usr/bin/env python3
"""
tile_inspect.py — text-based tile diagnostics (no screenshot needed).

Fetches a tile PNG from the local backend, analyzes pixel content, checks DEM
coverage, and prints a structured report including an ASCII preview.  Useful
for describing tile issues to Claude without sharing screenshots.

Usage:
    python tile_inspect.py <z> <x> <y> [options]
    python tile_inspect.py --lat LAT --lon LON --zoom ZOOM [options]

Options:
    --host HOST         Backend host:port           [default: localhost:8080]
    --slr METERS        Fixed SLR in metres         [default: 1.0]
    --scenario SCEN     IPCC scenario (ssp126|ssp245|ssp370|ssp585)
    --year YEAR         Year (2030–2150, multiples of 10)
    --pct PCT           Percentile (5|50|95)        [default: 50]
    --connectivity MODE boundary|none|full          [default: boundary]
    --water-mask MODE   none|raster                 [default: none]
    --size N            ASCII preview grid size     [default: 32]
    --no-ascii          Skip ASCII preview
    --no-dem            Skip DEM coverage query

Flood pixel colour in this app: RGBA = [0, 0, 255, 160]
All other non-transparent pixels are anomalous (indicates a render bug).
"""

import argparse
import io
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("z", nargs="?", type=int)
    p.add_argument("x", nargs="?", type=int)
    p.add_argument("y", nargs="?", type=int)
    p.add_argument("--lat", type=float)
    p.add_argument("--lon", type=float)
    p.add_argument("--zoom", type=int)
    p.add_argument("--host", default="localhost:8080")
    p.add_argument("--slr", type=float, default=1.0)
    p.add_argument("--scenario")
    p.add_argument("--year", type=int)
    p.add_argument("--pct", type=int, default=50)
    p.add_argument("--connectivity", default="boundary", choices=["boundary", "none", "full"])
    p.add_argument("--water-mask", default="none", dest="water_mask", choices=["none", "raster"])
    p.add_argument("--size", type=int, default=32)
    p.add_argument("--no-ascii", action="store_true")
    p.add_argument("--no-dem", action="store_true")
    return p.parse_args()


def tile_from_latlon(lat, lon, zoom):
    try:
        import mercantile
        t = mercantile.tile(lon, lat, zoom)
        return t.z, t.x, t.y
    except ImportError:
        # Fallback: Web Mercator tile math
        import math
        n = 2 ** zoom
        xt = int((lon + 180.0) / 360.0 * n)
        lat_r = math.radians(lat)
        yt = int((1.0 - math.log(math.tan(lat_r) + 1.0 / math.cos(lat_r)) / math.pi) / 2.0 * n)
        return zoom, xt, yt


def tile_bounds(z, x, y):
    try:
        import mercantile
        b = mercantile.bounds(x, y, z)
        return b.west, b.south, b.east, b.north
    except ImportError:
        import math
        n = 2 ** z
        west = x / n * 360.0 - 180.0
        east = (x + 1) / n * 360.0 - 180.0
        north = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
        south = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
        return west, south, east, north


def build_tile_url(host, z, x, y, args):
    params = {"connectivity": args.connectivity, "water_mask": args.water_mask}
    if args.scenario and args.year:
        params.update({"scenario": args.scenario, "year": args.year, "pct": args.pct})
    else:
        params["slr"] = args.slr
    qs = urllib.parse.urlencode(params)
    return f"http://{host}/api/tiles/{z}/{x}/{y}?{qs}"


def fetch_url(url, timeout=15):
    start = time.time()
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
            elapsed = time.time() - start
            headers = {k.lower(): v for k, v in resp.headers.items()}
            status = resp.status
        return data, headers, elapsed, status, None
    except urllib.error.HTTPError as e:
        return None, {}, time.time() - start, e.code, str(e)
    except Exception as e:
        return None, {}, time.time() - start, 0, str(e)


def analyze_pixels(data, ascii_size):
    try:
        from PIL import Image
        import numpy as np
    except ImportError:
        return None

    img = Image.open(io.BytesIO(data)).convert("RGBA")
    arr = np.array(img)
    w, h = img.size
    total = w * h

    alpha = arr[:, :, 3]
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]

    transparent = int(np.sum(alpha < 10))
    # Flood: RGBA exactly [0, 0, 255, 160] — allow small tolerance
    flood = int(np.sum((b > 200) & (r < 50) & (g < 50) & (alpha > 100)))
    anomalous = total - transparent - flood  # non-flood, non-transparent pixels (render bug indicator)

    # ASCII preview: downsample to ascii_size × ascii_size
    small = img.resize((ascii_size, ascii_size), Image.NEAREST)
    sarr = np.array(small)
    rows = []
    for row in sarr:
        line = ""
        for px in row:
            a_val, b_val, r_val = int(px[3]), int(px[2]), int(px[0])
            if a_val < 10:
                line += "."
            elif b_val > 200 and r_val < 50:
                line += "#"
            else:
                line += "?"  # anomalous pixel
        rows.append(line)

    return {
        "size": (w, h),
        "total": total,
        "transparent": transparent,
        "flood": flood,
        "anomalous": anomalous,
        "ascii": rows,
    }


def get_dem_coverage(host, bounds, timeout=10):
    west, south, east, north = bounds
    url = (f"http://{host}/api/debug/tiles_in_bbox"
           f"?lon_min={west:.6f}&lat_min={south:.6f}&lon_max={east:.6f}&lat_max={north:.6f}")
    data, _, _, status, err = fetch_url(url, timeout=timeout)
    if err or not data:
        return None, err
    try:
        return json.loads(data), None
    except Exception as e:
        return None, str(e)


def fmt_pct(n, total):
    return f"{n / total * 100:.1f}%" if total else "n/a"


def main():
    args = parse_args()

    # Resolve tile coordinates
    if args.z is not None and args.x is not None and args.y is not None:
        z, x, y = args.z, args.x, args.y
    elif args.lat is not None and args.lon is not None and args.zoom is not None:
        z, x, y = tile_from_latlon(args.lat, args.lon, args.zoom)
        print(f"Resolved lat={args.lat}, lon={args.lon}, zoom={args.zoom}  →  tile {z}/{x}/{y}")
    else:
        print("ERROR: provide z x y or --lat --lon --zoom", file=sys.stderr)
        sys.exit(1)

    bounds = tile_bounds(z, x, y)
    west, south, east, north = bounds
    url = build_tile_url(args.host, z, x, y, args)

    print(f"\n{'='*60}")
    print(f"  Tile {z}/{x}/{y}")
    print(f"{'='*60}")
    print(f"  Bounds : {abs(west):.4f}°{'W' if west < 0 else 'E'} – {abs(east):.4f}°{'W' if east < 0 else 'E'}")
    print(f"           {abs(south):.4f}°{'S' if south < 0 else 'N'} – {abs(north):.4f}°{'S' if north < 0 else 'N'}")
    print(f"  URL    : {url}")

    # Fetch tile
    data, headers, elapsed, status, err = fetch_url(url)
    cache_hit = headers.get("x-cache-hit", headers.get("x-cache", "?"))
    render_ms = headers.get("x-render-ms", f"{elapsed*1000:.0f}ms (total RTT)")
    content_len = headers.get("content-length", len(data) if data else "?")

    print(f"\n  HTTP   : {status}{' — ' + err if err else ''}")
    print(f"  Cache  : {cache_hit}")
    print(f"  Timing : {render_ms}")
    print(f"  Size   : {content_len} bytes", end="")
    if data and len(data) < 200:
        print("  ← suspiciously small (likely transparent/empty tile)", end="")
    print()

    if not data:
        print("\nCould not retrieve tile. Stopping.")
        sys.exit(1)

    # Pixel analysis
    stats = analyze_pixels(data, args.size)
    if stats:
        total = stats["total"]
        flood = stats["flood"]
        transparent = stats["transparent"]
        anomalous = stats["anomalous"]
        w, h = stats["size"]
        print(f"\n  Pixel stats ({w}×{h} = {total} px):")
        print(f"    Transparent (void) : {transparent:6d}  ({fmt_pct(transparent, total)})")
        print(f"    Flood (blue #0000ff): {flood:6d}  ({fmt_pct(flood, total)})")
        if anomalous:
            print(f"    Anomalous (bug?)   : {anomalous:6d}  ({fmt_pct(anomalous, total)})  ← unexpected non-flood pixels")
        if flood == 0:
            print("    ⚠ Zero flood pixels. Try --connectivity=none to rule out culling.")
        elif fmt_pct(flood, total) == "100.0%":
            print("    ⚠ Tile is 100% flood — possible SLR value too high or DEM issue.")
    else:
        print("\n  (PIL/numpy not available — skipping pixel analysis)")

    # DEM coverage
    if not args.no_dem:
        print(f"\n  DEM coverage ({west:.4f},{south:.4f} → {east:.4f},{north:.4f}):")
        dem_data, dem_err = get_dem_coverage(args.host, bounds)
        if dem_err:
            print(f"    Error querying /debug/tiles_in_bbox: {dem_err}")
        elif dem_data:
            tiles = dem_data if isinstance(dem_data, list) else dem_data.get("tiles", [])
            if tiles:
                for t in tiles:
                    fname = t if isinstance(t, str) else t.get("file", str(t))
                    print(f"    ✓ {fname}")
            else:
                print("    ✗ No DEM files cover this tile's bounding box")
        else:
            print("    (empty response)")

    # ASCII preview
    if not args.no_ascii and stats:
        print(f"\n  ASCII preview ({args.size}×{args.size}):  . = void  # = flood  ? = anomalous")
        print()
        for line in stats["ascii"]:
            print(f"    {line}")

    print(f"\n{'='*60}\n")

    # Connectivity hint
    if stats and stats["flood"] == 0 and args.connectivity != "none":
        print(f"Hint: re-run with --connectivity=none to see if connectivity culling is hiding flood pixels.")


if __name__ == "__main__":
    main()
