# Troubleshooting

---

## Flood overlay does not appear / map stays blank

**Symptom:** The map loads with satellite imagery but no blue flood areas appear even at high
zoom and high SLR scenarios.

**Check 1 — Tile index**

```bash
curl http://localhost/api/health
# Expected: {"status":"ok","tiles_indexed":842}
```

If `tiles_indexed` is 0:
- Verify DEM files are in `Backend/dem/`
- Verify filenames match the pattern `DiluviumDEM_N34_00_E118_00.tif`
- Restart the backend: `docker compose restart backend`

**Check 2 — DEM coverage**

```bash
curl "http://localhost/api/tiles/info"
```

Compare the `coverage` bounds against the area you are viewing. If you are viewing a region
not covered by your DEM tiles, no flood overlay will appear.

**Check 3 — Resolved SLR**

Open the sidebar. If the **Effective SLR** box shows `0.00m` or does not appear, the backend
may be returning 0. Try a higher scenario (SSP5-8.5) and later year (2150) to confirm the
mechanism works before troubleshooting data issues.

**Check 4 — Connectivity mode**

Switch Connectivity to **None** temporarily. If flood pixels appear with "None" but not with
"Boundary", the flooded pixels are inland depressions not connected to the tile edge. This is
expected behavior for "Boundary" mode — try **3×3 Mosaic** for a middle ground.

---

## `tiles_indexed: 0` after starting the backend

1. Check that `Backend/dem/` exists and contains `.tif` files.
2. Check filename format — any file not matching `DiluviumDEM_*` is silently skipped.
3. Check backend logs for parse errors:
   ```bash
   docker compose logs backend | grep -i "tile\|index\|error"
   ```
4. If using Spaces (`DEM_BUCKET` set), verify the bucket credentials:
   ```bash
   docker compose logs backend | grep "Spaces\|boto\|error"
   ```

---

## Backend returns 500 on tile requests

```bash
docker compose logs backend --tail=50
```

Common causes:

| Cause | Fix |
|-------|-----|
| rasterio can't read a corrupt `.tif` | Remove or replace the offending file |
| Reprojection error (CRS mismatch) | Ensure DEM tiles are in EPSG:4326; DiluviumDEM tiles are, by default |
| Out of memory during merge | Reduce `TILE_CACHE_SIZE` or zoom in to reduce tile count |

---

## `analyze_region` returns 404 "No DEM data available"

The viewport bbox does not intersect any loaded DEM tile. Use `tiles/info` to check coverage
and pan the map to a covered region, or add more DEM tiles.

---

## Population affected is always 0

**No WorldPop files:** Place `.tif` files in `Backend/wp_2020/` and restart the backend.

```bash
docker compose logs backend | grep -i "population\|worldpop"
```

**Coverage mismatch:** WorldPop tiles may not cover the same region as the DEM tiles you are
viewing. The API returns 0 for any DEM pixel whose center does not fall within any loaded
WorldPop raster.

---

## VLM shows "none" source — no VLM correction

This means neither `ice6g_vlm.json` nor `midas_vlm.json` was found in `Backend/data/`. The
backend falls back to 0 mm/yr VLM, so only the IPCC base projection is used.

```bash
ls Backend/data/
python Backend/download_vlm.py   # download VLM data
docker compose restart backend
```

---

## SLR uses "global_mean" instead of "regional" projection

`Backend/data/ipcc_ar6_slr.json` is missing. Regional projections give location-specific
values; the global mean is the fallback.

```bash
python Backend/download_ipcc_ar6.py
docker compose restart backend
```

---

## Map loads slowly or tiles time out

1. **Check GDAL cache:** Increase `GDAL_CACHEMAX` (in MB). If DEM tiles are large, GDAL
   re-reads blocks repeatedly without enough cache.

2. **Add Redis:** Without Redis, each of the `UVICORN_WORKERS` processes has its own LRU
   cache. A tile hit on worker A is a miss on worker B. Set `REDIS_URL` to share a cache.

3. **Reduce workers:** Counter-intuitively, too many workers competing for disk I/O can slow
   tile generation. Start with `UVICORN_WORKERS=4` and increase gradually.

4. **Zoom in:** At low zoom levels (< 7) each tile covers a large geographic area and may
   require merging many DEM files. Analysis is disabled automatically when the view spans
   more than 40°.

---

## Frontend shows "Error: ..." in the sidebar

Expand the browser DevTools console for the full error. Common causes:

| Error | Cause | Fix |
|-------|-------|-----|
| `Failed to fetch` | Backend unreachable | Check `docker compose ps` and backend logs |
| `status 404` on analyze_region | No DEM data for the bbox | Pan to a covered region |
| `status 500` | Backend crash | Check `docker compose logs backend` |

---

## `docker compose up` fails to build

```bash
docker compose build --no-cache
```

If the build fails with a `pip install` error in the backend:
- Check internet connectivity on the build host.
- Try pulling the base image manually: `docker pull python:3.11-slim`.

---

## Health check endpoint not reachable from outside the server

Make sure the firewall allows port 80 (and 443 for HTTPS):

```bash
sudo ufw status
# Should show: 80/tcp ALLOW Anywhere
```

For Jetstream2, also check the security group rules in the Jetstream2 Horizon dashboard.

---

## Logs and Diagnostic Commands

```bash
# All service logs (follow)
docker compose logs -f

# Backend only
docker compose logs -f backend

# Check tile index
curl http://localhost/api/health

# Check tile coverage
curl http://localhost/api/tiles/info

# Check SLR resolution for a specific location (Miami)
curl "http://localhost/api/resolve_slr?lat=25.76&lon=-80.19&scenario=ssp245&year=2100&pct=50"

# Active users
curl http://localhost/api/stats

# Debug: which tiles intersect a bbox (requires DEBUG_MODE=true)
curl "http://localhost/api/debug/tiles_in_bbox?lon_min=-81&lat_min=25&lon_max=-80&lat_max=26"
```
