
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse, FileResponse, Response
import rasterio
from rasterio.merge import merge
from rasterio.windows import from_bounds, Window
from rasterio.transform import xy, rowcol
import numpy as np
import os
import mercantile
from PIL import Image
import math
import io
from functools import lru_cache
from collections import defaultdict
from rasterio.warp import reproject, Resampling
from affine import Affine
import re
import threading
import time as _time
from typing import Dict, List, Tuple, Optional
import logging

logger = logging.getLogger(__name__)

import projection
import vlm


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Build tile index, load population data, projections, and VLM on startup."""
    build_tile_index()
    load_population_data()

    # IPCC AR6 projections (optional — falls back to embedded global mean)
    proj_path = os.path.join(BASE_DIR, "data", "ipcc_ar6_slr.json")
    projection.load_projections(proj_path)

    # Vertical land motion corrections (optional — falls back to 0)
    gia_path = os.path.join(BASE_DIR, "data", "ice6g_vlm.json")
    gps_path = os.path.join(BASE_DIR, "data", "midas_vlm.json")
    vlm.load_vlm(gia_path=gia_path, gps_path=gps_path)

    yield


app = FastAPI(lifespan=lifespan)


def _csv_env_list(name: str, default: str) -> List[str]:
    raw = os.environ.get(name, default)
    return [v.strip() for v in raw.split(",") if v.strip()]


trusted_hosts = _csv_env_list("TRUSTED_HOSTS", "localhost,127.0.0.1")
cors_origins = _csv_env_list("CORS_ALLOW_ORIGINS", "http://localhost,http://127.0.0.1")

app.add_middleware(TrustedHostMiddleware, allowed_hosts=trusted_hosts)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["content-type", "accept"],
)

BASE_DIR = os.path.dirname(__file__)
DATA_DIR = os.path.join(BASE_DIR, "dem")
TILE_CACHE = os.path.join(BASE_DIR, "tile_cache")
POPULATION_DATA_DIR = os.path.join(BASE_DIR, "wp_2020")
os.makedirs(TILE_CACHE, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(POPULATION_DATA_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Active-user session tracking
# Written to a shared file so all uvicorn workers contribute.
# One append per IP per _WRITE_INTERVAL seconds → minimal I/O.
# ---------------------------------------------------------------------------
_SESSION_FILE = os.path.join(TILE_CACHE, ".sessions")
_ACTIVE_WINDOW = 300          # 5-minute active window (seconds)
_WRITE_INTERVAL = 60          # write to file at most once/minute per IP
_local_seen: Dict[str, float] = {}   # IP → last file-write timestamp (per-worker)
_local_lock = threading.Lock()

# Paths that should not count as active-user activity
_SKIP_SESSION_PATHS = {"/health", "/stats", "/cities"}


def _record_session(ip: str, path: str) -> None:
    """Append an active session marker to the shared sessions file."""
    if not ip or any(path.startswith(p) for p in _SKIP_SESSION_PATHS):
        return
    now = _time.time()
    with _local_lock:
        if now - _local_seen.get(ip, 0) < _WRITE_INTERVAL:
            return
        _local_seen[ip] = now
    try:
        with open(_SESSION_FILE, "a") as f:
            f.write(f"{ip} {now:.0f}\n")
    except Exception:
        pass


def _read_active_sessions() -> int:
    """Count unique IPs seen within the last _ACTIVE_WINDOW seconds."""
    cutoff = _time.time() - _ACTIVE_WINDOW
    active: set = set()
    total = 0
    try:
        with open(_SESSION_FILE, "r") as f:
            for line in f:
                parts = line.split()
                if len(parts) == 2:
                    total += 1
                    try:
                        if float(parts[1]) >= cutoff:
                            active.add(parts[0])
                    except ValueError:
                        pass
    except FileNotFoundError:
        pass
    if total > 20000:
        _compact_sessions()
    return len(active)


def _compact_sessions() -> None:
    """Truncate expired entries from the sessions file."""
    cutoff = _time.time() - _ACTIVE_WINDOW
    try:
        with open(_SESSION_FILE, "r") as f:
            lines = f.readlines()
        fresh = [
            l for l in lines
            if len(l.split()) == 2 and _safe_float(l.split()[1]) >= cutoff
        ]
        with open(_SESSION_FILE, "w") as f:
            f.writelines(fresh)
    except Exception:
        pass


def _safe_float(s: str) -> float:
    try:
        return float(s)
    except ValueError:
        return 0.0

# In-memory caches
ANALYSIS_CACHE_SIZE = 256
try:
    TILE_CACHE_SIZE = int(os.environ.get("TILE_CACHE_SIZE", 512))  # configurable via env var
except (ValueError, TypeError):
    TILE_CACHE_SIZE = 512
TILE_CACHE_SIZE = max(1, TILE_CACHE_SIZE)

# Web Mercator tile zoom bounds
MAX_ZOOM_LEVEL = 22

# Spatial tile index: {tile_name: {"bounds": (lon_min, lat_min, lon_max, lat_max), "path": ...}}
TILE_INDEX: Dict[str, Dict] = {}

# Grid-based spatial index for O(1) tile lookup (keyed by integer degree cell)
TILE_GRID: Dict[Tuple[int, int], List[str]] = defaultdict(list)

# WorldPop population raster datasets (support multiple GeoTIFFs for cross-border sampling)
POPULATION_DATASET = None  # legacy single-file support
POPULATION_RASTERS: List[Dict] = []  # each: {"ds": rasterio.DatasetReader, "bounds": (l,b,r,t), "crs": crs}


def parse_dem_filename(filename: str) -> Dict:
    """Parse DEM filename like 'DiluviumDEM_N34_00_E118_00.tif' to extract bounds.
    
    Returns dict with:
        - lat_min, lat_max: latitude range in decimal degrees
        - lon_min, lon_max: longitude range in decimal degrees
        - bounds: (lon_min, lat_min, lon_max, lat_max) tuple for rasterio
    
    Returns None if filename doesn't match expected pattern.
    """
    # Pattern: DiluviumDEM_{N|S}DD_MM_{E|W}DDD_MM
    pattern = r'DiluviumDEM_([NS])(\d{2})_(\d{2})_([EW])(\d{3})_(\d{2})'
    match = re.search(pattern, filename)
    
    if not match:
        return {}
    
    lat_hem, lat_deg, lat_min, lon_hem, lon_deg, lon_min = match.groups()
    
    # Convert to decimal degrees
    lat = float(lat_deg) + float(lat_min) / 60.0
    if lat_hem == 'S':
        lat = -lat
    
    lon = float(lon_deg) + float(lon_min) / 60.0
    if lon_hem == 'W':
        lon = -lon
    
    # Each tile is 1 degree x 1 degree
    lat_min_val = lat
    lat_max_val = lat + 1.0
    lon_min_val = lon
    lon_max_val = lon + 1.0
    
    return {
        "lat_min": lat_min_val,
        "lat_max": lat_max_val,
        "lon_min": lon_min_val,
        "lon_max": lon_max_val,
        "bounds": (lon_min_val, lat_min_val, lon_max_val, lat_max_val)
    }


def build_tile_index():
    """Build spatial index of all DEM tiles in DATA_DIR with grid-based lookup."""
    global TILE_INDEX, TILE_GRID
    TILE_INDEX = {}
    TILE_GRID = defaultdict(list)

    for filename in os.listdir(DATA_DIR):
        if not (filename.endswith('.tif') or filename.endswith('.tiff')):
            continue

        tile_info = parse_dem_filename(filename)
        if tile_info:
            tile_name = os.path.splitext(filename)[0]
            TILE_INDEX[tile_name] = {
                "bounds": tile_info["bounds"],
                "lat_min": tile_info["lat_min"],
                "lat_max": tile_info["lat_max"],
                "lon_min": tile_info["lon_min"],
                "lon_max": tile_info["lon_max"],
                "path": os.path.join(DATA_DIR, filename)
            }
            # Insert into all grid cells this tile overlaps (1° x 1° cells)
            for lat_cell in range(math.floor(tile_info["lat_min"]), math.ceil(tile_info["lat_max"])):
                for lon_cell in range(math.floor(tile_info["lon_min"]), math.ceil(tile_info["lon_max"])):
                    TILE_GRID[(lat_cell, lon_cell)].append(tile_name)

    print(f"Built spatial index with {len(TILE_INDEX)} tiles, {len(TILE_GRID)} grid cells")
    return TILE_INDEX


def load_population_data():
    """Load WorldPop population rasters. Supports single global file or multiple country tiles."""
    global POPULATION_DATASET, POPULATION_RASTERS

    POPULATION_RASTERS = []

    # Prefer multiple tiles in directory
    tif_files = [f for f in os.listdir(POPULATION_DATA_DIR) if f.lower().endswith(('.tif', '.tiff'))]
    if not tif_files:
        print(f"ℹ No population GeoTIFFs found in {POPULATION_DATA_DIR}")
        print("  Run: python download_worldpop.py or place .tif files here")
        POPULATION_DATASET = None
        return False

    loaded = 0
    for fname in tif_files:
        fpath = os.path.join(POPULATION_DATA_DIR, fname)
        try:
            ds = rasterio.open(fpath)
            b = (ds.bounds.left, ds.bounds.bottom, ds.bounds.right, ds.bounds.top)
            POPULATION_RASTERS.append({"ds": ds, "bounds": b, "crs": ds.crs, "transform": ds.transform, "name": fname})
            loaded += 1
        except Exception as e:
            print(f"✗ Failed to open population raster {fname}: {e}")

    # Backward compatibility: if a file named worldpop_2020_1km.tif exists, set POPULATION_DATASET
    single_path = os.path.join(POPULATION_DATA_DIR, "worldpop_2020_1km.tif")
    if os.path.exists(single_path):
        try:
            POPULATION_DATASET = rasterio.open(single_path)
            print(f"✓ Legacy WorldPop loaded: {single_path}")
        except Exception as e:
            print(f"⚠ Failed to load legacy WorldPop: {e}")
            POPULATION_DATASET = None

    print(f"✓ Loaded {loaded} population raster(s)")
    for r in POPULATION_RASTERS[:10]:
        print(f"  - {r['name']} bounds={r['bounds']} crs={r['crs']}")
    return loaded > 0


# Simple health endpoint
@app.get("/health")
def health():
    try:
        tiles = len(TILE_INDEX)
        return {"status": "ok", "tiles_indexed": tiles}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/stats")
def get_stats():
    return {
        "active_users_5m": _read_active_sessions(),
        "tiles_indexed": len(TILE_INDEX),
    }

# Request timing middleware for diagnostics
@app.middleware("http")
async def timing_logger(request, call_next):
    import time
    start = time.perf_counter()
    try:
        response = await call_next(request)
        return response
    finally:
        duration_ms = (time.perf_counter() - start) * 1000.0
        try:
            path = request.url.path
            method = request.method
            client_ip = (
                request.headers.get("x-real-ip")
                or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
                or (request.client.host if request.client else "")
            )
            _record_session(client_ip, path)
            print(f"[API] {method} {path} {client_ip} took {duration_ms:.1f} ms")
        except Exception:
            pass


def find_tiles_in_bbox(lon_min: float, lat_min: float, lon_max: float, lat_max: float) -> List[str]:
    """Find all DEM tiles that intersect the given bounding box using grid index.

    O(k) where k = number of matching tiles, instead of O(n) scanning all 6000+ tiles.
    """
    results = []
    seen = set()

    # Check all grid cells the bbox could overlap (with 1-cell margin for safety)
    lat_start = math.floor(lat_min) - 1
    lat_end = math.floor(lat_max) + 1
    lon_start = math.floor(lon_min) - 1
    lon_end = math.floor(lon_max) + 1

    for lat_cell in range(lat_start, lat_end + 1):
        for lon_cell in range(lon_start, lon_end + 1):
            for tile_name in TILE_GRID.get((lat_cell, lon_cell), []):
                if tile_name in seen:
                    continue
                seen.add(tile_name)
                t = TILE_INDEX[tile_name]
                t_lon_min, t_lat_min, t_lon_max, t_lat_max = t["bounds"]
                # Exact intersection check
                if not (lon_max < t_lon_min or lon_min > t_lon_max or
                        lat_max < t_lat_min or lat_min > t_lat_max):
                    results.append(tile_name)

    return results


@app.get("/tiles/info")
def get_tile_info():
    """Get information about available DEM tiles."""
    return {
        "total_tiles": len(TILE_INDEX),
        "coverage": {
            "lat_min": min(t["lat_min"] for t in TILE_INDEX.values()) if TILE_INDEX else None,
            "lat_max": max(t["lat_max"] for t in TILE_INDEX.values()) if TILE_INDEX else None,
            "lon_min": min(t["lon_min"] for t in TILE_INDEX.values()) if TILE_INDEX else None,
            "lon_max": max(t["lon_max"] for t in TILE_INDEX.values()) if TILE_INDEX else None,
        }
    }


@app.get("/debug/tiles_in_bbox")
def debug_tiles_in_bbox(lon_min: float, lat_min: float, lon_max: float, lat_max: float):
    if os.environ.get("DEBUG_MODE") != "true":
        raise HTTPException(status_code=404, detail="Not found")
    tiles = find_tiles_in_bbox(lon_min, lat_min, lon_max, lat_max)
    return {
        "request_bbox": [lon_min, lat_min, lon_max, lat_max],
        "count": len(tiles),
        "tiles": tiles[:50]  # cap for brevity
    }


@app.get("/cities")
def list_cities():
    """Deprecated: city-based model removed. Returns empty list for compatibility."""
    return {"cities": []}


# Cached transparent tile (avoid regenerating for every empty/no-data tile)
_TRANSPARENT_TILE_PNG = None

def _get_transparent_tile(size: int = 256) -> bytes:
    """Return a cached fully-transparent 256x256 PNG."""
    global _TRANSPARENT_TILE_PNG
    if _TRANSPARENT_TILE_PNG is None:
        rgba = np.zeros((size, size, 4), dtype=np.uint8)
        buf = io.BytesIO()
        Image.fromarray(rgba, mode='RGBA').save(buf, format='PNG')
        _TRANSPARENT_TILE_PNG = buf.getvalue()
    return _TRANSPARENT_TILE_PNG



@lru_cache(maxsize=TILE_CACHE_SIZE)
def render_tile_png_multi_cached(tile_paths_tuple: Tuple[str, ...], slr_meters: float, z: int, x: int, y: int, size: int = 256) -> bytes:
    """Cached wrapper for render_tile_png_multi. Uses tuple for hashability."""
    return render_tile_png_multi(list(tile_paths_tuple), slr_meters, z, x, y, size)

def render_tile_png_multi(tile_paths: List[str], slr_meters: float, z: int, x: int, y: int, size: int = 256) -> bytes:
    """Render a flood overlay PNG tile using windowed DEM reads.

    Uses windowed reads to only load the portion of each DEM that intersects
    the requested map tile, dramatically reducing I/O and memory usage.
    """
    if slr_meters <= 0 or not tile_paths:
        return _get_transparent_tile(size)

    # Map tile bounds in lat/lon (for DEM window reads) and Web Mercator (for output grid)
    b = mercantile.bounds(x, y, z)
    wm = mercantile.xy_bounds(x, y, z)

    try:
        if len(tile_paths) == 1:
            # Single DEM tile: windowed read of just the intersecting region
            with rasterio.open(tile_paths[0]) as src:
                left = max(b.west, src.bounds.left)
                right = min(b.east, src.bounds.right)
                bottom = max(b.south, src.bounds.bottom)
                top = min(b.north, src.bounds.top)

                if left >= right or bottom >= top:
                    return _get_transparent_tile(size)

                window = from_bounds(left, bottom, right, top, transform=src.transform)
                mosaic_arr = src.read(1, window=window)
                mosaic_transform = src.window_transform(window)
                nodata = src.nodata
                src_crs = src.crs
        else:
            # Multiple DEM tiles: merge with a small buffer beyond tile bounds so that
            # pixels right at the 1°×1° DEM tile seam are captured from both neighbours,
            # preventing a 1-pixel-wide nodata strip at the boundary.
            datasets = []
            try:
                for path in tile_paths:
                    try:
                        datasets.append(rasterio.open(path))
                    except Exception:
                        continue
                if not datasets:
                    return _get_transparent_tile(size)

                # Buffer of ~0.01° (~1 km) ensures boundary pixels from adjacent tiles
                # are included in the mosaic before reprojection clips back to tile extent.
                _buf = 0.01
                merge_bounds = (b.west - _buf, b.south - _buf, b.east + _buf, b.north + _buf)
                mosaic_arr, mosaic_transform = merge(datasets, bounds=merge_bounds)
                mosaic_arr = mosaic_arr[0]  # merge returns (bands, h, w)
                nodata = datasets[0].nodata
                src_crs = datasets[0].crs
            finally:
                for ds in datasets:
                    try:
                        ds.close()
                    except Exception:
                        pass

        # Reproject windowed source to EPSG:3857 output grid.
        # dst_arr initialised to NaN so any destination pixel not written by
        # the warp (outside source coverage) is correctly treated as no-data.
        dst_transform = Affine(
            (wm.right - wm.left) / size, 0.0, wm.left,
            0.0, -(wm.top - wm.bottom) / size, wm.top
        )
        dst_arr = np.full((size, size), np.nan, dtype=np.float32)

        reproject(
            source=mosaic_arr,
            destination=dst_arr,
            src_transform=mosaic_transform,
            src_crs=src_crs,
            src_nodata=nodata if nodata is not None else None,
            dst_transform=dst_transform,
            dst_crs='EPSG:3857',
            dst_nodata=np.nan,
            resampling=Resampling.bilinear  # bilinear gives smooth elevation at seams
        )

        del mosaic_arr

        # Compute flood mask
        finite = np.isfinite(dst_arr)
        flooded = finite & (dst_arr < float(slr_meters))

        del dst_arr

        if not np.any(flooded):
            return _get_transparent_tile(size)

        rgba = np.zeros((size, size, 4), dtype=np.uint8)
        rgba[flooded] = [0, 0, 255, 160]

        buf = io.BytesIO()
        Image.fromarray(rgba, mode='RGBA').save(buf, format='PNG')
        return buf.getvalue()

    except Exception as e:
        logger.error("Tile render error z=%s x=%s y=%s: %s", z, x, y, e, exc_info=True)
        return _get_transparent_tile(size)


@app.get("/tiles/{z}/{x}/{y}")
def get_tile(z: int, x: int, y: int,
             slr: Optional[float] = None,
             scenario: Optional[str] = None,
             year: Optional[int] = None,
             pct: int = 50):
    """Return a PNG flood overlay tile for z/x/y.

    Two modes:
      - Legacy: ?slr=1.0 (direct SLR value)
      - Scenario: ?scenario=ssp245&year=2100&pct=50 (resolved per-tile from IPCC + VLM)
    """
    # Validate tile coordinates
    if z < 0 or z > MAX_ZOOM_LEVEL:
        raise HTTPException(status_code=400, detail=f"Invalid zoom level {z}; must be 0-{MAX_ZOOM_LEVEL}")
    max_xy = (1 << z) - 1
    if x < 0 or x > max_xy or y < 0 or y > max_xy:
        raise HTTPException(status_code=400, detail=f"Tile x/y out of range for zoom {z}")

    b = mercantile.bounds(x, y, z)

    # Resolve effective SLR
    if slr is not None:
        slr_meters = slr
    elif scenario and year:
        center_lat = (b.south + b.north) / 2
        center_lon = (b.west + b.east) / 2
        base_slr = projection.resolve_slr(center_lat, center_lon, scenario, year, pct)
        vlm_offset = vlm.resolve_vlm_offset(center_lat, center_lon, year)
        slr_meters = (base_slr or 0.0) + vlm_offset
    else:
        slr_meters = 1.0  # default fallback

    tile_names = find_tiles_in_bbox(b.west, b.south, b.east, b.north)
    tile_paths = [TILE_INDEX[name]["path"] for name in tile_names if name in TILE_INDEX]

    try:
        png_bytes = render_tile_png_multi_cached(tuple(tile_paths), round(slr_meters, 3), z, x, y)
        return Response(
            content=png_bytes,
            media_type="image/png",
            headers={
                 "Cache-Control": "public, max-age=3600",
                "X-Tiles-Used": str(len(tile_paths)),
                "X-Effective-SLR": f"{slr_meters:.3f}",
            }
        )
    except Exception as e:
        logger.error("Tile endpoint error z=%s x=%s y=%s: %s", z, x, y, e, exc_info=True)
        raise HTTPException(status_code=500, detail="Tile rendering failed")


@app.get("/analyze_region")
def analyze_region(
    lon_min: float = Query(..., ge=-180.0, le=180.0),
    lon_max: float = Query(..., ge=-180.0, le=180.0),
    lat_min: float = Query(..., ge=-90.0, le=90.0),
    lat_max: float = Query(..., ge=-90.0, le=90.0),
    slr: Optional[float] = Query(None, ge=-5.0, le=100.0),
    scenario: Optional[str] = None,
    year: Optional[int] = Query(None, ge=2020, le=2200),
    pct: int = Query(50, ge=1, le=99),
    sample_limit: int = Query(100, ge=1, le=10000),
):
    """Analyze a geographic region for flood risk with SLR.

    Two modes:
      - Legacy: ?slr=1.0
      - Scenario: ?scenario=ssp245&year=2100&pct=50 (resolved from IPCC + VLM)
    """
    # Resolve effective SLR for the region center
    center_lat = (lat_min + lat_max) / 2
    center_lon = (lon_min + lon_max) / 2

    if slr is not None:
        effective_slr = slr
    elif scenario and year:
        base_slr = projection.resolve_slr(center_lat, center_lon, scenario, year, pct)
        vlm_offset = vlm.resolve_vlm_offset(center_lat, center_lon, year)
        effective_slr = (base_slr or 0.0) + vlm_offset
    else:
        effective_slr = 1.0

    tile_names = find_tiles_in_bbox(lon_min, lat_min, lon_max, lat_max)

    if not tile_names:
        raise HTTPException(status_code=404, detail="No DEM data available for this region")

    tile_paths = [TILE_INDEX[name]["path"] for name in tile_names]

    try:
        if effective_slr <= 0:
            return {
                "bbox": {
                    "lon_min": lon_min,
                    "lat_min": lat_min,
                    "lon_max": lon_max,
                    "lat_max": lat_max
                },
                "slr": float(effective_slr),
                "tiles_used": tile_names,
                "crs": "EPSG:4326",
                "elevation_min": None,
                "elevation_max": None,
                "elevation_mean": None,
                "flooded_count": 0,
                "total_valid": 0,
                "flood_ratio": 0.0,
                "flooded_pixels": [],
                "estimated_population_affected": 0,
            }
        # Iterate tiles and read only intersecting windows
        elev_min = None
        elev_max = None
        elev_sum = 0.0
        valid_count = 0
        flooded_count = 0
        flooded_pixels = []
        population_affected = 0.0
        has_pop_data = bool(POPULATION_RASTERS) or POPULATION_DATASET is not None

        # Pre-filter population rasters to those intersecting the request bbox
        bbox_pop_rasters = []
        if has_pop_data:
            for r in POPULATION_RASTERS:
                pl, pb, pr, pt = r["bounds"]
                if not (lon_max < pl or lon_min > pr or lat_max < pb or lat_min > pt):
                    bbox_pop_rasters.append(r)

        for path in tile_paths:
            try:
                with rasterio.open(path) as src:
                    # Intersect with requested bbox (EPSG:4326)
                    ds_left, ds_bottom, ds_right, ds_top = src.bounds.left, src.bounds.bottom, src.bounds.right, src.bounds.top
                    left = max(lon_min, ds_left)
                    right = min(lon_max, ds_right)
                    bottom = max(lat_min, ds_bottom)
                    top = min(lat_max, ds_top)
                    if left >= right or bottom >= top:
                        continue
                    window = from_bounds(left, bottom, right, top, transform=src.transform)
                    arr = src.read(1, window=window)
                    nodata = src.nodata

                    finite = np.isfinite(arr)
                    if nodata is not None:
                        finite &= arr != nodata
                    if not np.any(finite):
                        continue

                    # Stats aggregation
                    vals = arr[finite]
                    cur_min = float(np.nanmin(vals))
                    cur_max = float(np.nanmax(vals))
                    cur_sum = float(np.nansum(vals))
                    cur_count = int(vals.size)
                    elev_min = cur_min if elev_min is None else min(elev_min, cur_min)
                    elev_max = cur_max if elev_max is None else max(elev_max, cur_max)
                    elev_sum += cur_sum
                    valid_count += cur_count

                    # Flood mask
                    flooded = np.logical_and(finite, arr < float(effective_slr))
                    flooded_count += int(np.sum(flooded))

                    # Population: iterate at WorldPop resolution (~1km)
                    # For each populated WorldPop pixel in this DEM window,
                    # check if the DEM says it's flooded at that location.
                    if np.any(flooded) and bbox_pop_rasters:
                        win_transform = src.window_transform(window)
                        for r in bbox_pop_rasters:
                            pl, pb, pr, pt = r["bounds"]
                            il = max(left, pl)
                            ir = min(right, pr)
                            ib = max(bottom, pb)
                            it = min(top, pt)
                            if il >= ir or ib >= it:
                                continue
                            try:
                                pop_win = from_bounds(il, ib, ir, it, transform=r["transform"])
                                pop_arr = r["ds"].read(1, window=pop_win)
                            except Exception:
                                continue
                            populated = np.isfinite(pop_arr) & (pop_arr > 0)
                            prows, pcols = np.where(populated)
                            if len(prows) == 0:
                                continue
                            # Global row/col for coordinate lookup
                            g_rows = prows + int(round(pop_win.row_off))
                            g_cols = pcols + int(round(pop_win.col_off))
                            # Geographic coordinates of pop pixel centers
                            pxs, pys = xy(r["transform"], g_rows.tolist(), g_cols.tolist())
                            # Convert to DEM window row/col
                            d_rows, d_cols = rowcol(win_transform, pxs, pys)
                            d_rows = np.array(d_rows)
                            d_cols = np.array(d_cols)
                            # Filter to valid DEM indices
                            valid_dem = (d_rows >= 0) & (d_rows < arr.shape[0]) & \
                                        (d_cols >= 0) & (d_cols < arr.shape[1])
                            if not np.any(valid_dem):
                                continue
                            # Check flood status at each pop pixel center
                            vr = d_rows[valid_dem].astype(int)
                            vc = d_cols[valid_dem].astype(int)
                            is_flood = flooded[vr, vc]
                            # Sum population of flooded pop pixels
                            pop_vals = pop_arr[prows[valid_dem], pcols[valid_dem]]
                            population_affected += float(pop_vals[is_flood].sum())

                    # Heuristic fallback when no WorldPop data (vectorized)
                    if not has_pop_data and np.any(flooded):
                        flooded_vals = arr[flooded]
                        pixel_area_km2 = 0.0009
                        densities = np.where(flooded_vals < 10.0, 500,
                                    np.where(flooded_vals < 50.0, 200, 50))
                        population_affected += float(np.sum(densities)) * pixel_area_km2

                    # Sample flooded pixels for visualization
                    if len(flooded_pixels) < sample_limit and np.any(flooded):
                        rows, cols = np.where(flooded)
                        remaining = sample_limit - len(flooded_pixels)
                        sample_n = min(remaining, rows.size)
                        if sample_n > 0:
                            idx = np.random.choice(rows.size, sample_n, replace=False)
                            rows_sample = rows[idx]
                            cols_sample = cols[idx]
                            for r, c in zip(rows_sample, cols_sample):
                                x, y = src.transform * (int(c + window.col_off), int(r + window.row_off))
                                flooded_pixels.append({
                                    "x": float(x),
                                    "y": float(y)
                                })
            except Exception:
                continue

        total_valid = valid_count
        elev_mean = (elev_sum / total_valid) if total_valid else None
        ratio = (flooded_count / total_valid) if total_valid else 0.0

        return {
            "bbox": {
                "lon_min": lon_min,
                "lat_min": lat_min,
                "lon_max": lon_max,
                "lat_max": lat_max
            },
            "slr": float(effective_slr),
            "scenario": scenario,
            "year": year,
            "percentile": pct,
            "tiles_used": tile_names,
            "crs": "EPSG:4326",
            "elevation_min": elev_min,
            "elevation_max": elev_max,
            "elevation_mean": elev_mean,
            "flooded_count": flooded_count,
            "total_valid": total_valid,
            "flood_ratio": ratio,
            "flooded_pixels": flooded_pixels,
            "estimated_population_affected": int(population_affected),
        }

    except Exception as e:
        logger.error("Analysis error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Analysis failed")






@lru_cache(maxsize=ANALYSIS_CACHE_SIZE)
def _compute_analysis_cached(dem_path: str, slr: float, sample_limit: int, include_points_int: int):
    """Cached analysis computation (include_points as int for hashability). Returns dict."""
    include_points = bool(include_points_int)
    
    try:
        with rasterio.open(dem_path) as src:
            elev = src.read(1)
            nodata = src.nodata
            transform = src.transform
            crs = src.crs

            # Valid mask
            finite = np.isfinite(elev)
            if nodata is not None:
                finite &= elev != nodata
            valid = finite

            # Elevation stats
            if np.any(valid):
                elev_valid = elev[valid]
                elev_min = float(np.nanmin(elev_valid))
                elev_max = float(np.nanmax(elev_valid))
                elev_mean = float(np.nanmean(elev_valid))
            else:
                elev_min = elev_max = elev_mean = None

            flooded = np.logical_and(valid, elev < float(slr))
            flooded_count = int(np.sum(flooded))
            total_valid = int(np.sum(valid))
            ratio = (flooded_count / total_valid) if total_valid else 0.0

            # Sample flooded pixels if requested
            flooded_pixels = []
            if include_points and flooded_count > 0:
                rows, cols = np.where(flooded)
                sample_n = min(sample_limit, rows.size)
                if sample_n > 0:
                    idx = np.random.choice(rows.size, sample_n, replace=False)
                    rows = rows[idx]
                    cols = cols[idx]
                    for r, c in zip(rows, cols):
                        x, y = transform * (int(c), int(r))
                        flooded_pixels.append({
                            "row": int(r),
                            "col": int(c),
                            "x": float(x),
                            "y": float(y)
                        })

            return {
                "crs": str(crs) if crs else None,
                "elevation_min": elev_min,
                "elevation_max": elev_max,
                "elevation_mean": elev_mean,
                "flooded_count": flooded_count,
                "total_valid": total_valid,
                "flood_ratio": ratio,
                "flooded_pixels": flooded_pixels,
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis error: {e}")


@app.get("/analyze")
def analyze(city: str, slr: float, sample_limit: int = 500, include_points: bool = True):
    """
    Analyze DEM for a given city and sea-level-rise (meters).
    Returns a lightweight JSON with indices of flooded pixels (sampled) and summary stats.
    
    Args:
        city: Name of the DEM file (without extension).
        slr: Sea level rise in meters.
        sample_limit: Maximum number of flooded pixels to sample (default 500).
        include_points: Whether to include flooded_pixels array (default True).
    """
    dem_file = None
    for ext in (".tif", ".tiff"):
        path = os.path.join(DATA_DIR, f"{city}{ext}")
        if os.path.exists(path):
            dem_file = path
            break
    if not dem_file:
        raise HTTPException(status_code=404, detail=f"City '{city}' not found")

    result = _compute_analysis_cached(dem_file, float(slr), sample_limit, int(include_points))
    result["city"] = city
    result["slr"] = float(slr)
    return result


@app.get("/resolve_slr")
def resolve_slr_endpoint(lat: float, lon: float, scenario: str,
                         year: int, pct: int = 50):
    """Resolve effective SLR for a location under a given scenario.

    Returns IPCC regional projection + VLM correction combined.
    """
    base_slr = projection.resolve_slr(lat, lon, scenario, year, pct)
    if base_slr is None:
        raise HTTPException(status_code=400,
                            detail=f"Invalid scenario '{scenario}' or percentile {pct}")

    vlm_offset = vlm.resolve_vlm_offset(lat, lon, year)
    vlm_info = vlm.get_vlm_info(lat, lon)

    return {
        "slr_meters": round(base_slr + vlm_offset, 4),
        "ipcc_slr_meters": round(base_slr, 4),
        "vlm_offset_meters": round(vlm_offset, 4),
        "vlm_rate_mm_yr": vlm_info["vlm_mm_yr"],
        "vlm_source": vlm_info["source"],
        "projection_source": "regional" if projection.is_loaded() else "global_mean",
        "scenario": scenario,
        "year": year,
        "percentile": pct,
        "lat": lat,
        "lon": lon,
    }


@app.get("/projection_info")
def projection_info(lat: Optional[float] = None, lon: Optional[float] = None):
    """Return available scenario metadata, optionally with full projection curves."""
    info = projection.get_available_info()

    if lat is not None and lon is not None:
        info["projection_at"] = projection.get_projection_at(lat, lon)
        info["vlm"] = vlm.get_vlm_info(lat, lon)

    return info
