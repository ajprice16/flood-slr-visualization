# Flood & Sea Level Rise Visualization

Interactive web application for visualizing sea level rise impacts and flood analysis with population estimates.

## Features

- **Interactive Map**: MapLibre GL-powered interface with satellite imagery
- **Real-time Flood Analysis**: FastAPI backend with DEM tile processing
- **Population Estimates**: WorldPop integration for affected population calculations
- **Story Mode**: StoryMapJS-style narrative tours of vulnerable cities
- **City Markers**: Clickable locations with detailed write-ups

## Tech Stack

- **Backend**: Python 3.11, FastAPI, rasterio, mercantile, GDAL
- **Frontend**: React, Vite, MapLibre GL JS
- **Infrastructure**: Docker Compose with Nginx reverse proxy
- **Data**: DEM tiles (DiluviumDEM), WorldPop GeoTIFFs

## Quick Start

### Prerequisites
- Docker & Docker Compose
- DEM tiles in `tiles_*/` directories
- WorldPop data in `wp_2020/` directory (*.tif files)

### Running with Docker

```bash
docker compose up -d
```

Access at `http://localhost`

### Services

- **Gateway** (port 80): Nginx reverse proxy
- **Backend** (internal:8000): FastAPI API server
- **Frontend** (internal:80): React SPA served by Nginx

## API Endpoints

- `GET /tiles/{z}/{x}/{y}?slr={meters}` - DEM tiles with flood overlay
- `POST /analyze_region` - Flood analysis for bounding box
- `GET /health` - Service health check

## Story Mode

Click "Start Story" to tour vulnerable cities:
1. Miami - Low elevation, porous limestone
2. New Orleans - Below sea level
3. Tabasco, Mexico - River flooding + sea level rise
4. Tokyo - Dense coastal population

Edit narratives in `Frontend/public/cities/*.txt`

## Development

### Backend
```bash
cd Backend
pip install -r Requirements.txt
uvicorn main:app --reload
```

### Frontend
```bash
cd Frontend
npm install
npm run dev
```

## Data Sources

- **DEM**: [DiluviumDEM](https://github.com/ddusseau/DiluviumDEM) (Dusseau et al.)
- **Population**: [WorldPop](https://www.worldpop.org)
- **Basemap**: Esri World Imagery
- **Labels**: Esri Boundaries & Places

## Configuration

### Environment Variables
- `VITE_API_BASE` - Frontend API endpoint (default: `/api`)

### Docker Network
Uses user-defined bridge network `slr-net` for inter-container DNS.

## Git Setup

**Note**: Large `.tif` files are excluded via `.gitignore`. Store data separately.

### First Push
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/ajprice16/flood-slr-visualization.git
git branch -M main
git push -u origin main
```

## License

Data sources have their own licenses - see individual provider sites.

## Credits

- DEM Data: DiluviumDEM
- Population: WorldPop
- Mapping: MapLibre GL JS
- Imagery: Esri, Maxar, Earthstar Geographics
