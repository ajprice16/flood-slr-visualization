import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE = 'http://localhost:8080';

const errorRate   = new Rate('errors');
const cacheMisses = new Rate('cache_miss');
const tileLatency = new Trend('tile_latency_ms', true);
const apiLatency  = new Trend('api_latency_ms', true);

// Diverse coastal tile coords (z/x/y) — spread across zoom 8-11 to test
// both cold-cache renders and warm-cache hits under conference load.
const TILES = [
  // Miami / South Florida
  '10/291/436', '10/291/437', '10/292/436', '10/292/437',
  '9/146/218',  '9/145/218',
  '8/73/109',
  '11/583/873', '11/582/873',
  // New Orleans / Mississippi delta
  '10/287/426', '10/287/427', '10/286/427',
  '9/143/213',
  // Houston / Galveston Bay
  '10/289/430', '10/289/431', '10/290/431',
  '9/144/215',
  // NYC / NJ coast
  '10/301/384', '10/302/384', '10/301/385',
  '9/150/192',
  // Charleston SC
  '10/298/408', '10/299/408',
  // Tampa Bay
  '10/290/435', '10/291/435',
  // Norfolk VA
  '10/300/393', '10/301/393',
  // Bangladesh coast
  '10/753/423', '10/754/423',
  // Netherlands
  '10/527/337', '10/528/337',
];

// SLR scenarios — vary scenario + percentile to force more unique cache keys.
const SCENARIOS = [
  { scenario: 'ssp245', year: 2050, pct: 50,  slr: 0.18 },
  { scenario: 'ssp245', year: 2100, pct: 50,  slr: 0.44 },
  { scenario: 'ssp585', year: 2050, pct: 50,  slr: 0.23 },
  { scenario: 'ssp585', year: 2100, pct: 50,  slr: 0.77 },
  { scenario: 'ssp585', year: 2100, pct: 95,  slr: 1.10 },
  { scenario: 'ssp585', year: 2100, pct: 17,  slr: 0.55 },
];

function randItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const options = {
  scenarios: {
    // Phase 1 — warm up: 10 VUs, 30 s. Hits cold cache, builds Redis/nginx entries.
    warmup: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
      tags: { phase: 'warmup' },
    },
    // Phase 2 — conference load: 50 VUs, 90 s (starts after warmup).
    // Simulates a room of people panning/zooming simultaneously.
    conference: {
      executor: 'constant-vus',
      vus: 50,
      duration: '90s',
      startTime: '30s',
      tags: { phase: 'conference' },
    },
    // Phase 3 — stress ramp: push to 200 VUs to find the wall.
    stress: {
      executor: 'ramping-vus',
      startVUs: 50,
      stages: [
        { duration: '30s', target: 100 },
        { duration: '30s', target: 150 },
        { duration: '30s', target: 200 },
        { duration: '30s', target: 50  },
      ],
      startTime: '120s',
      tags: { phase: 'stress' },
    },
    // Separate scenario: analysis endpoint (expensive, rate-limited).
    analysis: {
      executor: 'constant-vus',
      vus: 3,
      duration: '210s',
      tags: { phase: 'analysis' },
    },
  },
  thresholds: {
    // Conference phase should stay under 2 s p95.
    'tile_latency_ms{phase:conference}': ['p(95)<2000'],
    // Error rate across all phases should stay under 5 %.
    errors: ['rate<0.05'],
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  const sc   = randItem(SCENARIOS);
  const tile = randItem(TILES);
  const phase = __ENV.PHASE || 'unknown';

  // --- Tile request ---
  const tileUrl = `${BASE}/api/tiles/${tile}?slr=${sc.slr}&connectivity=boundary`;
  const tr = http.get(tileUrl, { tags: { endpoint: 'tile' } });

  tileLatency.add(tr.timings.duration);
  errorRate.add(tr.status !== 200);

  const cacheHeader = tr.headers['X-Proxy-Cache'] || '';
  cacheMisses.add(cacheHeader === 'MISS' || cacheHeader === '');

  check(tr, {
    'tile 200':     (r) => r.status === 200,
    'tile is PNG':  (r) => r.headers['Content-Type'] === 'image/png',
  });

  sleep(Math.random() * 0.4 + 0.1); // 100-500 ms think time between tile requests

  // --- Analysis request (1-in-5 chance, keeps ratio realistic) ---
  if (Math.random() < 0.2) {
    // Small bbox around the tile coords center
    const coords = tile.split('/');
    const apiUrl = `${BASE}/api/analyze_region?slr=${sc.slr}&zoom=${coords[0]}&x=${coords[1]}&y=${coords[2]}`;
    const ar = http.get(apiUrl, { tags: { endpoint: 'analysis' } });

    apiLatency.add(ar.timings.duration);
    errorRate.add(ar.status !== 200 && ar.status !== 429);

    check(ar, { 'analyze 200 or 429': (r) => r.status === 200 || r.status === 429 });
    sleep(Math.random() * 1.0 + 0.5);
  }
}

export function analysisScenario() {
  // Dedicated VUs hitting analysis only, expecting rate-limiting at 12 r/s per IP.
  const sc   = randItem(SCENARIOS);
  const tile = randItem(TILES);
  const coords = tile.split('/');
  const url = `${BASE}/api/analyze_region?slr=${sc.slr}&zoom=${coords[0]}&x=${coords[1]}&y=${coords[2]}`;

  const r = http.get(url, { tags: { endpoint: 'analysis_dedicated' } });
  apiLatency.add(r.timings.duration);
  check(r, { 'analyze ok or rate-limited': (r) => r.status === 200 || r.status === 429 });
  sleep(Math.random() * 2 + 1);
}
