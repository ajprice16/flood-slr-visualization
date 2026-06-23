import { describe, it, expect } from "vitest";
import { parseUrlState, buildShareUrl } from "../urlState";

describe("urlState", () => {
    it("round-trips a full state through build → parse", () => {
        const url = buildShareUrl({
            scenario: "ssp585", year: 2120, percentile: 95,
            connectivity: "full", waterMask: "raster",
            center: [139.69, 35.68], zoom: 11,
        });
        const search = url.slice(url.indexOf("?"));
        const parsed = parseUrlState(search);
        expect(parsed.scenario).toBe("ssp585");
        expect(parsed.year).toBe(2120);
        expect(parsed.percentile).toBe(95);
        expect(parsed.connectivity).toBe("full");
        expect(parsed.waterMask).toBe("raster");
        expect(parsed.view.center[0]).toBeCloseTo(139.69, 2);
        expect(parsed.view.center[1]).toBeCloseTo(35.68, 2);
        expect(parsed.view.zoom).toBeCloseTo(11, 1);
    });

    it("returns nulls for missing/invalid params", () => {
        const parsed = parseUrlState("?s=bogus&y=9999&p=42&c=nope");
        expect(parsed.scenario).toBeNull();
        expect(parsed.percentile).toBeNull();
        expect(parsed.connectivity).toBeNull();
        expect(parsed.view).toBeNull();
        // year is clamped to the valid range, not nulled
        expect(parsed.year).toBe(2150);
    });

    it("ignores view when coords are out of range", () => {
        expect(parseUrlState("?lat=200&lon=10").view).toBeNull();
    });
});
