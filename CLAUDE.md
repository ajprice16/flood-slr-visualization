# CLAUDE.md — Project Context for Claude Code

## Project

**Flood & Sea Level Rise Visualization** — containerized geospatial web app for exploring coastal
inundation under IPCC AR6 scenarios. React + Vite frontend, FastAPI backend, Nginx gateway,
orchestrated with Docker Compose.

GitHub: https://github.com/ajprice16/flood-slr-visualization

---

## GitHub Wiki Progress

Wiki pages live in `wiki/` in this repo. To publish them, push each file to the wiki repository:

```bash
git clone https://github.com/ajprice16/flood-slr-visualization.wiki.git wiki-repo
cp wiki/*.md wiki-repo/
cd wiki-repo && git add -A && git commit -m "Add wiki pages" && git push
```

### Pages

| Page | File | Status |
|------|------|--------|
| Home | `wiki/Home.md` | ✅ Done |
| Getting Started | `wiki/Getting-Started.md` | ✅ Done |
| User Guide | `wiki/User-Guide.md` | ✅ Done |
| Architecture | `wiki/Architecture.md` | ✅ Done |
| API Reference | `wiki/API-Reference.md` | ✅ Done |
| Story Mode | `wiki/Story-Mode.md` | ✅ Done |
| Deployment | `wiki/Deployment.md` | ✅ Done |
| Configuration | `wiki/Configuration.md` | ✅ Done |
| Data Sources | `wiki/Data-Sources.md` | ✅ Done |
| Troubleshooting | `wiki/Troubleshooting.md` | ✅ Done |
| Development | `wiki/Development.md` | ✅ Done |

### Screenshot Placeholders

Each page marks spots needing real screenshots with a blockquote:
`> 📸 **Screenshot needed:** [description]`

To capture them, run the app (`docker compose up -d` or `npm run dev` + uvicorn) and take
screenshots at the annotated UI states.

---

## Key Architecture Facts

- Backend: `Backend/main.py` — FastAPI, LRU tile cache, Redis L2 cache (optional), spatial tile index
- Frontend: `Frontend/src/App.jsx` (controls) + `MapView.jsx` (map) + `StoryMap.jsx` (story panel) + `LandingPage.jsx` (disclaimer gate)
- DEM tiles: `Backend/dem/` — DiluviumDEM GeoTIFFs, named `DiluviumDEM_N34_00_E118_00.tif`
- Population: `Backend/wp_2020/` — WorldPop 2020 ~1 km rasters
- Projections: `Backend/data/ipcc_ar6_slr.json` (optional, falls back to embedded global mean)
- VLM: `Backend/data/ice6g_vlm.json` + `midas_vlm.json` (optional, falls back to 0)

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
