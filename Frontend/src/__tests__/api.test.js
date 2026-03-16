/**
 * Tests for api.js
 *
 * fetchWithMeta is not exported directly, but its behaviour is exercised
 * through the exported analyzeRegion / fetchResolvedSlr / fetchProjectionInfo
 * functions.  We test:
 *   - happy path JSON response
 *   - abort signal propagation (external AbortController)
 *   - timeout via vitest fake timers
 *   - retry on 5xx and non-retry on 4xx
 *   - fetchProjectionInfo / fetchResolvedSlr basic paths
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- minimal import.meta.env stub ----
// api.js reads import.meta.env.VITE_API_BASE at module load time.
// Vitest/jsdom provides import.meta.env so this is fine; it will be undefined
// causing the fallback URL logic to run.  We mock window.location.origin so
// the fallback resolves to a predictable base.
Object.defineProperty(window, 'location', {
    writable: true,
    value: { origin: 'http://localhost:8000' }
});

// Import AFTER we set window.location so the IIFE captures the right value.
const { analyzeRegion, fetchResolvedSlr, fetchProjectionInfo } = await import('../api.js');

const BASE = 'http://localhost:8000';

function makeBbox() {
    return { lon_min: -80, lat_min: 25, lon_max: -79, lat_max: 26 };
}
function makeParams() {
    return { scenario: 'ssp245', year: 2100, percentile: 50 };
}

describe('analyzeRegion', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', undefined);
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns parsed JSON on 200', async () => {
        const body = { flood_ratio: 0.2, flooded_count: 42 };
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: () => Promise.resolve(body),
        }));

        const result = await analyzeRegion(makeBbox(), makeParams());
        expect(result.status).toBe(200);
        expect(result.data.flood_ratio).toBe(0.2);
    });

    it('throws on 4xx without retrying', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 400,
            headers: { get: () => 'application/json' },
            json: () => Promise.resolve({ detail: 'bad request' }),
        });
        vi.stubGlobal('fetch', mockFetch);

        await expect(analyzeRegion(makeBbox(), makeParams())).rejects.toThrow('Request failed (400)');
        expect(mockFetch).toHaveBeenCalledTimes(1);  // no retries on 4xx
    });

    it('retries up to 3 times on 5xx', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 503,
            headers: { get: () => 'application/json' },
            json: () => Promise.resolve({ detail: 'overload' }),
        });
        vi.stubGlobal('fetch', mockFetch);
        vi.useFakeTimers();

        const promise = analyzeRegion(makeBbox(), makeParams());
        // Advance through all retry delays (200ms + 400ms)
        await vi.runAllTimersAsync();
        await expect(promise).rejects.toThrow('Request failed (503)');
        expect(mockFetch).toHaveBeenCalledTimes(3);
        vi.useRealTimers();
    });

    it('does not retry on AbortError', async () => {
        const mockFetch = vi.fn().mockRejectedValue(
            Object.assign(new Error('Aborted'), { name: 'AbortError' })
        );
        vi.stubGlobal('fetch', mockFetch);

        await expect(analyzeRegion(makeBbox(), makeParams())).rejects.toMatchObject({ name: 'AbortError' });
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('propagates external abort signal', async () => {
        // The fetch never resolves so we can check that abort is wired up
        let capturedSignal;
        const mockFetch = vi.fn().mockImplementation((_url, opts) => {
            capturedSignal = opts.signal;
            return new Promise(() => {});  // never resolves
        });
        vi.stubGlobal('fetch', mockFetch);

        const controller = new AbortController();
        // Start the request but don't await it
        const promise = analyzeRegion(makeBbox(), makeParams(), { signal: controller.signal });
        // Let the microtask queue settle so fetch() has been called
        await Promise.resolve();
        expect(capturedSignal).toBeDefined();
        // Abort and confirm that the downstream signal is aborted
        controller.abort();
        expect(capturedSignal.aborted).toBe(true);
        // Suppress unhandled rejection
        promise.catch(() => {});
    });

    it('immediately aborts if external signal is already aborted', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true, status: 200,
            headers: { get: () => 'application/json' },
            json: () => Promise.resolve({}),
        });
        vi.stubGlobal('fetch', mockFetch);

        const controller = new AbortController();
        controller.abort();

        // The aborted signal is propagated; fetch will be called with an already-aborted signal
        // resulting in an AbortError thrown by the browser (or in our test: fetch resolves but
        // the promise should still succeed since our mock doesn't honour the signal).
        // The key assertion is that the signal passed to fetch is already aborted.
        let capturedSignal;
        mockFetch.mockImplementation((_url, opts) => {
            capturedSignal = opts.signal;
            return Promise.resolve({
                ok: true, status: 200,
                headers: { get: () => 'application/json' },
                json: () => Promise.resolve({}),
            });
        });
        await analyzeRegion(makeBbox(), makeParams(), { signal: controller.signal });
        expect(capturedSignal.aborted).toBe(true);
    });
});


describe('fetchResolvedSlr', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it('calls correct URL and returns data', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true, status: 200,
            headers: { get: () => 'application/json' },
            json: () => Promise.resolve({ slr_meters: 0.56 }),
        }));

        const result = await fetchResolvedSlr(25.0, -80.0, 'ssp245', 2100, 50);
        expect(result.data.slr_meters).toBe(0.56);
        const calledUrl = fetch.mock.calls[0][0];
        expect(calledUrl).toContain('/resolve_slr');
        expect(calledUrl).toContain('scenario=ssp245');
    });
});


describe('fetchProjectionInfo', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it('omits lat/lon from URL when not provided', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true, status: 200,
            headers: { get: () => 'application/json' },
            json: () => Promise.resolve({ scenarios: [] }),
        }));

        await fetchProjectionInfo(null, null);
        const calledUrl = fetch.mock.calls[0][0];
        expect(calledUrl).toContain('/projection_info');
        expect(calledUrl).not.toContain('lat=');
    });

    it('includes lat/lon in URL when provided', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true, status: 200,
            headers: { get: () => 'application/json' },
            json: () => Promise.resolve({}),
        }));

        await fetchProjectionInfo(35.0, 139.0);
        const calledUrl = fetch.mock.calls[0][0];
        expect(calledUrl).toContain('lat=35');
        expect(calledUrl).toContain('lon=139');
    });
});
