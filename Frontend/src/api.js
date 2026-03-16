
// Prefer build-time base (Vite), else derive sensible default for dev
const API = (() => {
    let envBase = null;
    try {
        envBase = (import.meta && import.meta.env && import.meta.env.VITE_API_BASE) ? import.meta.env.VITE_API_BASE : null;
    } catch {}
    if (envBase) return envBase; // e.g., '/api' behind gateway
    try {
        const origin = window.location.origin;
        if (origin.includes(':5173')) return origin.replace(':5173', ':8000');
        // Fallback to relative '/api' to work when served behind a gateway
        return '/api';
    } catch {
        return '/api';
    }
})();

async function fetchWithMeta(url, options) {
    const start = performance.now();
    const timeoutMs = (options && options.timeoutMs) ? options.timeoutMs : 15000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Propagate an external abort signal (e.g. from the caller's AbortController)
    // so that user-initiated cancellations (map pan/zoom) actually stop the fetch.
    const externalSignal = options && options.signal;
    if (externalSignal) {
        if (externalSignal.aborted) {
            controller.abort();
        } else {
            externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
        }
    }

    const fetchOptions = { ...(options || {}), signal: controller.signal };
    delete fetchOptions.timeoutMs;  // timeoutMs is our custom option, not a valid fetch() init key
    const res = await fetch(url, fetchOptions).finally(() => clearTimeout(timer));
    const durationMs = performance.now() - start;
    const contentType = res.headers.get('content-type') || '';
    let data = null;
    if (contentType.includes('application/json')) {
        try { data = await res.json(); } catch { data = null; }
    } else {
        try { data = await res.text(); } catch { data = null; }
    }
    if (!res.ok) {
        const err = new Error(`Request failed (${res.status})`);
        err.status = res.status;
        err.durationMs = durationMs;
        err.body = data;
        throw err;
    }
    return { data, status: res.status, ok: res.ok, durationMs };
}

export async function analyzeRegion(bbox, params, options = {}) {
    const { lon_min, lat_min, lon_max, lat_max } = bbox;
    const { scenario, year, percentile } = params;
    const url = `${API}/analyze_region?lon_min=${lon_min}&lat_min=${lat_min}&lon_max=${lon_max}&lat_max=${lat_max}&scenario=${scenario}&year=${year}&pct=${percentile}`;
    const maxAttempts = 3;
    let attempt = 0;
    let lastError = null;
    while (attempt < maxAttempts) {
        try {
            return await fetchWithMeta(url, { method: 'GET', timeoutMs: 15000, signal: options.signal });
        } catch (e) {
            lastError = e;
            // Retry only for network errors or 5xx responses
            const status = e.status;
            // Don't retry aborts (user canceled)
            if (e.name === 'AbortError') throw e;
            const isNetworkError = !status || (typeof status !== 'number');
            const isServerError = status >= 500 && status <= 599;
            attempt++;
            if (!(isNetworkError || isServerError) || attempt >= maxAttempts) {
                throw e;
            }
            // Exponential backoff: 200ms, 400ms
            const delayMs = 200 * attempt;
            await new Promise(r => setTimeout(r, delayMs));
        }
    }
    throw lastError || new Error('Unknown fetch failure');
}

export async function fetchResolvedSlr(lat, lon, scenario, year, pct = 50) {
    const url = `${API}/resolve_slr?lat=${lat}&lon=${lon}&scenario=${scenario}&year=${year}&pct=${pct}`;
    return await fetchWithMeta(url, { method: 'GET', timeoutMs: 5000 });
}

export async function fetchProjectionInfo(lat, lon) {
    const url = lat != null && lon != null
        ? `${API}/projection_info?lat=${lat}&lon=${lon}`
        : `${API}/projection_info`;
    return await fetchWithMeta(url, { method: 'GET', timeoutMs: 5000 });
}
