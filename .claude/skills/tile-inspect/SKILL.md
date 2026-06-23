---
name: tile-inspect
description: Generate a text-based tile diagnostics report — pixel stats, DEM coverage, and ASCII art preview — without requiring a screenshot. Use this whenever the user describes a tile rendering issue (wrong area lit up, flood missing, seam artifacts, cache stale) and you need to understand what the tile actually contains.
---

This skill replaces screenshots for tile issues. The output gives you: geographic bounds, pixel counts (flood vs transparent), which DEM files were involved, and a 32×32 ASCII preview where `.` = void and `#` = flood.

## How to invoke

Ask the user for the tile coordinates. They can provide either:
- z/x/y directly (seen in browser DevTools → Network tab, tile URL)
- A permalink URL (the app encodes lat/lon/zoom in query params — parse `lat`, `lng`, `z`)
- A description like "the tile covering downtown Miami at zoom 10" — compute from lat/lon

If given a permalink URL like `https://sea-level-rise.org/?s=ssp245&y=2100&p=50&lat=25.77&lng=-80.19&z=10`:
1. Extract `lat`, `lng`, `z` from query params
2. Compute tile coords: `python3 -c "import mercantile; t = mercantile.tile(-80.19, 25.77, 10); print(t)"`

## Run the inspector

```bash
cd /home/exouser/Documents/ProjWeb/flood-slr-visualization
python Backend/scripts/tile_inspect.py {z} {x} {y} \
  --host localhost:8080 \
  --slr {slr_meters} \
  --connectivity {mode}
```

To use IPCC scenario params instead of a fixed SLR value:
```bash
python Backend/scripts/tile_inspect.py {z} {x} {y} \
  --scenario ssp245 --year 2100 --pct 50 \
  --connectivity boundary
```

To check if connectivity culling is hiding flood pixels (always try when flood=0):
```bash
python Backend/scripts/tile_inspect.py {z} {x} {y} --slr {slr} --connectivity none
```

From lat/lon directly:
```bash
python Backend/scripts/tile_inspect.py --lat {lat} --lon {lon} --zoom {z} --slr {slr}
```

## Interpreting output

| Finding | Meaning |
|---------|---------|
| Size ≈ 68 bytes | Transparent tile — no DEM coverage OR zero flood pixels |
| Flood = 0%, connectivity=boundary | Try `--connectivity=none`; if flood appears → BFS culling is removing landlocked pixels |
| Flood = 0%, connectivity=none | No DEM data for this bbox, or SLR too low for any pixel to flood |
| Flood = 100% | SLR value very high, or DEM values globally near zero (data issue) |
| `?` chars in ASCII preview | Anomalous pixel colour — indicates a render bug (not flood blue, not transparent) |
| DEM coverage = 0 files | No GeoTIFF covers this tile; check `Backend/dem/` for the expected file name |
| Cache hit but wrong result | Clear `Backend/tile_cache/` and re-request |

## Communicating results to Claude

Paste the full script output into the conversation. The ASCII preview + pixel stats + DEM file list gives Claude everything needed to diagnose the issue without a screenshot.

Example of a useful report:
```
Tile 10/163/395
Bounds: 122.5190°W–122.1680°W, 37.6832°N–37.9262°N
HTTP: 200 | Cache: MISS | Size: 11842 bytes

Pixel stats (256×256 = 65536 px):
  Transparent: 48302  (73.7%)
  Flood:        8234  (12.6%)
  Anomalous:       0

DEM coverage:
  ✓ DiluviumDEM_N37_00_W123_00.tif

ASCII preview (32×32):
  ................................
  ........WWWWW...................
  .......W#####W..................
```
This tells Claude: DEM is present, 12.6% of the tile is flooded, and the flood cluster is in the centre-left — enough to diagnose placement bugs.
