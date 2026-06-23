import { useEffect, useRef, useState } from "react";
import { analyzeRegion } from "./api";

// Decades sampled for the trend (every 20 yr keeps it to 7 requests).
const YEARS = [2030, 2050, 2070, 2090, 2110, 2130, 2150];

const fmt = (n) => {
    if (n == null) return "—";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(0) + "k";
    return String(n);
};

// Affected-population-over-time bar chart for the current viewport.
// Re-fetches /analyze_region for each sampled decade when the view, scenario,
// or percentile changes. Additive and self-contained — does not touch the
// live flood-tile pipeline.
export default function PopulationChart({ bbox, scenario, percentile, currentYear }) {
    const [data, setData] = useState(null);   // [{ year, pop }]
    const [loading, setLoading] = useState(false);
    const controllerRef = useRef(null);

    const lonSpan = bbox ? Math.abs(bbox.lon_max - bbox.lon_min) : 0;
    const latSpan = bbox ? Math.abs(bbox.lat_max - bbox.lat_min) : 0;
    const tooBroad = lonSpan > 40 || latSpan > 40;

    useEffect(() => {
        if (!bbox || tooBroad) {
            setData(null);
            return;
        }
        const handle = setTimeout(async () => {
            if (controllerRef.current) controllerRef.current.abort();
            const controller = new AbortController();
            controllerRef.current = controller;
            setLoading(true);
            try {
                const results = await Promise.all(
                    YEARS.map((y) =>
                        analyzeRegion(bbox, { scenario, year: y, percentile }, { signal: controller.signal })
                            .then((r) => ({ year: y, pop: r.data?.estimated_population_affected ?? null }))
                            .catch(() => ({ year: y, pop: null }))
                    )
                );
                if (!controller.signal.aborted) setData(results);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }, 500);
        return () => clearTimeout(handle);
    }, [bbox?.lon_min, bbox?.lat_min, bbox?.lon_max, bbox?.lat_max, scenario, percentile, tooBroad]);

    if (!bbox || tooBroad) return null;

    const maxPop = data ? Math.max(1, ...data.map((d) => d.pop ?? 0)) : 1;

    return (
        <div style={{ marginTop: "12px", fontSize: "0.9em" }}>
            <h3 style={{ margin: "4px 0" }}>Affected population over time</h3>
            <div style={{ fontSize: "0.8em", color: "#666", marginBottom: "6px" }}>
                {SCENARIO_SHORT[scenario] || scenario} · {percentile}th percentile
            </div>
            {loading && !data && <div style={{ color: "#666" }}>Loading trend…</div>}
            {data && (
                <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "90px" }}>
                    {data.map(({ year, pop }) => {
                        const h = pop != null ? Math.max(2, (pop / maxPop) * 80) : 2;
                        const isCurrent = year === currentYear;
                        return (
                            <div
                                key={year}
                                title={`${year}: ${pop != null ? pop.toLocaleString() : "no data"} people`}
                                style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}
                            >
                                <div style={{ fontSize: "9px", color: "#555", marginBottom: "2px" }}>{fmt(pop)}</div>
                                <div
                                    style={{
                                        width: "100%",
                                        height: `${h}px`,
                                        background: isCurrent ? "#856404" : "#f0c040",
                                        borderRadius: "2px 2px 0 0",
                                    }}
                                />
                                <div style={{ fontSize: "9px", color: "#555", marginTop: "2px" }}>{`'${String(year).slice(2)}`}</div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

const SCENARIO_SHORT = {
    ssp126: "SSP1-2.6",
    ssp245: "SSP2-4.5",
    ssp370: "SSP3-7.0",
    ssp585: "SSP5-8.5",
};
