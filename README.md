# Flood & Sea Level Rise Visualization

**An interactive map of how high the sea may rise — and who lives in the way.**

🌐 **Live demo:** <https://oursealevel.org> · <https://sea-level-rise.org>
📚 **Full documentation:** [Project Wiki](https://github.com/ajprice16/flood-slr-visualization/wiki)

![Interactive map with Miami flood overlay](docs/images/home-hero.png)

---

## What this is

This is a web tool for exploring **coastal inundation under future sea level rise**. Pick a
climate scenario, a year, and a confidence level, and the map shows which coastlines disappear
under water — along with an estimate of how many people live there today.

It is built on published science:

- **Sea level projections** come from the [IPCC AR6 WG1 Regional Sea-Level dataset](https://doi.org/10.5281/zenodo.6382554)
  (Garner et al., 2022) — the same data used by the IPCC's *Sixth Assessment Report*.
- **Land elevation** comes from **DiluviumDEM**, a coastal-optimized digital elevation model
  built specifically to correct the well-known overestimates of SRTM in low-lying coastal areas.
- **Vertical land motion** (subsidence and uplift) is applied per location using **MIDAS GPS
  velocities** and the **ICE-6G_C glacial isostatic adjustment model** — so a sinking delta
  city like Tokyo Bay or Jakarta gets a different effective sea level than a rebounding
  coastline in Scandinavia.
- **Population exposure** is computed from **WorldPop 2020** ~1 km gridded population.

Everything is rendered on the fly: every flood pixel you see is computed from the underlying
elevation grid the moment you change a control, with no pre-rendered scenarios.

---

## For visitors from JpGU 2026

Welcome — this is the live tool behind the talk. Three places to start:

1. **Try the demo** at <https://oursealevel.org>. Click *Start Story* (top right) for a
   guided tour through Miami, New Orleans, Tokyo, Tabasco (Mexico), and the Bengal delta.
2. **Read the methodology** → [Data Sources](https://github.com/ajprice16/flood-slr-visualization/wiki/Data-Sources)
   for full provenance, citations, and how IPCC + VLM are combined.
3. **Cite or reuse** — the source code is in this repository; the underlying datasets keep
   their original licenses (see [Data Sources](https://github.com/ajprice16/flood-slr-visualization/wiki/Data-Sources)).

---

## How to read the map

| You see | What it means |
|---------|----------------|
| Blue translucent overlay | Land below the *effective* sea level for the chosen scenario/year/percentile, after VLM correction. |
| The **Effective SLR** sidebar box | The exact water level used at the current map center, broken into IPCC base + VLM offset. |
| **Tiles / Flood Ratio / Elevation Range** | Diagnostics for the current viewport — how much of the visible land sits below the threshold. |
| **Est. Population Affected** | Sum of WorldPop 2020 population in the inundated pixels visible on screen. |
| Red pins | The five Story Mode locations. Click one to read its narrative. |

**Important caveat:** the overlay is a **bathtub-style inundation model with connectivity
filtering**, not a hydrodynamic flood simulation. It does not model storm surge, wave action,
tides, levees, drainage, or pumping infrastructure. See [Data Sources](https://github.com/ajprice16/flood-slr-visualization/wiki/Data-Sources)
for the full discussion.

---

## Scenarios on offer

| SSP scenario | Storyline | Approximate 2100 warming |
|--------------|-----------|--------------------------|
| **SSP1-2.6** | Strong mitigation, sustainable development | ~1.8 °C |
| **SSP2-4.5** | Middle of the road, current-policy trajectory | ~2.7 °C |
| **SSP3-7.0** | Regional rivalry, fragmented action | ~3.6 °C |
| **SSP5-8.5** | Fossil-fueled growth, very high emissions | ~4.4 °C |

Each scenario provides 5th / 50th / 95th percentile sea level estimates from 2030 to 2150.

---

## Running it yourself

The fastest path is Docker. From the repo root:

```bash
docker compose up -d
```

…then open <http://localhost>. Detailed setup, including how to obtain the DEM and WorldPop
data (which are not committed to the repository), is in
[Getting Started](https://github.com/ajprice16/flood-slr-visualization/wiki/Getting-Started).

If you want to develop or extend the app rather than just run it, see
[Development](https://github.com/ajprice16/flood-slr-visualization/wiki/Development).

---

## Documentation map

| Page | For |
|------|-----|
| [Home](https://github.com/ajprice16/flood-slr-visualization/wiki) | Overview and feature tour |
| [User Guide](https://github.com/ajprice16/flood-slr-visualization/wiki/User-Guide) | Every control in the map, explained |
| [Story Mode](https://github.com/ajprice16/flood-slr-visualization/wiki/Story-Mode) | The five city narratives |
| [Data Sources](https://github.com/ajprice16/flood-slr-visualization/wiki/Data-Sources) | Datasets, licenses, citations, methodology |
| [Architecture](https://github.com/ajprice16/flood-slr-visualization/wiki/Architecture) | System design and request flow |
| [API Reference](https://github.com/ajprice16/flood-slr-visualization/wiki/API-Reference) | REST endpoints |
| [Getting Started](https://github.com/ajprice16/flood-slr-visualization/wiki/Getting-Started) | Run it locally with Docker |
| [Development](https://github.com/ajprice16/flood-slr-visualization/wiki/Development) | Dev workflow, tests, hot reload |
| [Deployment](https://github.com/ajprice16/flood-slr-visualization/wiki/Deployment) | Production with Caddy + HTTPS |
| [Configuration](https://github.com/ajprice16/flood-slr-visualization/wiki/Configuration) | Environment variables |
| [Troubleshooting](https://github.com/ajprice16/flood-slr-visualization/wiki/Troubleshooting) | Common issues |

---

## Architecture at a glance

Three Docker services orchestrated by Compose:

- **Frontend** — React 18 + Vite + MapLibre GL JS (the map you see in the browser)
- **Backend** — Python 3.11 + FastAPI + Rasterio (renders flood tiles on demand)
- **Gateway** — Nginx routing `/api/*` to the backend and everything else to the frontend
- *(Optional)* Redis for shared tile caching, Caddy for public HTTPS

The backend keeps a spatial index of every DEM tile in memory. When the browser requests a
256×256 flood tile, the backend resolves the effective sea level for that location, reads the
intersecting elevation pixels with windowed `rasterio` calls, applies the SLR threshold plus
connectivity filtering, and returns a translucent PNG.

Full diagram and request flow: [Architecture](https://github.com/ajprice16/flood-slr-visualization/wiki/Architecture).

---

## Data and credits

| Dataset | Source | License |
|---------|--------|---------|
| Sea level projections | IPCC AR6 WG1 Regional SLR — Garner et al., 2022 ([Zenodo](https://doi.org/10.5281/zenodo.6382554)) | CC BY 4.0 |
| Elevation (DEM) | DiluviumDEM (Dusseau et al.) | See project |
| Population | [WorldPop](https://www.worldpop.org) 2020 | CC BY 4.0 |
| GPS-observed VLM | [MIDAS](https://geodesy.unr.edu/) (Nevada Geodetic Laboratory, UNR) | Public domain |
| GIA model | ICE-6G_C (Peltier et al.) | Academic use |
| Satellite imagery | Esri World Imagery | Esri tile service terms |
| Map rendering | [MapLibre GL JS](https://maplibre.org/) | BSD-3-Clause |

Full citations and methodology notes: [Data Sources](https://github.com/ajprice16/flood-slr-visualization/wiki/Data-Sources).

---

## License

The dataset and basemap providers retain their own licenses (listed above). The source code
in this repository is currently unlicensed — treat it as proprietary unless a license file is
added. If you would like to use, fork, or extend the code, please open an issue.

---

## Contact

- GitHub: <https://github.com/ajprice16/flood-slr-visualization>
- Live demo: <https://oursealevel.org> · <https://sea-level-rise.org>
