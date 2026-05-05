# Flood & Sea Level Rise Visualization — Wiki Home

**Flood & Sea Level Rise Visualization** is an open, containerized geospatial web application for
exploring coastal inundation under multiple IPCC AR6 sea level rise scenarios. It renders
on-demand flood overlay tiles on a satellite basemap, lets you choose a climate scenario and
projection year, and reports the estimated number of people affected in the visible region.

> 📸 **Screenshot needed:** Landing page with disclaimer dialog, then the full interactive map
> with the sidebar, satellite imagery, and a blue flood overlay visible over Miami.

---

## Quick Links

| Topic | Page |
|-------|------|
| Install and run the app | [Getting Started](Getting-Started) |
| Use the interactive map | [User Guide](User-Guide) |
| Understand the system design | [Architecture](Architecture) |
| Explore the REST API | [API Reference](API-Reference) |
| Take a guided city tour | [Story Mode](Story-Mode) |
| Deploy to production | [Deployment](Deployment) |
| Tune environment variables | [Configuration](Configuration) |
| Learn about the data | [Data Sources](Data-Sources) |
| Fix a broken install | [Troubleshooting](Troubleshooting) |
| Set up a dev environment | [Development](Development) |

---

## Feature Highlights

### Scenario-Based Sea Level Rise

Choose from four IPCC AR6 Shared Socioeconomic Pathway (SSP) scenarios, select a projection
year from 2030 to 2150, and pick a confidence percentile (5th / 50th / 95th). The backend
resolves the effective SLR for the tile center using regional IPCC AR6 data when available,
falling back to embedded global-mean values.

> 📸 **Screenshot needed:** Sidebar showing the scenario dropdown on "SSP5-8.5 (Very High)",
> year slider at 2100, and the Effective SLR box displaying a value with VLM correction.

### Vertical Land Motion (VLM) Correction

Many coastal cities are sinking due to groundwater extraction, sediment compaction, or glacial
isostatic adjustment (GIA). The backend applies a per-location VLM offset sourced from:

- **MIDAS/NGL GPS velocities** — observed total VLM at tide-gauge stations
- **ICE-6G_C GIA model** — global baseline for areas without GPS coverage

### Population Impact Estimates

When you zoom into a region, the app cross-references flooded DEM pixels with WorldPop 2020
~1 km population rasters to estimate how many people live in the inundated area.

### Story Mode

Five curated city narratives — Miami, New Orleans, Tokyo, Tabasco (Mexico), and Bangladesh —
each pre-loaded with a recommended scenario and zoom level. Click **Start Story** to enter a
full-screen guided tour.

### Connectivity Modes

Three options control which below-threshold pixels are colored blue:

| Mode | Description |
|------|-------------|
| **Boundary** (default) | Only show flooding connected to the tile edge, filtering isolated inland basins |
| **None** | Color every pixel below the SLR threshold, regardless of connectivity |
| **3×3 Mosaic** | Expand the render area to a 3×3 tile neighborhood so flooding propagates across tile seams |

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, MapLibre GL JS |
| Backend | Python 3.11, FastAPI, Rasterio, NumPy, SciPy, Mercantile, Pillow |
| Caching | In-memory LRU (default) + optional Redis L2 |
| Reverse Proxy | Nginx (development / IP), Caddy (public HTTPS) |
| Orchestration | Docker Compose |
| Elevation Data | DiluviumDEM GeoTIFFs |
| Population Data | WorldPop 2020 GeoTIFFs |
| Projections | IPCC AR6 WG1 Regional SLR (Garner et al., 2022) |

---

## Repository Layout

```
Backend/   FastAPI service — tile rendering, analysis, projection & VLM lookups
Frontend/  React SPA — map UI, sidebar controls, story mode, landing page
Gateway/   Nginx reverse proxy configuration
deploy/    Production scripts, Caddyfile, environment templates
```

---

## License

No repository-wide open-source license is currently included. Treat the codebase as proprietary
unless a license is added. Third-party datasets remain subject to their own terms.
See [Data Sources](Data-Sources) for attribution details.
