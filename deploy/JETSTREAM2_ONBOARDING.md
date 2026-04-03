# Jetstream2 Deployment Onboarding

This guide is the fastest path to get this stack running on a fresh Jetstream2 Ubuntu instance, then expose it publicly over HTTPS.

## 1. Instance Bootstrap (one-time)

Run as a sudo-enabled user:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg git rsync

# Docker Engine + Compose plugin
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
newgrp docker
```

Optional firewall baseline:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

## 2. Clone Repo And Prepare Env

```bash
git clone https://github.com/ajprice16/flood-slr-visualization.git
cd flood-slr-visualization
cp deploy/.env.public.example deploy/.env.public
```

Edit `deploy/.env.public` and set your DNS hostname:

```dotenv
SITE_HOSTNAME=your-domain.example.org
GATEWAY_PORT_BIND=127.0.0.1:8080:8080
TRUSTED_HOSTS=localhost,127.0.0.1,gateway,caddy,your-domain.example.org
CORS_ALLOW_ORIGINS=https://your-domain.example.org
```

## 3. Transfer Data (after off-device copy is ready)

Expected directories:

- `Backend/dem/` for DEM GeoTIFFs
- `Backend/wp_2020/` for WorldPop GeoTIFFs
- `Backend/data/` for optional IPCC/VLM JSON assets

Example transfer from local machine:

```bash
rsync -avh --progress ./Backend/dem/ user@JETSTREAM_IP:/home/user/flood-slr-visualization/Backend/dem/
rsync -avh --progress ./Backend/wp_2020/ user@JETSTREAM_IP:/home/user/flood-slr-visualization/Backend/wp_2020/
rsync -avh --progress ./Backend/data/ user@JETSTREAM_IP:/home/user/flood-slr-visualization/Backend/data/
```

## 4. Start Stack

Development-style start (HTTP only):

```bash
./deploy/manage.sh dev-up
```

IP-only public start (no hostname/TLS certificate):

```bash
cp deploy/.env.ip.example deploy/.env.ip
# edit PUBLIC_IP in deploy/.env.ip
./deploy/manage.sh ip-up
```

For high-throughput use on larger instances, tune in `deploy/.env.ip`:

- `UVICORN_WORKERS` (start at 12 on 16 cores)
- `TILE_CACHE_SIZE` (start at 2048)
- `GDAL_CACHEMAX` MB (start at 2048)

Then restart:

```bash
./deploy/manage.sh restart
```

Public HTTPS start (recommended):

```bash
./deploy/manage.sh public-up
```

Caddy automatically provisions/renews certificates for `SITE_HOSTNAME` once DNS resolves to this instance.

## 5. Verify Service Health

```bash
./deploy/manage.sh health
curl -I https://your-domain.example.org/
curl -I https://your-domain.example.org/api/health
```

Useful live logs:

```bash
./deploy/manage.sh logs
```

## 6. Update Workflow

```bash
git pull
./deploy/manage.sh public-up
```

## 7. Public Hosting Checklist

- DNS `A`/`AAAA` record points to Jetstream2 public IP.
- Security group/firewall allows TCP 80 and 443.
- DEM and WorldPop files are present and readable.
- `/api/health` returns healthy.
- App map and story mode load via HTTPS URL.

## Notes

- `docker-compose.public.yml` keeps the internal gateway private and exposes only Caddy on 80/443.
- If you need rollback, checkout a previous commit and rerun `./deploy/manage.sh public-up`.
