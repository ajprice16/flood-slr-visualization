# Getting Started

This page walks you through the minimum steps to run the application locally using Docker.
For production deployment, see [Deployment](Deployment). For a code-level dev environment,
see [Development](Development).

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Docker Engine ≥ 24 + Compose plugin | `docker compose version` must succeed |
| ~50 GB free disk | For DEM tiles; actual size depends on geographic coverage |
| Internet access at startup | Needed to load the Esri satellite basemap and labels |

---

## 1. Clone the Repository

```bash
git clone https://github.com/ajprice16/flood-slr-visualization.git
cd flood-slr-visualization
```

---

## 2. Supply Elevation Data

The application requires DEM (Digital Elevation Model) GeoTIFF files. These are **not
included** in the repository because of their size.

### Tile naming format

```
DiluviumDEM_N34_00_E118_00.tif
```

The pattern encodes the SW corner of each 1°×1° tile:

| Component | Meaning |
|-----------|---------|
| `N` / `S` | Northern / Southern hemisphere |
| `34` | Degrees of latitude |
| `00` | Minutes (always `00` for whole-degree tiles) |
| `E` / `W` | Eastern / Western hemisphere |
| `118` | Degrees of longitude |

Place all `.tif` files in `Backend/dem/`:

```bash
mkdir -p Backend/dem
# copy your DiluviumDEM tiles here
```

The backend builds a spatial index at startup and will log how many tiles it found:

```
Built spatial index with 842 tiles, 842 grid cells
```

If the index shows 0 tiles, no flood overlay will render — see [Troubleshooting](Troubleshooting).

---

## 3. (Optional) Population Data

For population impact estimates, place WorldPop 2020 GeoTIFFs in `Backend/wp_2020/`:

```bash
mkdir -p Backend/wp_2020
# copy worldpop *.tif files here
```

The helper script can download country files automatically:

```bash
cd Backend
python download_worldpop.py
```

Without population data the app still works; the "Estimated Population Affected" field will
show `0`.

---

## 4. (Optional) IPCC Projection and VLM Data

Without these files the backend uses embedded global-mean SLR values from IPCC AR6 Table 9.9.
Regional data produces more accurate, location-specific projections.

Download scripts:

```bash
cd Backend
python download_ipcc_ar6.py   # writes Backend/data/ipcc_ar6_slr.json
python download_vlm.py        # writes Backend/data/ice6g_vlm.json and midas_vlm.json
```

---

## 5. Start the Stack

```bash
docker compose up -d
```

This builds and starts four services:

| Service | Role | Internal port |
|---------|------|--------------|
| `backend` | FastAPI tile server | 8000 |
| `redis` | L2 tile cache | 6379 |
| `frontend` | React SPA (Nginx) | 8080 |
| `gateway` | Reverse proxy | 8080 → host 80 |

Open **http://localhost** in your browser.

> 📸 **Screenshot needed:** Browser showing the landing page disclaimer at http://localhost.

---

## 6. Accept the Disclaimer

The landing page requires you to check the disclaimer box before proceeding to the map.

> 📸 **Screenshot needed:** Landing page with the checkbox ticked and the "Proceed to
> Interactive Map" button lit up (purple gradient).

---

## 7. Verify the Backend is Healthy

```bash
curl http://localhost/api/health
# {"status":"ok","tiles_indexed":842}
```

If `tiles_indexed` is 0, re-check that your DEM files are in `Backend/dem/` and match the
naming format above.

---

## Data Download Helper Scripts Summary

| Script | Output | What it downloads |
|--------|--------|-------------------|
| `Backend/download_ipcc_ar6.py` | `Backend/data/ipcc_ar6_slr.json` | IPCC AR6 regional SLR (Garner et al., 2022, Zenodo) |
| `Backend/download_vlm.py` | `Backend/data/ice6g_vlm.json`, `midas_vlm.json` | ICE-6G_C GIA + MIDAS GPS VLM |
| `Backend/download_worldpop.py` | `Backend/wp_2020/*.tif` | WorldPop 2020 country rasters |

---

## Next Steps

- Explore controls → [User Guide](User-Guide)
- Take a guided city tour → [Story Mode](Story-Mode)
- Deploy to a public server → [Deployment](Deployment)
