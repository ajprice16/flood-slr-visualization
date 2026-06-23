---
name: tile-debug
description: Debug a specific map tile by fetching it from the local backend and reporting HTTP headers, cache status, DEM coverage, and key diagnostics. Use when a tile looks wrong in the browser but you want a quick sanity check before running tile-inspect.
---

Collect the following information and report it concisely. Ask the user for z/x/y if not provided; default to z=10 x=163 y=395 (San Francisco Bay), slr=1.0m, connectivity=boundary.

## Steps

1. **Health check**
```bash
curl -s http://localhost:8080/api/health
```

2. **Tile index info**
```bash
curl -s http://localhost:8080/api/tiles/info
```

3. **Tile headers** (replace z/x/y/params as appropriate)
```bash
curl -sI "http://localhost:8080/api/tiles/{z}/{x}/{y}?slr={slr}&connectivity={mode}"
```
Key headers to report: HTTP status, `Content-Type`, `Content-Length`, `X-Cache-Hit`, `X-Render-Ms`.

4. **DEM coverage for this tile's bbox**
Use mercantile to get bounds, then:
```bash
curl -s "http://localhost:8080/api/debug/tiles_in_bbox?lon_min={west}&lat_min={south}&lon_max={east}&lat_max={north}"
```

5. **Connectivity mode check** — if the tile is blank/near-blank, re-fetch with `connectivity=none` to rule out connectivity culling:
```bash
curl -sI "http://localhost:8080/api/tiles/{z}/{x}/{y}?slr={slr}&connectivity=none"
```

## Diagnosis guide

| Symptom | Likely cause |
|---------|-------------|
| HTTP 404 | No DEM file covers this tile's bbox |
| 200 but Content-Length ≈ 68 bytes | Transparent tile — no DEM or no flood pixels |
| Flood disappears with `boundary` but not `none` | Connectivity culling too aggressive; landlocked pixels removed |
| X-Cache-Hit: true but stale result | Clear `Backend/tile_cache/` and restart |
| HTTP 500 | Check `docker logs slr-backend` for rasterio/GDAL error |

For a full pixel-level analysis (ASCII art, flood pixel count, etc.) run `/tile-inspect` instead.
