# Data Sources

This page documents every dataset the tool uses, how it is processed, and — just as importantly
— what the resulting flood overlay does and does not represent.

---

## Methodology in plain language

For each tile the user looks at, the backend performs the same five-step computation:

1. **Find the right sea level for *this* place.** Look up the nearest IPCC AR6 regional
   sea-level station to the tile's center and read the projection curve for the chosen
   scenario, year, and percentile. If the regional dataset is absent, fall back to an
   embedded IPCC AR6 *global mean* table from Table 9.9.
2. **Adjust for how the land is moving.** Add a vertical land motion (VLM) offset using the
   nearest MIDAS GPS station within 0.5°; if there is none, use the ICE-6G_C glacial
   isostatic adjustment grid; otherwise zero. The offset is `−rate_mm_yr ÷ 1000 × (year − 2005)`.
   Subsidence (negative GPS rate) makes effective SLR larger.
3. **Read the elevation.** Pull the intersecting region from DiluviumDEM with a windowed
   `rasterio` read, reproject it into the 256×256 Web Mercator tile grid.
4. **Apply the threshold and connectivity filter.** Mark every pixel whose elevation is below
   the effective SLR as flooded; then (by default) keep only pixels connected to the tile
   edge, so isolated inland depressions are not colored blue.
5. **Render and cache.** Encode the flood mask as a translucent blue PNG and serve it.

For population exposure, the same flood mask is intersected with WorldPop 2020 ~1 km
population pixels and summed.

