# Configuration

All runtime configuration is via environment variables. In Docker Compose the variables are
set in `docker-compose.yml` (with defaults) and overridden by `.env` files in `deploy/`.

---

## Backend Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TILE_CACHE_SIZE` | `2048` (Compose) / `512` (bare) | LRU in-memory tile cache max entries. Increase for higher hit rates on repeated views. |
| `UVICORN_WORKERS` | `10` | Number of uvicorn worker processes. A good starting point is `(CPU cores) × 0.75`. |
| `UVICORN_KEEPALIVE` | `15` | HTTP keep-alive timeout in seconds. |
| `GDAL_CACHEMAX` | `2048` | GDAL block cache in MB. Increase for large DEM tiles to reduce re-reads. |
| `GDAL_NUM_THREADS` | `1` | GDAL internal threads per operation. Keep at 1 when running many uvicorn workers. |
| `OMP_NUM_THREADS` | `1` | OpenMP threads for NumPy/SciPy. Keep at 1 when running many uvicorn workers. |
| `TRUSTED_HOSTS` | `localhost,127.0.0.1,gateway,caddy` | Comma-separated host list passed to TrustedHost middleware. The app currently appends `*` at runtime to avoid proxy host-header false negatives. |
| `CORS_ALLOW_ORIGINS` | `http://localhost,http://127.0.0.1` | Comma-separated CORS origins. Add `https://your-domain.example.org` for production. |
| `REDIS_URL` | `redis://redis:6379/0` | Redis URL for L2 tile cache. Leave unset to disable Redis and use only L1 LRU. |
| `DEM_BUCKET` | _(empty)_ | DigitalOcean Spaces bucket name for remote DEM storage. Leave empty to use `Backend/dem/`. |
| `WORLDPOP_BUCKET` | _(falls back to DEM_BUCKET)_ | Spaces bucket for WorldPop tiles. Defaults to `DEM_BUCKET` if unset. |
| `SPACES_ENDPOINT_URL` | `https://nyc3.digitaloceanspaces.com` | DigitalOcean Spaces endpoint. |
| `SPACES_ACCESS_KEY` | _(empty)_ | Spaces S3-compatible access key. |
| `SPACES_SECRET_KEY` | _(empty)_ | Spaces S3-compatible secret key. |
| `SPACES_REGION` | `nyc3` | Spaces region name. |
| `WATER_MASK_RASTER` | _(empty)_ | Optional raster path used when frontend requests `water_mask=raster`. |
| `DEBUG_MODE` | _(unset)_ | Set to `true` to enable the `/api/debug/tiles_in_bbox` endpoint. |

---

## Frontend Environment Variables

Set at **build time** in `Frontend/.env` or passed via `VITE_*` args in the Dockerfile.

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE` | `/api` | Base path for API requests. In gateway mode this is `/api`. In bare local dev with Vite on :5173, the frontend auto-detects uvicorn on :8000. |

---

## Gateway Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GATEWAY_PORT_BIND` | `80:8080` | Docker port mapping for the gateway container. Use `127.0.0.1:8080:8080` in public-HTTPS mode (Caddy handles the external port). |

## Public Edge (Caddy) Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CF_API_TOKEN` | _(required for public-up)_ | Cloudflare API token used by Caddy for DNS-01 ACME certificate issuance. |

---

## Tuning Recommendations

### Small instance (2–4 cores, 8 GB RAM)

```dotenv
TILE_CACHE_SIZE=512
UVICORN_WORKERS=3
GDAL_CACHEMAX=512
```

### Medium instance (8–16 cores, 32 GB RAM)

```dotenv
TILE_CACHE_SIZE=2048
UVICORN_WORKERS=10
GDAL_CACHEMAX=2048
```

### Large instance (32+ cores, 64+ GB RAM)

```dotenv
TILE_CACHE_SIZE=8192
UVICORN_WORKERS=24
GDAL_CACHEMAX=4096
```

> **Tip:** Each uvicorn worker holds its own L1 LRU cache. To maximize cache reuse across
> workers, enable Redis (`REDIS_URL`) so all workers share an L2 cache.

---

## Session Tracking

The backend tracks active users (unique IPs in the last 5 minutes) for the `/api/stats`
endpoint. Two implementations:

- **Redis** (preferred when `REDIS_URL` is set): each IP sets a key with 300 s TTL.
- **File fallback** (when Redis is unavailable): appends `{ip} {timestamp}` to
  `Backend/tile_cache/.sessions`. The file is compacted automatically when it exceeds 20 000 lines.

Paths matching `/health`, `/stats`, or `/cities` are excluded from session counting.

---

## .env File Templates

| Template | Destination | Purpose |
|----------|-------------|---------|
| `deploy/.env.public.example` | `deploy/.env.public` | Public HTTPS deployment variables |
| `deploy/.env.ip.example` | `deploy/.env.ip` | IP-only public deployment |

Copy the example file and edit before running `./deploy/manage.sh`.
