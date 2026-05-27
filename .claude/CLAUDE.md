# CLAUDE.md — Project Context for Claude Code

## Project

**Flood & Sea Level Rise Visualization** — containerized geospatial web app for exploring coastal
inundation under IPCC AR6 scenarios. React + Vite frontend, FastAPI backend, Nginx gateway,
orchestrated with Docker Compose.

GitHub: https://github.com/ajprice16/flood-slr-visualization

---

## Documentation

- **Project README**: `README.md` at the repo root. Hero image lives at `docs/images/`.
- **Wiki**: hosted exclusively on GitHub at
  <https://github.com/ajprice16/flood-slr-visualization/wiki>, backed by the separate
  `flood-slr-visualization.wiki.git` repository. There is **no** in-repo `wiki/` directory —
  edit pages by cloning the wiki repo, committing, and pushing.

```bash
git clone https://github.com/ajprice16/flood-slr-visualization.wiki.git
# edit pages, then:
git add -A && git commit -m "..." && git push
```

---

## Key Architecture Facts

- Backend: `Backend/main.py` — FastAPI, LRU tile cache, Redis L2 cache (optional), spatial tile index
- Frontend: `Frontend/src/App.jsx` (controls) + `MapView.jsx` (map) + `StoryMap.jsx` (story panel) + `LandingPage.jsx` (disclaimer gate)
- DEM tiles: `Backend/dem/` — DiluviumDEM GeoTIFFs, named `DiluviumDEM_N34_00_E118_00.tif`
- Population: `Backend/wp_2020/` — WorldPop 2020 ~1 km rasters
- Projections: `Backend/data/ipcc_ar6_slr.json` (optional, falls back to embedded global mean). This is the AR6 `regional-confidence` *total* product — relative sea level, so vertical land motion (GIA + background VLM) is already baked in; do not add a separate VLM correction.

## Deployment Modes

| Mode | Command | Description |
|------|---------|-------------|
| Dev | `docker compose up -d` (or Vite + uvicorn) | Local HTTP |
| IP-only | `./deploy/manage.sh ip-up` | Public IP, no TLS |
| Public HTTPS | `./deploy/manage.sh public-up` | Caddy + auto-TLS |

## Connectivity Modes (tile rendering)

| Mode | Behaviour |
|------|-----------|
| `boundary` | Keep only flood pixels connected to tile edge (default) |
| `none` | Show all below-threshold pixels regardless of connectivity |
| `full` | 3×3 tile mosaic — flood propagates across tile seams before crop |