For a full diagrammatic walk-through, see [Architecture](Architecture#tile-request-data-flow).

---

## What this model does and does not represent

This is a **threshold-based "bathtub" inundation surface** with connectivity filtering. It is
appropriate for first-order *exposure screening* and pedagogy. It is not appropriate for
engineering decisions, evacuation planning, or insurance underwriting.

The tool **does** account for:

- Regional variation in sea level rise from the IPCC AR6 dataset (gravitational fingerprints
  of ice melt, ocean dynamics, atmospheric pressure)
- Vertical land motion from GPS observations and the ICE-6G_C GIA model
- High-resolution coastal elevation from DiluviumDEM (which already corrects much of the
  SRTM-era overestimation in low-lying coastal zones)
- Connectivity: removing isolated inland depressions that would otherwise be colored as
  flooded but cannot physically connect to the ocean

The tool **does not** account for:

- Storm surge, tides, wave run-up, or king tides
- Levees, sea walls, pumps, breakwaters, or other coastal defenses
- Drainage, runoff, river-flood interaction, or pluvial flooding
- Soil saturation, groundwater rise, or salinization
- Time-varying subsidence not captured in the linear MIDAS/ICE-6G_C trend
- Ice-sheet dynamics beyond what the IPCC AR6 percentiles already capture
- Population change between 2020 (WorldPop snapshot) and the projection year — population
  numbers are *today's people on tomorrow's water*

If you need any of the above, you need a hydrodynamic model (e.g. ADCIRC, Delft3D) and a
projected demographic dataset.

---

## Elevation — DiluviumDEM

| Attribute | Value |
|-----------|-------|
| **Source** | DiluviumDEM (Dusseau et al.) |
| **Format** | GeoTIFF, EPSG:4326, 1″ resolution (≈ 30 m) |
| **Coverage** | Coastal regions worldwide |
| **License** | See DiluviumDEM project for terms |
| **Local path** | `Backend/dem/` |

DiluviumDEM is a coastal-optimized DEM built to improve upon SRTM and other global DEMs in
low-elevation coastal zones. Each file covers exactly 1°×1° and is named:

```
DiluviumDEM_{N|S}{DD}_{MM}_{E|W}{DDD}_{MM}.tif
```

**How it is used:** The backend parses the filename to extract the bounding box, builds a
spatial index at startup, and uses windowed `rasterio` reads to extract only the portion of
each tile that overlaps a requested Web Mercator tile or analysis bbox. Elevation values are
compared against the effective SLR threshold to produce the flood mask.

---

## Population — WorldPop 2020

| Attribute | Value |
|-----------|-------|
| **Source** | WorldPop (www.worldpop.org) |
| **Year** | 2020 |
| **Resolution** | ~1 km (0.008333° / 30 arc-seconds) |
| **Format** | GeoTIFF, EPSG:4326 |
| **License** | Creative Commons Attribution 4.0 (CC BY 4.0) |
| **Local path** | `Backend/wp_2020/` |
| **Download script** | `Backend/download_worldpop.py` |

WorldPop provides gridded population estimates. Each pixel value is an estimate of the number
of people living in that ~1 km² cell.

**How it is used:** For each flood analysis request the backend finds WorldPop pixels whose
centers fall inside the DEM window, maps them to DEM row/col coordinates, checks whether
the corresponding DEM pixel is below the SLR threshold, and sums the population values of
flooded pixels to produce `estimated_population_affected`.

Without WorldPop files the app uses a coarse density heuristic (500 people/km² below 10 m,
200 at 10–50 m, 50 above 50 m) and reports an approximate figure.

---

## Sea Level Projections — IPCC AR6

| Attribute | Value |
|-----------|-------|
| **Source** | IPCC AR6 WG1 Regional Sea-Level Projections |
| **Reference** | Garner et al., 2022 |
| **DOI** | https://doi.org/10.5281/zenodo.6382554 |
| **Scenarios** | SSP1-2.6, SSP2-4.5, SSP3-7.0, SSP5-8.5 |
| **Percentiles** | 5th, 50th, 95th |
| **Years** | 2030–2150 (decadal) |
| **Local path** | `Backend/data/ipcc_ar6_slr.json` (after download) |
| **Download script** | `Backend/download_ipcc_ar6.py` |

The IPCC AR6 dataset provides regionalized sea level projections at hundreds of tide-gauge
and virtual station locations worldwide, accounting for the full gravitational fingerprint
of ice melt, ocean dynamics, and atmospheric pressure.

**How it is used:**
1. At startup, the backend loads the JSON and builds a KD-tree over station locations.
2. For each tile or analysis request, the nearest station to the query point is found via
   KD-tree nearest-neighbor search.
3. The projection curve for the station's scenario + percentile is interpolated linearly to
   the requested year.

**Fallback:** If `ipcc_ar6_slr.json` is absent, the backend uses a pre-embedded global-mean
SLR table derived from IPCC AR6 Table 9.9 and Figure 9.28. The global mean does not account
for geographic variability (e.g. gravitational fingerprints of ice melt).

### Global-Mean Fallback Values (meters above 1995–2014 baseline)

| Year | SSP1-2.6 50th | SSP2-4.5 50th | SSP3-7.0 50th | SSP5-8.5 50th |
|------|--------------|--------------|--------------|--------------|
| 2050 | 0.18 | 0.20 | 0.22 | 0.23 |
| 2100 | 0.38 | 0.56 | 0.68 | 0.77 |
| 2150 | 0.46 | 0.77 | 1.01 | 1.19 |

---

## Vertical Land Motion — ICE-6G_C (GIA)

| Attribute | Value |
|-----------|-------|
| **Source** | ICE-6G_C glacial isostatic adjustment model |
| **Coverage** | Global grid |
| **Local path** | `Backend/data/ice6g_vlm.json` |
| **Download script** | `Backend/download_vlm.py` |

Glacial Isostatic Adjustment (GIA) is the ongoing deformation of Earth's crust in response to
the redistribution of ice and water loads since the Last Glacial Maximum. Areas previously
under ice sheets (e.g. Scandinavia, Canada) are rising (reducing effective SLR); areas that
bore the ice's peripheral bulge (e.g. US East Coast) are sinking.

---

## Vertical Land Motion — MIDAS/NGL GPS

| Attribute | Value |
|-----------|-------|
| **Source** | MIDAS (Nevada Geodetic Laboratory, UNR) |
| **Data URL** | https://geodesy.unr.edu/velocities/midas.IGS14.txt |
| **Coverage** | Global GPS/GNSS stations |
| **Local path** | `Backend/data/midas_vlm.json` |
| **Download script** | `Backend/download_vlm.py` |

MIDAS provides GPS-observed total VLM velocities (in mm/yr) at tide-gauge and GNSS stations
worldwide. These include all sources of vertical motion: GIA, tectonics, sediment compaction,
and groundwater extraction. When a MIDAS station is within 0.5° of the query point, it takes
precedence over the ICE-6G_C model.

**How VLM is combined:**
```
effective_slr = ipcc_base_slr + vlm_offset
vlm_offset    = −vlm_rate_mm_yr / 1000 × (year − 2005)
```

Negative `vlm_rate_mm_yr` = land sinking (subsidence) = more flooding than the IPCC base value.

---

## Basemap and Labels — Esri

| Service | URL pattern | Attribution |
|---------|-------------|-------------|
| Esri World Imagery | `ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` | © Esri, Maxar, Earthstar Geographics |
| Esri Boundaries & Places | `ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}` | © Esri, HERE, Garmin, INCREMENT P |

These services are used under Esri's public tile service terms. Attribution is displayed in
the bottom-left of the map canvas.

---

## Mapping Library — MapLibre GL JS

MapLibre GL JS is an open-source fork of Mapbox GL JS maintained by the MapLibre community.
It renders the map canvas in WebGL, handles raster tile sources (basemap + flood overlay),
GeoJSON circle overlays (sampled flooded pixels), and map markers.

License: BSD 3-Clause

---

## Summary Attribution Table

| Dataset | Provider | License |
|---------|----------|---------|
| DiluviumDEM | Dusseau et al. | See project |
| WorldPop 2020 | WorldPop.org | CC BY 4.0 |
| IPCC AR6 Regional SLR | Garner et al., 2022 (Zenodo) | CC BY 4.0 |
| ICE-6G_C GIA | Peltier et al. | Academic use |
| MIDAS VLM | NGL, Univ. of Nevada | Public domain |
| Satellite imagery | Esri / Maxar | Esri tile service terms |
| Place labels | Esri / HERE | Esri tile service terms |
| Mapping library | MapLibre GL JS | BSD 3-Clause |
