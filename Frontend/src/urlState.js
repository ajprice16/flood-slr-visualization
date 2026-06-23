// Permalink (shareable URL) state encoding.
// Keeps map + control state in the query string so a view can be linked/QR'd.

const SCENARIOS = ["ssp126", "ssp245", "ssp370", "ssp585"];
const CONNECTIVITY = ["boundary", "none", "full"];
const WATER_MASK = ["none", "raster"];
const PERCENTILES = [5, 50, 95];

const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
};

// Parse the query string into validated state. Any missing/invalid field is
// returned as null so callers can fall back to their own defaults.
export function parseUrlState(search = window.location.search) {
    const q = new URLSearchParams(search);

    const scenario = SCENARIOS.includes(q.get("s")) ? q.get("s") : null;

    let year = parseInt(q.get("y"), 10);
    year = Number.isFinite(year) ? Math.min(2150, Math.max(2030, Math.round(year / 10) * 10)) : null;

    const pctRaw = parseInt(q.get("p"), 10);
    const percentile = PERCENTILES.includes(pctRaw) ? pctRaw : null;

    const connectivity = CONNECTIVITY.includes(q.get("c")) ? q.get("c") : null;
    const waterMask = WATER_MASK.includes(q.get("w")) ? q.get("w") : null;

    const lat = num(q.get("lat"));
    const lon = num(q.get("lon"));
    const zoom = num(q.get("z"));
    const view = (lat != null && lon != null && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)
        ? { center: [lon, lat], zoom: zoom != null ? zoom : 9 }
        : null;

    return { scenario, year, percentile, connectivity, waterMask, view };
}

// Build an absolute shareable URL from the current state.
export function buildShareUrl(state) {
    const { scenario, year, percentile, connectivity, waterMask, center, zoom } = state;
    const q = new URLSearchParams();
    q.set("s", scenario);
    q.set("y", String(year));
    q.set("p", String(percentile));
    q.set("c", connectivity);
    q.set("w", waterMask);
    if (center) {
        q.set("lat", center[1].toFixed(4));
        q.set("lon", center[0].toFixed(4));
    }
    if (zoom != null) q.set("z", zoom.toFixed(2));
    const base = window.location.origin + window.location.pathname;
    return `${base}?${q.toString()}`;
}
