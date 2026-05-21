# Launch Checklist (9-Day Sprint)

This checklist is tuned for a public science communication release with external mounted datasets.

## 1. Domain and TLS (Cloudflare + Caddy)

- DNS records proxied through Cloudflare (`orange cloud` enabled)
- SSL/TLS mode set to `Full (strict)`
- Always Use HTTPS enabled
- Automatic HTTPS Rewrites enabled
- HSTS enabled after validation:
  - `max-age >= 6 months`
  - include subdomains only if all subdomains are HTTPS-ready

## 2. Cloudflare Security Controls

- WAF managed rules enabled (default ruleset + OWASP)
- Bot Fight Mode enabled
- Rate limiting rules:
  - `/api/analyze_region*`: low rate, burst allowed
  - `/api/tiles/*`: higher rate with burst
  - global fallback on `/api/*`
- Challenge or block known abusive countries only if abuse is observed
- Cache bypass for non-idempotent paths (this app is GET-only API, but keep rule explicit)

## 3. Origin Protection

- Restrict origin firewall to Cloudflare IP ranges if infrastructure allows
- Ensure direct origin IP is not publicly advertised
- Keep container runtime non-privileged (already configured in compose)

## 4. App Security Headers

Validate headers on production responses:

- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`
- `Strict-Transport-Security` (HTTPS only)

Quick check:

```bash
curl -I https://YOUR_DOMAIN/
curl -I "https://YOUR_DOMAIN/api/health"
```

## 5. Data and Scientific Integrity

- Mounted data paths are available and readable:
  - `Backend/dem`
  - `Backend/wp_2020`
  - `Backend/data`
- Confirm these files exist:
  - `ipcc_ar6_slr.json`
  - `ice6g_vlm.json`
  - `midas_vlm.json`
- Verify attribution links render in the map footer
- Confirm disclaimer copy reflects intended scientific limitations

## 6. Performance and Capacity

- Warm key map areas by requesting representative tile URLs before announcement
- Confirm Redis is healthy and being used for tile cache hits
- Verify gateway cache (`X-Proxy-Cache`) shows HITs under repeat traffic
- Smoke test with 10-20 concurrent users (or synthetic requests)
- Conference scenario check: validate behavior when many users share one public IP (NAT)

## 7. Monitoring and Incident Response

- Enable Cloudflare analytics and alerts for spikes in:
  - request volume
  - 4xx/5xx rate
  - bot traffic
- Ensure backend logs are persisted and rotated
- Define rollback command and owner:
  - previous known-good compose image tag
  - who executes rollback
  - where status updates are posted

## 8. Accessibility and UX Quick Wins

- Keyboard navigation works for sidebar controls and story navigation
- Color contrast validated for critical UI text
- Mobile viewport check:
  - landing disclaimer
  - story panel open/close
  - map controls usable without overlap

## 9. Final Go/No-Go (24h Before Announcement)

- `/api/health` returns 200 through public domain
- Story mode content loads for all configured cities
- `resolve_slr` and `analyze_region` return expected payload shape
- No blocking console errors on homepage and map interaction
- One teammate dry-runs the site from a fresh device/browser
