# Flood & Sea Level Rise Visualization - AI Coding Agent Instructions

## Architecture Overview

This is a **containerized geospatial web application** with three services orchestrated via Docker Compose:

- **Backend** (FastAPI): Serves DEM tiles with flood overlays, performs regional flood analysis with population estimates
- **Frontend** (React/Vite): Interactive MapLibre GL map with story mode for touring vulnerable cities
- **Gateway** (Nginx): Reverse proxy routing `/api/*` to backend, everything else to frontend SPA

**Critical data flow**: Frontend requests map tiles at `/api/tiles/{z}/{x}/{y}?slr={meters}` → Gateway proxies to backend:8000 → Backend finds intersecting DEM tiles from spatial index, reprojects to Web Mercator, overlays flood layer (blue for pixels ≤ slr threshold), returns PNG tile.

## Development Workflows

### Running Locally (Recommended)

**Backend** (uses virtual environment at `Backend/.venv`):
```powershell
cd Backend
.venv\Scripts\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
Or use VS Code task: `Run Uvicorn (Backend, app-dir)` (handles module path correctly).

**Frontend**:
```powershell
cd Frontend
npm install
npm run dev  # Vite dev server on port 5173
```
In dev mode, `Frontend/src/api.js` auto-detects port and proxies API calls to `:8000`.

### Running via Docker

```powershell
docker compose up -d
```
Access at `http://localhost`. Backend runs with 2 Uvicorn workers. Frontend is pre-built static SPA served by Nginx.

### Data Dependencies

- **DEM tiles**: Place in `Backend/dem/`. Format: `DiluviumDEM_N{lat}_{min}_E{lon}_{min}.tif` (1° x 1° coverage)
- **WorldPop data**: Place `.tif` files in `Backend/wp_2020/`. Download via `python Backend/download_worldpop.py --iso USA MEX JPN --out Backend/wp_2020`

Backend builds spatial tile index on startup (`build_tile_index()`) to quickly find tiles intersecting any bounding box.

## Key Patterns & Conventions

### Backend Tile Rendering (Backend/main.py)

- **Spatial indexing**: `parse_dem_filename()` extracts bounds from filenames, `find_tiles_in_bbox()` performs spatial query
- **Multi-tile mosaics**: `merge_tiles()` combines overlapping DEM tiles, then reprojects to Web Mercator (EPSG:3857) for map display
- **LRU caching**: `render_tile_png_multi_cached()` uses `@lru_cache(maxsize=64)` with tuple of tile paths as key to cache reprojected tiles (avoid 240s+ repeated GDAL operations)
- **Flood overlay**: Pixels where `elevation <= slr` are colored blue (rgba: 0,102,204,150); others transparent
- **Population sampling**: `sample_population_at()` queries WorldPop rasters at flooded pixel coordinates; handles multiple overlapping rasters

### Frontend Map Integration (Frontend/src/)

- **MapLibre GL**: Uses Esri World Imagery basemap + Esri Boundaries & Places labels (see `MapView.jsx` `addBasemap()`)
- **Custom tile source**: Adds DEM+flood layer as raster source with URL template `/api/tiles/{z}/{x}/{y}?slr={slr}`
- **Debounced analysis**: `App.jsx` debounces `analyzeRegion()` API calls on map move to avoid hammering backend; skips spans > 40° lat/lon
- **Story mode**: `StoryMap.jsx` displays narrative panels loaded from `Frontend/public/cities/*.txt`; `App.jsx` coordinates map flyTo animations

### API Conventions

- **Primary endpoints**:
  - `GET /tiles/{z}/{x}/{y}?slr={meters}` - PNG tile with flood overlay
  - `GET /analyze_region?lon_min=...&slr={meters}` - Returns `{flooded_pixels: [[lon,lat,pop], ...], flood_ratio, total_population_affected}`
  - `GET /health` - Health check with tile count
- **Retry logic**: `api.js` retries failed requests up to 3x with exponential backoff
- **Performance tracking**: All API calls return `durationMs` metadata for debugging latency

### Docker Network

Services communicate via user-defined bridge network `slr-net` with DNS aliases. Nginx uses Docker's internal resolver `127.0.0.11` to resolve `backend` and `frontend` hostnames.

### Environment Variables

- `VITE_API_BASE`: Frontend API prefix (default `/api` for production behind gateway)
- `TILE_CACHE_SIZE`: Backend LRU cache size for reprojected tiles (default 64)

## City Story Content

Edit narratives in `Frontend/public/cities/{city-name}.txt`. Format: plain text, loaded async by `StoryMap.jsx`. Cities configured in `App.jsx` stories array with coords, zoom, and SLR value.

## Common Gotchas

- **Module path issues**: Backend must run from project root or use `--app-dir Backend/` to resolve `main:app` module correctly
- **Large TIFF files excluded**: `.gitignore` blocks `*.tif` files to avoid repo bloat. Data must be supplied separately.
- **CORS for dev**: Backend allows all origins; production should restrict to gateway domain
- **Tile cache OOM**: Reprojected tiles consume significant memory; TILE_CACHE_SIZE=64 prevents out-of-memory on modest hardware
- **Flood overlay transparency**: Alpha=150 provides visible highlight without obscuring satellite imagery

## Testing & Debugging

- Check backend health: `curl http://localhost:8000/health` (or `/api/health` via gateway)
- Inspect tile index: `GET /tiles/info` returns tile count and sample bounds
- Debug bounding box queries: `GET /debug/tiles_in_bbox?lon_min=...` shows which tiles intersect region
- Monitor API performance: Frontend logs request duration in console; backend logs tile cache hits/misses

## Dependencies

**Backend**: FastAPI, rasterio (GDAL wrapper), mercantile (tile math), Pillow (PNG encoding), numpy
**Frontend**: React 18, Vite, MapLibre GL JS 3.x
**Data sources**: DiluviumDEM (elevation), WorldPop (population density), Esri basemaps
