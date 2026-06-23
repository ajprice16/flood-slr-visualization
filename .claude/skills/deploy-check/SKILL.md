---
name: deploy-check
description: Check health of the flood-SLR app across local, oursealevel.org, and sea-level-rise.org. Run when the user wants to verify the stack is up, after a deploy, or when investigating a production issue.
---

Run the following checks and present a clean status table. Do not skip steps.

## 1. Docker container status
```bash
docker compose -f /home/exouser/Documents/ProjWeb/flood-slr-visualization/docker-compose.yml ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "(Docker not running or not local)"
```

## 2. Local health
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost/api/health 2>/dev/null || echo "unreachable"
```

## 3. Production A — oursealevel.org
```bash
curl -sv https://oursealevel.org/api/health 2>&1 | grep -E "^[<>*]|HTTP/|x-cache|server:"
```

## 4. Production B — sea-level-rise.org
```bash
curl -sv https://sea-level-rise.org/api/health 2>&1 | grep -E "^[<>*]|HTTP/|x-cache|server:"
```

## 5. Tile spot-check (production)
```bash
curl -sI "https://sea-level-rise.org/api/tiles/10/163/395?slr=1.0" | grep -E "HTTP/|content-type|content-length|x-cache|x-render"
```

## 6. Output format

Present as a markdown table:

| Environment | Status | Notes |
|-------------|--------|-------|
| Local (Docker) | ✅ 200 / ❌ down | container names + uptime |
| oursealevel.org | ✅ 200 / ❌ ... | TLS, response time |
| sea-level-rise.org | ✅ 200 / ❌ ... | TLS, response time |
| Tile spot-check | ✅ 200 PNG / ❌ ... | cache hit, content-length |

Flag anything not 200/healthy. If a production endpoint is down, suggest: check Caddy logs (`docker logs slr-caddy`), check backend logs (`docker logs slr-backend`), or re-run `./deploy/manage.sh public-up`.
