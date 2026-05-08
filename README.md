# Flood & Sea Level Rise Visualization

Flood & Sea Level Rise Visualization is a containerized geospatial web application for exploring coastal inundation under multiple IPCC AR6 sea level rise scenarios. It combines DEM-based flood overlays, regional projection lookups, vertical land motion adjustments, and population impact estimates in a browser-based map experience.

## Highlights

- Interactive satellite map with flood overlays rendered as on-demand raster tiles.
- Scenario-based sea level rise using IPCC AR6 projections, including percentile selection.
- Vertical land motion correction to account for local uplift or subsidence where data is available.
- Regional flood analysis with estimated affected population from WorldPop rasters.
- Story mode with curated city narratives for guided exploration.

## Documentation

Full documentation is in the [GitHub Wiki](https://github.com/ajprice16/flood-slr-visualization/wiki):

- [Getting Started](https://github.com/ajprice16/flood-slr-visualization/wiki/Getting-Started) — install, data setup, Docker
- [User Guide](https://github.com/ajprice16/flood-slr-visualization/wiki/User-Guide) — map controls and features
- [Architecture](https://github.com/ajprice16/flood-slr-visualization/wiki/Architecture) — system design and data flow
- [API Reference](https://github.com/ajprice16/flood-slr-visualization/wiki/API-Reference) — all REST endpoints
- [Story Mode](https://github.com/ajprice16/flood-slr-visualization/wiki/Story-Mode) — guided city narratives
- [Deployment](https://github.com/ajprice16/flood-slr-visualization/wiki/Deployment) — production setup (Jetstream2, Caddy, HTTPS)
- [Configuration](https://github.com/ajprice16/flood-slr-visualization/wiki/Configuration) — environment variables and tuning
- [Data Sources](https://github.com/ajprice16/flood-slr-visualization/wiki/Data-Sources) — datasets and credits
- [Troubleshooting](https://github.com/ajprice16/flood-slr-visualization/wiki/Troubleshooting) — common issues
- [Development](https://github.com/ajprice16/flood-slr-visualization/wiki/Development) — local dev workflow and tests

## Architecture

The application is split into three services orchestrated with Docker Compose:

- Frontend: React + Vite single-page application using MapLibre GL JS.
- Backend: FastAPI service that serves flood tiles and regional analysis results.
- Gateway: Nginx reverse proxy routing `/api/*` to the backend and all other requests to the frontend.

Core request flow:

1. The frontend requests flood tiles from `/api/tiles/{z}/{x}/{y}` with `scenario`, `year`, and `pct` query parameters.
2. The backend resolves the effective sea level rise for the tile center using IPCC AR6 projections plus vertical land motion adjustments.
3. Intersecting DEM tiles are merged, reprojected to Web Mercator, thresholded against the resolved water level, and returned as transparent PNG overlays.

## Technology Stack

- Backend: Python 3.11, FastAPI, Rasterio, NumPy, SciPy, Mercantile, Pillow
- Frontend: React 18, Vite, MapLibre GL JS
- Infrastructure: Docker Compose, Nginx
- Data: DiluviumDEM elevation rasters, WorldPop population rasters, IPCC AR6 projection data, optional VLM datasets

## Repository Layout

```text
Backend/   FastAPI service, data loaders, tile rendering, analysis logic
Frontend/  React application and map UI
Gateway/   Nginx reverse proxy configuration
```

## Data Requirements

This repository does not commit large raster datasets. You must supply them locally.

- DEM tiles: place GeoTIFFs in `Backend/dem/`
- WorldPop rasters: place GeoTIFFs in `Backend/wp_2020/`
- Optional projection and VLM data: place downloaded JSON assets in `Backend/data/`

Useful helper scripts:

- `Backend/download_worldpop.py`
- `Backend/download_ipcc_ar6.py`
- `Backend/download_vlm.py`

Expected DEM naming format:

```text
DiluviumDEM_N34_00_E118_00.tif
```

## Running With Docker

Start the full stack:

```bash
docker compose up -d
```

Open the application at `http://localhost`.

## Local Development

### Backend

The repository is set up to use a virtual environment at `Backend/.venv`.

```powershell
cd Backend
.venv\Scripts\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Alternative: use the VS Code task `Run Uvicorn (Backend, app-dir)`.

### Frontend

```powershell
cd Frontend
npm install
npm run dev
```

In development, the frontend automatically talks to the backend on port `8000` when served from Vite on port `5173`.

## API Overview

Main endpoints exposed through the gateway:

- `GET /api/tiles/{z}/{x}/{y}?scenario=ssp585&year=2150&pct=50`
- `GET /api/analyze_region?lon_min=...&lat_min=...&lon_max=...&lat_max=...&scenario=ssp245&year=2100&pct=50`
- `GET /api/resolve_slr?lat=...&lon=...&scenario=ssp245&year=2100&pct=50`
- `GET /api/health`
- `GET /api/tiles/info`
- `GET /api/debug/tiles_in_bbox?lon_min=...&lat_min=...&lon_max=...&lat_max=...`

## Configuration

Environment variables currently used by the application:

- `VITE_API_BASE`: frontend API base path. Defaults to `/api` in gateway mode.
- `TILE_CACHE_SIZE`: backend in-memory LRU cache size for rendered tiles. Docker Compose defaults to `512`.

## Story Content

Story mode text lives in `Frontend/public/cities/`.

Current story locations include:

- Miami
- New Orleans
- Tokyo
- Tabasco, Mexico
- Bangladesh

## Operational Notes

- Large raster files are excluded by `.gitignore` and should be managed outside version control.
- Tile responses are intentionally not browser-cached to avoid stale overlays after data or rendering updates.
- If the view spans more than 40 degrees in latitude or longitude, regional analysis is skipped until the map is zoomed in.

## Troubleshooting

- Backend health check: `http://localhost/api/health`
- Tile inventory: `http://localhost/api/tiles/info`
- Bounding-box tile debug: `http://localhost/api/debug/tiles_in_bbox?...`
- If local development fails to resolve the backend module path, use the VS Code backend task or run Uvicorn with `--app-dir Backend`.

## Data Sources And Credits

- **Elevation**: DiluviumDEM
- **Population**: WorldPop 2020
- **Sea Level Projections**: IPCC AR6 WG1 Regional Sea-Level Projections (Garner et al., 2022; Zenodo: https://doi.org/10.5281/zenodo.6382554)
- **Vertical Land Motion (VLM)**:
  - ICE-6G_C: Global GIA (Glacial Isostatic Adjustment) baseline
  - MIDAS/NGL: GPS-observed total VLM stations
- **Basemap and Labels**: Esri World Imagery and Esri Boundaries and Places
- **Mapping Library**: MapLibre GL JS

## License

No repository-wide open-source license file is currently included. Treat the codebase as proprietary unless and until a project license is added. Third-party datasets and basemap providers remain subject to their own licenses and terms of use.
