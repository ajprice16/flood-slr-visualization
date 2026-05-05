# Deployment

This page covers production deployment on Jetstream2 (or any Ubuntu VPS). For local
development, see [Development](Development).

---

## Overview

Three deployment modes are available via `./deploy/manage.sh`:

| Mode | Command | Use case |
|------|---------|----------|
| Dev / local | `dev-up` | HTTP on port 80, no TLS |
| IP-only public | `ip-up` | Public access via IP, no hostname or TLS |
| Public HTTPS | `public-up` | Caddy + automatic TLS (recommended) |

All modes use Docker Compose. The `public-up` mode adds a Caddy reverse proxy in front of
the gateway, handling TLS termination and certificate issuance via ACME.

---

## 1. Bootstrap the Server

Run on a fresh Ubuntu instance as a sudo-enabled user:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg git rsync

# Install Docker Engine + Compose plugin
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
newgrp docker
```

Optional firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

---

## 2. Clone and Configure

```bash
git clone https://github.com/ajprice16/flood-slr-visualization.git
cd flood-slr-visualization
cp deploy/.env.public.example deploy/.env.public
```

Edit `deploy/.env.public`:

```dotenv
GATEWAY_PORT_BIND=127.0.0.1:8080:8080
TRUSTED_HOSTS=localhost,127.0.0.1,gateway,caddy,your-domain.example.org
CORS_ALLOW_ORIGINS=https://your-domain.example.org
```

---

## 3. Transfer Data

Copy your DEM, WorldPop, and optional projection/VLM data to the server:

```bash
# From your local machine:
rsync -avh --progress ./Backend/dem/    user@SERVER:/home/user/flood-slr-visualization/Backend/dem/
rsync -avh --progress ./Backend/wp_2020/ user@SERVER:/home/user/flood-slr-visualization/Backend/wp_2020/
rsync -avh --progress ./Backend/data/   user@SERVER:/home/user/flood-slr-visualization/Backend/data/
```

---

## 4. Start the Stack

### Development / HTTP only

```bash
./deploy/manage.sh dev-up
```

Binds the gateway on `0.0.0.0:80` (unencrypted).

### IP-only Public

```bash
cp deploy/.env.ip.example deploy/.env.ip
# edit PUBLIC_IP in deploy/.env.ip
./deploy/manage.sh ip-up
```

### Public HTTPS (recommended)

Requires DNS `A`/`AAAA` records pointing to this server's IP before Caddy can
obtain certificates.

```bash
./deploy/manage.sh public-up
```

Caddy provisions and renews TLS certificates via HTTP-01 ACME challenge automatically.

---

## 5. Cloudflare Proxy (optional)

If you proxy traffic through Cloudflare (orange cloud), HTTP-01 ACME fails because
Cloudflare intercepts port 80. Use DNS-01 instead:

1. Create a Cloudflare API token with `Zone.Zone: Read` and `Zone.DNS: Edit` permissions.
2. Add to `deploy/.env.public`:
   ```dotenv
   CF_API_TOKEN=your-cloudflare-api-token
   ```
3. Enable the orange cloud in Cloudflare DNS for your `A` records.
4. Restart: `./deploy/manage.sh public-up`

Caddy uses the token for DNS-01 ACME challenges while Cloudflare proxies traffic.

---

## 6. Verify

```bash
./deploy/manage.sh health
curl -I https://your-domain.example.org/api/health
```

Expected:

```
HTTP/2 200
{"status":"ok","tiles_indexed":842}
```

Live logs:

```bash
./deploy/manage.sh logs
```

---

## 7. Update Workflow

```bash
git pull
./deploy/manage.sh public-up   # rebuilds changed images, restarts services
```

---

## Docker Compose Resource Limits

The production `docker-compose.yml` sets conservative defaults that can be tuned via
environment variables. See [Configuration](Configuration) for details.

| Service | CPU limit | Memory limit |
|---------|-----------|-------------|
| `backend` | 12 cores | 48 GB |
| `redis` | 1 core | 3 GB |
| `frontend` | 1 core | 256 MB |
| `gateway` | 2 cores | 512 MB |

Adjust these in `docker-compose.yml` to match your instance size.

---

## Public Hosting Checklist

- [ ] DNS `A`/`AAAA` records point to the server's public IP
- [ ] Security group / firewall allows TCP 80 and 443
- [ ] DEM GeoTIFFs are in `Backend/dem/` and match the naming format
- [ ] `./deploy/manage.sh health` reports `tiles_indexed > 0`
- [ ] `/api/health` returns 200 via HTTPS
- [ ] The map loads and shows satellite imagery
- [ ] Changing the year slider updates the flood overlay

---

## DigitalOcean Spaces (Remote DEM Storage)

For very large tile sets, DEM and WorldPop rasters can be served directly from a
DigitalOcean Spaces bucket via GDAL's `/vsis3/` virtual filesystem. Set these environment
variables (see [Configuration](Configuration)):

```dotenv
DEM_BUCKET=your-spaces-bucket-name
SPACES_ENDPOINT_URL=https://nyc3.digitaloceanspaces.com
SPACES_ACCESS_KEY=...
SPACES_SECRET_KEY=...
SPACES_REGION=nyc3
```

Place DEM tiles under a `dem/` prefix in the bucket and WorldPop tiles under `worldpop/`.
The backend lists and streams files directly over GDAL virtual filesystem without local copies.

---

## Rollback

Check out a previous commit and restart:

```bash
git log --oneline -10
git checkout <commit-hash>
./deploy/manage.sh public-up
```
