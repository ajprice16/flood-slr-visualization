
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, Response
import rasterio
from rasterio.merge import merge
from rasterio.windows import from_bounds, Window
from rasterio.transform import xy, rowcol
import numpy as np
import os
import tempfile
import mercantile
from PIL import Image
import math
import io
from functools import lru_cache
from rasterio.warp import reproject, Resampling
from affine import Affine
import re
from typing import Dict, List, Tuple


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(__file__)
DATA_DIR = os.path.join(BASE_DIR, "dem")
TILE_CACHE = os.path.join(BASE_DIR, "tile_cache")
POPULATION_DATA_DIR = os.path.join(BASE_DIR, "wp_2020")
os.makedirs(TILE_CACHE, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(POPULATION_DATA_DIR, exist_ok=True)

# In-memory caches
ANALYSIS_CACHE_SIZE = 128
TILE_CACHE_SIZE = 64  # Reduced from 512 to prevent OOM with reprojected tiles

# Spatial tile index: {tile_name: {"bounds": (lon_min, lat_min, lon_max, lat_max), "path": ...}}
TILE_INDEX: Dict[str, Dict] = {}

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
    """Build spatial index of all DEM tiles in DATA_DIR."""
    global TILE_INDEX
    TILE_INDEX = {}
    
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
    
    print(f"Built spatial index with {len(TILE_INDEX)} tiles")
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

def sample_population_at(lon: float, lat: float) -> float:
    """Sample population value at a geographic coordinate from available rasters.
    Sums overlapping rasters; returns 0.0 if no coverage.
    """
    val_sum = 0.0
    # Prefer multi-raster list
    for r in POPULATION_RASTERS:
        l, b, rgt, t = r["bounds"]
        if not (lon < l or lon > rgt or lat < b or lat > t):
            try:
                pop_row, pop_col = rowcol(r["transform"], lon, lat)
                if 0 <= pop_row < r["ds"].height and 0 <= pop_col < r["ds"].width:
                    win = Window.from_slices((pop_row, pop_row + 1), (pop_col, pop_col + 1))
                    arr = r["ds"].read(1, window=win)
                    v = float(arr[0, 0])
                    if np.isfinite(v) and v > 0:
                        val_sum += v
            except Exception:
                continue
    # Fallback single dataset
    if val_sum == 0.0 and POPULATION_DATASET is not None:
        try:
            pop_row, pop_col = rowcol(POPULATION_DATASET.transform, lon, lat)
            if 0 <= pop_row < POPULATION_DATASET.height and 0 <= pop_col < POPULATION_DATASET.width:
                win = Window.from_slices((pop_row, pop_row + 1), (pop_col, pop_col + 1))
                arr = POPULATION_DATASET.read(1, window=win)
                v = float(arr[0, 0])
                if np.isfinite(v) and v > 0:
                    val_sum += v
        except Exception:
            pass
    return val_sum

# Simple health endpoint
@app.get("/health")
def health():
    try:
        tiles = len(TILE_INDEX)
        return {"status": "ok", "tiles_indexed": tiles}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
        # Lightweight console log; adjust as needed
        try:
            path = request.url.path
            method = request.method
            status = getattr(request.state, "_status_code", None)
            print(f"[API] {method} {path} took {duration_ms:.1f} ms")
        except Exception:
            pass


def find_tiles_in_bbox(lon_min: float, lat_min: float, lon_max: float, lat_max: float) -> List[str]:
    """Find all DEM tiles that intersect the given bounding box.
    
    Args:
        lon_min, lat_min, lon_max, lat_max: bbox in decimal degrees (EPSG:4326)
    
    Returns:
        List of tile names that intersect the bbox
    """
    intersecting = []
    
    for tile_name, tile_info in TILE_INDEX.items():
        t_lon_min, t_lat_min, t_lon_max, t_lat_max = tile_info["bounds"]
        
        # Check for bbox intersection
        if not (lon_max < t_lon_min or lon_min > t_lon_max or 
                lat_max < t_lat_min or lat_min > t_lat_max):
            intersecting.append(tile_name)
    
    return intersecting


@app.on_event("startup")
def startup_event():
    """Build tile index and load population data on startup."""
    build_tile_index()
    load_population_data()


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


def generate_flood_raster(dem_path: str, slr_meters: float, out_path: str):
    """
    Create a binary flood GeoTIFF where cells with elevation < slr_meters are 1, else 0.
    Writes a GeoTIFF to out_path with the same transform/CRS as the input dem.
    """
    with rasterio.open(dem_path) as src:
        profile = src.profile.copy()
        elevation = src.read(1)

        # Create flood mask (1 = flooded, 0 = dry). Use nodata handling.
        nodata = profile.get('nodata', None)
        mask = np.zeros_like(elevation, dtype=np.uint8)
        valid = np.ones_like(elevation, dtype=bool)
        if nodata is not None:
            valid = elevation != nodata

        mask[np.logical_and(valid, elevation < slr_meters)] = 1

        profile.update(dtype=rasterio.uint8, count=1, compress='lzw')

        with rasterio.open(out_path, 'w', **profile) as dst:
            dst.write(mask, 1)

    return out_path


@lru_cache(maxsize=TILE_CACHE_SIZE)
def render_tile_png(dem_path: str, slr_meters: float, z: int, x: int, y: int, size: int = 256) -> bytes:
    """Render a PNG tile (size x size) of flooded areas for given WebMercator z/x/y.

    Flood definition: elevation < slr_meters AND finite (and not nodata if defined).
    Output: RGBA PNG with transparent dry pixels and semi-transparent blue flooded pixels.
    Cached with LRU policy.
    """
    with rasterio.open(dem_path) as src:
        # Get tile bounds in WGS84 (mercantile gives lon/lat which matches EPSG:4326 of DEM)
        b = mercantile.bounds(x, y, z)
        tile_left, tile_bottom, tile_right, tile_top = b.west, b.south, b.east, b.north

        # Dataset bounds
        ds_left, ds_bottom, ds_right, ds_top = src.bounds.left, src.bounds.bottom, src.bounds.right, src.bounds.top

        # Compute intersection
        left = max(tile_left, ds_left)
        right = min(tile_right, ds_right)
        bottom = max(tile_bottom, ds_bottom)
        top = min(tile_top, ds_top)

        # If no intersection, return fully transparent tile
        if left >= right or bottom >= top:
            rgba = np.zeros((size, size, 4), dtype=np.uint8)
            buf = io.BytesIO()
            Image.fromarray(rgba, mode='RGBA').save(buf, format='PNG')
            return buf.getvalue()

        # Build window for intersecting bounds
        window = from_bounds(left, bottom, right, top, transform=src.transform)
        try:
            elev = src.read(1, window=window, masked=True)
        except Exception:
            rgba = np.zeros((size, size, 4), dtype=np.uint8)
            buf = io.BytesIO()
            Image.fromarray(rgba, mode='RGBA').save(buf, format='PNG')
            return buf.getvalue()

        # Compute flood mask
        arr = np.array(elev, copy=False)
        nodata = src.nodata
        finite = np.isfinite(arr)
        if nodata is not None:
            finite &= arr != nodata
        flooded = np.logical_and(finite, arr < float(slr_meters))

        # Resize mask to tile size
        if flooded.size == 0:
            rgba = np.zeros((size, size, 4), dtype=np.uint8)
        else:
            mask_u8 = flooded.astype(np.uint8) * 255
            pil_mask = Image.fromarray(mask_u8, mode='L')
            # Pillow 10 uses Image.Resampling; fallback to legacy constant if needed
            resampling = Image.Resampling.NEAREST if hasattr(Image, 'Resampling') else 0  # 0 == NEAREST
            pil_mask_resized = pil_mask.resize((size, size), resample=resampling)
            mask_resized = np.array(pil_mask_resized)
            rgba = np.zeros((size, size, 4), dtype=np.uint8)
            rgba[mask_resized > 0] = [0, 0, 255, 160]  # semi-transparent blue

        buf = io.BytesIO()
        Image.fromarray(rgba, mode='RGBA').save(buf, format='PNG')
        return buf.getvalue()


@lru_cache(maxsize=TILE_CACHE_SIZE)
def render_tile_png_multi_cached(tile_paths_tuple: Tuple[str, ...], slr_meters: float, z: int, x: int, y: int, size: int = 256) -> bytes:
    """Cached wrapper for render_tile_png_multi. Uses tuple for hashability."""
    return render_tile_png_multi(list(tile_paths_tuple), slr_meters, z, x, y, size)

def render_tile_png_multi(tile_paths: List[str], slr_meters: float, z: int, x: int, y: int, size: int = 256) -> bytes:
    """Render a PNG tile from multiple DEM tiles, mosaicking as needed.
    
    Args:
        tile_paths: List of DEM file paths that intersect this tile
        slr_meters: Sea level rise threshold
        z, x, y: Web Mercator tile coordinates
        size: Output tile size in pixels
    
    Returns:
        PNG bytes (RGBA with transparent dry areas, blue flooded areas)
    """
    # If SLR is <= 0, render transparent (no flooding)
    if slr_meters <= 0:
        rgba = np.zeros((size, size, 4), dtype=np.uint8)
        buf = io.BytesIO()
        Image.fromarray(rgba, mode='RGBA').save(buf, format='PNG')
        return buf.getvalue()

    if not tile_paths:
        # No data for this tile, return transparent
        rgba = np.zeros((size, size, 4), dtype=np.uint8)
        buf = io.BytesIO()
        Image.fromarray(rgba, mode='RGBA').save(buf, format='PNG')
        return buf.getvalue()
    
    # Get tile bounds in WebMercator meters (EPSG:3857)
    wm = mercantile.xy_bounds(x, y, z)
    tile_left, tile_bottom, tile_right, tile_top = wm.left, wm.bottom, wm.right, wm.top
    
    try:
        # Open all intersecting DEMs
        datasets = []
        for path in tile_paths:
            try:
                datasets.append(rasterio.open(path))
            except Exception:
                continue
        
        if not datasets:
            rgba = np.zeros((size, size, 4), dtype=np.uint8)
            buf = io.BytesIO()
            Image.fromarray(rgba, mode='RGBA').save(buf, format='PNG')
            return buf.getvalue()
        
        # Mosaic the tiles (source CRS assumed to be EPSG:4326 / geographic)
        if len(datasets) == 1:
            src = datasets[0]
            mosaic_arr = src.read(1)
            mosaic_transform = src.transform
            nodata = src.nodata
            src_crs = src.crs
        else:
            mosaic_arr, mosaic_transform = merge(datasets)
            mosaic_arr = mosaic_arr[0]  # merge returns (bands, height, width)
            nodata = datasets[0].nodata
            src_crs = datasets[0].crs
        
        # Prepare destination grid in EPSG:3857 aligned to requested tile
        dst_crs = 'EPSG:3857'
        dst_transform = Affine(
            (tile_right - tile_left) / size, 0.0, tile_left,
            0.0, -(tile_top - tile_bottom) / size, tile_top
        )
        dst_arr = np.zeros((size, size), dtype=np.float32)
        dst_nodata = np.nan
        
        # Reproject source mosaic to destination grid (NEAREST for categorical thresholding)
        reproject(
            source=mosaic_arr,
            destination=dst_arr,
            src_transform=mosaic_transform,
            src_crs=src_crs,
            src_nodata=nodata if nodata is not None else None,
            dst_transform=dst_transform,
            dst_crs=dst_crs,
            dst_nodata=dst_nodata,
            resampling=Resampling.nearest
        )
        
        # Compute flood mask in destination grid
        finite = np.isfinite(dst_arr)
        flooded = np.logical_and(finite, dst_arr < float(slr_meters))
        
        rgba = np.zeros((size, size, 4), dtype=np.uint8)
        if flooded.size > 0:
            rgba[flooded] = [0, 0, 255, 160]
        
        # Close all datasets
        for ds in datasets:
            try:
                ds.close()
            except Exception:
                pass
        
        # Explicitly delete large arrays to help GC
        del mosaic_arr
        del dst_arr
        
        buf = io.BytesIO()
        Image.fromarray(rgba, mode='RGBA').save(buf, format='PNG')
        return buf.getvalue()
        
    except Exception:
        # Clean up on error
        try:
            for ds in datasets:
                ds.close()
        except Exception:
            pass
        rgba = np.zeros((size, size, 4), dtype=np.uint8)
        buf = io.BytesIO()
        Image.fromarray(rgba, mode='RGBA').save(buf, format='PNG')
        return buf.getvalue()


@app.get("/tiles/{z}/{x}/{y}")
def get_tile(z: int, x: int, y: int, slr: float = 1.0):
    """Return a PNG tile for specified z/x/y WebMercator tile index.
    
    Automatically finds and mosaics all DEM tiles that intersect this map tile.
    """
    # Get tile bounds
    b = mercantile.bounds(x, y, z)
    
    # Find intersecting DEM tiles
    tile_names = find_tiles_in_bbox(b.west, b.south, b.east, b.north)
    tile_paths = [TILE_INDEX[name]["path"] for name in tile_names if name in TILE_INDEX]

    try:
        # Use cached wrapper with hashable tuple to avoid 240s+ repeated reprojections
        png_bytes = render_tile_png_multi_cached(tuple(tile_paths), slr, z, x, y)
        return Response(
            content=png_bytes, 
            media_type="image/png",
            headers={
                "Cache-Control": "public, max-age=3600",  # Browser cache for 1 hour
                "X-Tiles-Used": str(len(tile_paths))
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tile rendering error: {e}")
@app.get("/analyze_region")
def analyze_region(lon_min: float, lat_min: float, lon_max: float, lat_max: float, 
                   slr: float, sample_limit: int = 100):
    """Analyze a geographic region for flood risk with SLR.
    
    Args:
        lon_min, lat_min, lon_max, lat_max: Bounding box in decimal degrees (EPSG:4326)
        slr: Sea level rise in meters
        sample_limit: Maximum flooded pixels to sample for visualization
    
    Returns:
        JSON with flood statistics and sampled flooded pixel coordinates
    """
    # Find all tiles intersecting the region
    tile_names = find_tiles_in_bbox(lon_min, lat_min, lon_max, lat_max)
    
    if not tile_names:
        raise HTTPException(status_code=404, detail="No DEM data available for this region")
    
    tile_paths = [TILE_INDEX[name]["path"] for name in tile_names]

    try:
        if slr <= 0:
            return {
                "bbox": {
                    "lon_min": lon_min,
                    "lat_min": lat_min,
                    "lon_max": lon_max,
                    "lat_max": lat_max
                },
                "slr": float(slr),
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
        # Iterate tiles and read only intersecting windows to avoid huge mosaics
        elev_min = None
        elev_max = None
        elev_sum = 0.0
        valid_count = 0
        flooded_count = 0
        flooded_pixels = []
        population_affected = 0.0

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

                    # Flood mask and sampling
                    flooded = np.logical_and(finite, arr < float(slr))
                    flooded_count += int(np.sum(flooded))
                    
                    # Estimate population affected using WorldPop data (multi-raster cross-border)
                    if np.any(flooded) and (POPULATION_RASTERS or POPULATION_DATASET is not None):
                        try:
                            fy, fx = np.where(flooded)
                            # Limit population sampling to avoid timeout on large regions
                            max_pop_samples = 5000
                            if len(fy) > max_pop_samples:
                                sample_idx = np.random.choice(len(fy), max_pop_samples, replace=False)
                                fy, fx = fy[sample_idx], fx[sample_idx]
                            xs, ys = xy(src.transform, fy + window.row_off, fx + window.col_off)
                            for px, py in zip(xs, ys):
                                population_affected += sample_population_at(px, py)
                        except Exception:
                            pass
                    
                    # Fallback: use heuristic if no WorldPop available
                    if not POPULATION_RASTERS and POPULATION_DATASET is None and np.any(flooded):
                        flooded_vals = arr[flooded]
                        pixel_area_km2 = 0.0009
                        for elev_val in flooded_vals:
                            if elev_val < 10.0:
                                density = 500
                            elif elev_val < 50.0:
                                density = 200
                            else:
                                density = 50
                            population_affected += density * pixel_area_km2
                    
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
            "slr": float(slr),
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
        raise HTTPException(status_code=500, detail=f"Analysis error: {str(e)}")






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
