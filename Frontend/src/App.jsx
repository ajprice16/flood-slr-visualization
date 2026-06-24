
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import MapView from "./MapView";
import StoryMap from "./StoryMap";
import LandingPage from "./LandingPage";
import PopulationChart from "./PopulationChart";
import { analyzeRegion, fetchResolvedSlr } from "./api";
import { parseUrlState, buildShareUrl } from "./urlState";
import { font, color, shadow, radius, panelStyle, labelStyle, SCENARIO_META } from "./theme";

const SCENARIO_LABELS = {
    ssp126: "SSP1-2.6 (Very Low)",
    ssp245: "SSP2-4.5 (Intermediate)",
    ssp370: "SSP3-7.0 (High)",
    ssp585: "SSP5-8.5 (Very High)",
};

// Track whether the viewport is in the mobile breakpoint. Guards against
// environments (e.g. jsdom in tests) where matchMedia is not implemented.
function useIsMobile() {
    const query = "(max-width: 768px)";
    const read = () =>
        typeof window !== "undefined" && typeof window.matchMedia === "function"
            ? window.matchMedia(query).matches
            : false;
    const [isMobile, setIsMobile] = useState(read);
    useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
        const mq = window.matchMedia(query);
        const handler = (e) => setIsMobile(e.matches);
        mq.addEventListener?.("change", handler);
        return () => mq.removeEventListener?.("change", handler);
    }, []);
    return isMobile;
}

export default function App() {
    const urlState = useRef(parseUrlState()).current;
    const isMobile = useIsMobile();
    const [showLanding, setShowLanding] = useState(true);
    const [bbox, setBbox] = useState(null);
    const [scenario, setScenario] = useState(urlState.scenario ?? "ssp245");
    const [year, setYear] = useState(urlState.year ?? 2100);
    const [percentile, setPercentile] = useState(urlState.percentile ?? 50);
    const [connectivityMode, setConnectivityMode] = useState(urlState.connectivity ?? "boundary");
    const [waterMaskMode, setWaterMaskMode] = useState(urlState.waterMask ?? "none");
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [resolvedSlr, setResolvedSlr] = useState(null);
    const [floodData, setFloodData] = useState(null);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState(null);
    const [zoom, setZoom] = useState(urlState.view?.zoom ?? 9);
    const [lastRequest, setLastRequest] = useState(null);
    const [forceRefresh, setForceRefresh] = useState(0);
    const [storyMode, setStoryMode] = useState(false);
    const [currentStory, setCurrentStory] = useState(0);
    const [showShare, setShowShare] = useState(false);
    const [showTrend, setShowTrend] = useState(false);
    const [shareUrl, setShareUrl] = useState("");
    const [shareQr, setShareQr] = useState("");
    const [copied, setCopied] = useState(false);
    const mapRef = useRef(null);
    const controllerRef = useRef(null);

    const stories = [
        { name: "Miami", coords: [-80.1918, 25.7617], zoom: 11, scenario: "ssp245", year: 2100, percentile: 50, textFile: "/cities/miami.txt", media: null },
        { name: "New Orleans", coords: [-90.0715, 29.9511], zoom: 11, scenario: "ssp585", year: 2100, percentile: 50, textFile: "/cities/new-orleans.txt", media: null },
        { name: "Tokyo", coords: [139.6917, 35.6895], zoom: 11, scenario: "ssp245", year: 2100, percentile: 50, textFile: "/cities/tokyo.txt", media: null },
        { name: "Tabasco, Mexico", coords: [-92.93, 17.99], zoom: 8, scenario: "ssp370", year: 2100, percentile: 50, textFile: "/cities/tabasco-mexico.txt", media: null },
        { name: "Bangladesh", coords: [90.4, 22.5], zoom: 8, scenario: "ssp245", year: 2100, percentile: 50, textFile: "/cities/bangladesh.txt", media: null }
    ];

    const navigateToStory = (index) => {
        if (index < 0 || index >= stories.length) return;
        const story = stories[index];
        setCurrentStory(index);
        setScenario(story.scenario);
        setYear(story.year);
        setPercentile(story.percentile);
        if (mapRef.current) {
            mapRef.current.flyTo(story.coords, story.zoom);
        }
    };

    // Fetch resolved SLR when scenario/year/pct or viewport center changes
    useEffect(() => {
        if (!bbox) return;
        const centerLat = (bbox.lat_min + bbox.lat_max) / 2;
        const centerLon = (bbox.lon_min + bbox.lon_max) / 2;
        let cancelled = false;
        fetchResolvedSlr(centerLat, centerLon, scenario, year, percentile)
            .then(output => {
                if (!cancelled) setResolvedSlr(output.dataset);
            })
            .catch(() => {}); // non-critical, silent fail
        return () => { cancelled = true; };
    }, [bbox?.lon_min, bbox?.lat_min, scenario, year, percentile]);

    // Debounced analysis on bbox or scenario change
    useEffect(() => {
        if (!bbox) return;
        const lonSpan = Math.abs(bbox.lon_max - bbox.lon_min);
        const latSpan = Math.abs(bbox.lat_max - bbox.lat_min);
        if (lonSpan > 40 || latSpan > 40) return;
        setError(null);
        setPending(true);
        const controller = new AbortController();
        controllerRef.current = controller;
        const handle = setTimeout(async () => {
            const start = performance.now();
            try {
                const output = await analyzeRegion(bbox, { scenario, year, percentile }, { signal: controller.signal });
                setFloodData(output.dataset);
                setLastRequest({ status: output.status, ok: output.ok, durationMs: output.durationMs });
            } catch (e) {
                if (e.name === 'AbortError') return;
                const durationMs = (e.durationMs != null) ? e.durationMs : (performance.now() - start);
                setError(String(e));
                setLastRequest({ status: e.status || 'ERR', ok: false, durationMs, error: String(e) });
            } finally {
                setPending(false);
            }
        }, 250);
        return () => {
            controller.abort();
            clearTimeout(handle);
        };
    }, [bbox?.lon_min, bbox?.lat_min, bbox?.lon_max, bbox?.lat_max, scenario, year, percentile, forceRefresh]);

    const cancelAndRestart = async () => {
        try {
            if (controllerRef.current) controllerRef.current.abort();
        } catch {}
        if (!bbox) return;
        setPending(true);
        const controller = new AbortController();
        controllerRef.current = controller;
        const start = performance.now();
        try {
            const output = await analyzeRegion(bbox, { scenario, year, percentile }, { signal: controller.signal });
            setFloodData(output.dataset);
            setLastRequest({ status: output.status, ok: output.ok, durationMs: output.durationMs });
            setError(null);
        } catch (e) {
            if (e.name !== 'AbortError') {
                const durationMs = (e.durationMs != null) ? e.durationMs : (performance.now() - start);
                setError(String(e));
                setLastRequest({ status: e.status || 'ERR', ok: false, durationMs, error: String(e) });
            }
        } finally {
            setPending(false);
        }
    };

    const handleBoundsChange = useCallback((bounds) => {
        setBbox(bounds);
        if (bounds.zoom != null) setZoom(bounds.zoom);
    }, []);

    const currentCenter = bbox
        ? [(bbox.lon_min + bbox.lon_max) / 2, (bbox.lat_min + bbox.lat_max) / 2]
        : null;

    // Keep the URL in sync with the current view so it is always shareable.
    useEffect(() => {
        const url = buildShareUrl({
            scenario, year, percentile,
            connectivity: connectivityMode, waterMask: waterMaskMode,
            center: currentCenter, zoom,
        });
        const handle = setTimeout(() => window.history.replaceState(null, "", url), 300);
        return () => clearTimeout(handle);
    }, [scenario, year, percentile, connectivityMode, waterMaskMode,
        bbox?.lon_min, bbox?.lat_min, bbox?.lon_max, bbox?.lat_max, zoom]);

    const openShare = useCallback(() => {
        const url = buildShareUrl({
            scenario, year, percentile,
            connectivity: connectivityMode, waterMask: waterMaskMode,
            center: currentCenter, zoom,
        });
        setShareUrl(url);
        setCopied(false);
        setShowShare(true);
        QRCode.toDataURL(url, { width: 220, margin: 1 }).then(setShareQr).catch(() => setShareQr(""));
    }, [scenario, year, percentile, connectivityMode, waterMaskMode,
        bbox?.lon_min, bbox?.lat_min, bbox?.lon_max, bbox?.lat_max, zoom]);

    const copyShare = useCallback(() => {
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(shareUrl)
                .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })
                .catch(() => {});
        }
    }, [shareUrl]);

    const effectiveSlr = resolvedSlr?.slr_meters ?? null;

    // Show landing page if user hasn't accepted disclaimer
    if (showLanding) {
        return <LandingPage onProceed={() => setShowLanding(false)} />;
    }

    const tooBroad = !pending && bbox &&
        (Math.abs(bbox.lon_max - bbox.lon_min) > 40 || Math.abs(bbox.lat_max - bbox.lat_min) > 40);

    // ---- shared style fragments ----
    const sectionLabel = { ...labelStyle, marginBottom: 11 };
    const divider = { height: 1, background: color.line2, margin: "18px 0" };
    const segWrap = { display: "flex", background: color.surfaceAlt, borderRadius: radius.card, padding: 4, gap: 4, marginTop: 4 };
    const segBtn = (active) => ({
        flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 8, fontSize: "12px",
        border: "none", cursor: "pointer",
        background: active ? "#fff" : "transparent",
        color: active ? color.ink : color.muted,
        fontWeight: active ? 600 : 400,
        boxShadow: active ? "0 1px 4px rgba(16,36,51,0.12)" : "none",
        fontFamily: font.body,
    });
    const glassBtn = {
        display: "flex", alignItems: "center", gap: 8, height: 42, padding: "0 16px",
        border: "none", borderRadius: radius.card, background: color.glass,
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
        boxShadow: shadow.chip, font: `600 13.5px ${font.body}`, color: color.ink, cursor: "pointer",
    };

    // ---- shared control widgets (used by both desktop panel and mobile sheet) ----
    const controlsInner = (
        <>
            {/* Scenario */}
            <div style={sectionLabel}>Climate scenario</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {Object.entries(SCENARIO_META).map(([key, m]) => {
                    const active = scenario === key;
                    return (
                        <button
                            key={key}
                            onClick={() => setScenario(key)}
                            aria-pressed={active}
                            title={`${m.code} (${m.descriptor})`}
                            style={{
                                display: "flex", alignItems: "center", gap: 8, padding: "9px 10px",
                                borderRadius: radius.control, cursor: "pointer", textAlign: "left",
                                border: active ? `1.5px solid ${m.accent}` : `1px solid ${color.line}`,
                                background: active ? m.tint : "#fff",
                                boxShadow: active ? "0 0 0 3px rgba(16,36,51,0.06)" : "none",
                            }}
                        >
                            <span style={{ width: 9, height: 9, borderRadius: "50%", background: m.dot, flexShrink: 0 }} />
                            <span style={{ lineHeight: 1.1 }}>
                                <span style={{ display: "block", fontSize: "12.5px", fontWeight: active ? 700 : 600, color: active ? m.accent : color.ink }}>{m.code}</span>
                                <span style={{ display: "block", fontSize: "10px", color: color.subtle }}>{m.temp}</span>
                            </span>
                        </button>
                    );
                })}
            </div>

            <div style={divider} />

            {/* Year */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                <span style={labelStyle}>Projection Year</span>
                <span style={{ fontFamily: font.display, fontSize: 20, fontWeight: 600, color: color.ocean }}>{year}</span>
            </div>
            <input
                type="range"
                min="2030" max="2150" step="10"
                value={year}
                onChange={e => setYear(parseInt(e.target.value))}
                style={{ width: "100%", accentColor: color.ocean }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: font.mono, fontSize: 10, color: color.faint, marginTop: 2 }}>
                <span>2030</span><span>2090</span><span>2150</span>
            </div>

            <div style={divider} />

            {/* Projection range (model-run distribution) */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 11 }}>
                <span style={labelStyle}>Projection Range</span>
                <span
                    title="The distribution of model runs, from the low end to the high end of projections. Low = 5th percentile, Median = 50th, High = 95th."
                    aria-label="What is Projection Range?"
                    style={{ cursor: "help", color: color.subtle, fontSize: 12, lineHeight: 1 }}
                >&#x2139;</span>
            </div>
            <div style={segWrap}>
                {[
                    { value: 5, label: "Low (5th)" },
                    { value: 50, label: "Median (50th)" },
                    { value: 95, label: "High (95th)" },
                ].map(({ value, label }) => (
                    <button key={value} onClick={() => setPercentile(value)} style={segBtn(percentile === value)}>
                        {label}
                    </button>
                ))}
            </div>

            <div style={divider} />

            {/* Advanced disclosure: flood spread + water mask */}
            <button
                onClick={() => setShowAdvanced(v => !v)}
                aria-expanded={showAdvanced}
                style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "11px 14px", borderRadius: radius.control, border: `1px solid ${color.line}`,
                    background: "#fff", cursor: "pointer", font: `500 12.5px ${font.body}`, color: color.muted,
                }}
            >
                <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color.subtle} strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
                    Advanced — flood spread &amp; water mask
                </span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color.subtle} strokeWidth="1.8" strokeLinecap="round" style={{ transform: showAdvanced ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}><path d="m6 9 6 6 6-6"/></svg>
            </button>
            {showAdvanced && (
                <div style={{ marginTop: 14 }}>
                    <div style={sectionLabel}>Flood Spread Mode</div>
                    <div style={segWrap}>
                        {[
                            { value: "boundary", label: "Boundary" },
                            { value: "none", label: "None" },
                            { value: "full", label: "3x3 Mosaic" },
                        ].map(({ value, label }) => (
                            <button key={value} onClick={() => setConnectivityMode(value)} style={segBtn(connectivityMode === value)}>
                                {label}
                            </button>
                        ))}
                    </div>

                    <div style={{ marginTop: 14 }}>
                        <div style={sectionLabel}>Water Mask</div>
                        <select
                            value={waterMaskMode}
                            onChange={e => setWaterMaskMode(e.target.value)}
                            style={{ width: "100%", padding: "8px 10px", borderRadius: radius.control, border: `1px solid ${color.line}`, fontSize: "13px", fontFamily: font.body, color: color.ink, background: "#fff" }}
                        >
                            <option value="none">None</option>
                            <option value="raster">Raster (if configured)</option>
                        </select>
                    </div>
                </div>
            )}

            <div style={divider} />

            {/* Region info */}
            <div style={{ fontFamily: font.mono, fontSize: 11, color: color.muted, lineHeight: 1.6 }}>
                {bbox ? (
                    <>
                        <div>Lon {bbox.lon_min.toFixed(2)} → {bbox.lon_max.toFixed(2)}</div>
                        <div>Lat {bbox.lat_min.toFixed(2)} → {bbox.lat_max.toFixed(2)}</div>
                        <div>Zoom {zoom.toFixed(1)}</div>
                    </>
                ) : (
                    <div>Pan/zoom the map to set bounds.</div>
                )}
            </div>

            <button
                onClick={cancelAndRestart}
                disabled={!bbox || pending}
                style={{
                    marginTop: 14, width: "100%", height: 42, border: "none", borderRadius: radius.control,
                    background: (!bbox || pending) ? "#F0F2F4" : color.ocean,
                    color: (!bbox || pending) ? color.faint : "#fff",
                    font: `600 13.5px ${font.body}`, cursor: (!bbox || pending) ? "not-allowed" : "pointer",
                    boxShadow: (!bbox || pending) ? "none" : shadow.primary,
                }}
            >
                {pending ? "Analyzing…" : "Run Analysis for Current View"}
            </button>

            {error && <div style={{ color: color.danger, marginTop: 8, fontSize: 12 }}>Error: {error}</div>}
            {tooBroad && (
                <div style={{ marginTop: 8, color: color.muted, fontSize: 12 }}>
                    View is too broad. Zoom in to analyze flooding.
                </div>
            )}

            <button
                onClick={() => setShowTrend(v => !v)}
                style={{
                    marginTop: 10, width: "100%", height: 38, borderRadius: radius.control,
                    border: `1px solid ${color.ocean}`, background: "#fff", color: color.ocean,
                    font: `600 12.5px ${font.body}`, cursor: "pointer",
                }}
            >
                {showTrend ? "Hide trend" : "Show trend over time"}
            </button>
            {showTrend && (
                <PopulationChart bbox={bbox} scenario={scenario} percentile={percentile} currentYear={year} />
            )}
        </>
    );

    // Full readout (desktop instrument panel)
    const readoutFull = (
        <div style={{ ...panelStyle, padding: "18px 20px 20px", flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                    <div style={labelStyle}>Sea level rise · at center</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
                        <span style={{ fontFamily: font.display, fontSize: 42, fontWeight: 600, color: color.ink, lineHeight: 1, letterSpacing: "-0.02em" }}>
                            {resolvedSlr?.slr_meters != null ? resolvedSlr.slr_meters.toFixed(2) : "—"}
                        </span>
                        <span style={{ fontSize: 18, fontWeight: 500, color: color.muted }}>m</span>
                    </div>
                </div>
                <div style={{ width: 38, height: 38, borderRadius: radius.control, background: "#EAF2F6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color.tide} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11Z"/></svg>
                </div>
            </div>
            {resolvedSlr && (
                <div style={{ fontSize: 11.5, color: color.subtle, marginTop: 3 }}>
                    IPCC AR6 {resolvedSlr.projection_source === "regional" ? "regional" : "global mean"} · {percentile}th pct
                </div>
            )}

            {floodData?.estimated_population_affected != null && (
                <>
                    <div style={divider} />
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 38, height: 38, borderRadius: radius.control, background: "#FBEEEA", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color.signal} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M17 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="3.2"/><path d="M21 20v-2a4 4 0 0 0-3-3.8"/></svg>
                        </div>
                        <div>
                            <div style={{ ...labelStyle, fontSize: 10.5, letterSpacing: "0.1em" }}>Est. population affected</div>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 2 }}>
                                <span style={{ fontFamily: font.display, fontSize: 27, fontWeight: 600, color: color.danger, lineHeight: 1 }}>
                                    {floodData.estimated_population_affected.toLocaleString()}
                                </span>
                                <span style={{ fontSize: 12, color: color.subtle }}>people</span>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {floodData && (
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    <StatCard label="Flood area" value={`${(floodData.flood_ratio * 100).toFixed(1)}%`} />
                    <StatCard
                        label="Elevation"
                        value={<>{floodData.elevation_min?.toFixed(0)}–{floodData.elevation_max?.toFixed(0)}<span style={{ fontSize: 11, fontWeight: 400, color: color.subtle }}>m</span></>}
                    />
                    <StatCard label="Tiles" value={floodData.tiles_used?.length ?? 0} />
                </div>
            )}
        </div>
    );

    // Compact readout (mobile floating chip)
    const readoutChip = (resolvedSlr || floodData) && (
        <div style={{
            position: "absolute", left: 12, top: 110, zIndex: 1450,
            display: "flex", alignItems: "center", gap: 12,
            background: color.glass, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
            borderRadius: 13, padding: "10px 15px", boxShadow: shadow.chip,
        }}>
            <div>
                <div style={{ ...labelStyle, fontSize: 9, letterSpacing: "0.1em" }}>SLR</div>
                <div style={{ fontFamily: font.display, fontSize: 18, fontWeight: 600, color: color.ink, lineHeight: 1 }}>
                    {resolvedSlr?.slr_meters != null ? `${resolvedSlr.slr_meters.toFixed(2)} m` : "—"}
                </div>
            </div>
            {floodData?.estimated_population_affected != null && (
                <>
                    <div style={{ width: 1, height: 26, background: color.line }} />
                    <div>
                        <div style={{ ...labelStyle, fontSize: 9, letterSpacing: "0.1em" }}>Exposed</div>
                        <div style={{ fontFamily: font.display, fontSize: 18, fontWeight: 600, color: color.danger, lineHeight: 1 }}>
                            {compactNumber(floodData.estimated_population_affected)}
                        </div>
                    </div>
                </>
            )}
        </div>
    );

    const storyButton = (
        <button
            onClick={() => { setStoryMode(!storyMode); if (!storyMode) navigateToStory(0); }}
            style={{
                display: "flex", alignItems: "center", gap: 8, height: 42, padding: "0 18px",
                border: "none", borderRadius: radius.card,
                background: storyMode ? color.signal : color.ocean,
                boxShadow: storyMode ? "0 4px 14px rgba(216,90,59,0.4)" : shadow.primary,
                font: `600 13.5px ${font.body}`, color: "#fff", cursor: "pointer", whiteSpace: "nowrap",
            }}
        >
            {storyMode ? (
                <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>Exit Story</>
            ) : (
                <><svg width="15" height="15" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>Start Story</>
            )}
        </button>
    );

    const shareIconBtn = (
        <button onClick={openShare} aria-label="Share this view" style={glassBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color.ink} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>
            {!isMobile && "Share"}
        </button>
    );

    return (
        <div style={{ position: "relative", height: "100%", width: "100%", overflow: "hidden", fontFamily: font.body, background: "#1b2a36" }}>
            {/* Full-bleed map */}
            <div style={{ position: "absolute", inset: 0 }}>
                <MapView
                    floodData={floodData}
                    bbox={bbox}
                    scenario={scenario}
                    year={year}
                    percentile={percentile}
                    resolvedSlr={effectiveSlr}
                    connectivityMode={connectivityMode}
                    waterMaskMode={waterMaskMode}
                    initialView={urlState.view}
                    onBoundsChange={handleBoundsChange}
                    pending={pending}
                    lastRequest={lastRequest}
                    mapRef={mapRef}
                />
            </div>

            {/* Brand chip (top-left) — desktop only */}
            {!storyMode && !isMobile && (
                <div style={{
                    position: "absolute", left: 24, top: 24, zIndex: 1500,
                    display: "flex", alignItems: "center", gap: 11,
                    background: color.glass, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
                    padding: "9px 15px 9px 12px", borderRadius: radius.chip, boxShadow: shadow.chip,
                }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: color.ocean, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"><path d="M2 8c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2"/><path d="M2 14c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2"/></svg>
                    </div>
                    <div style={{ lineHeight: 1.05 }}>
                        <div style={{ fontFamily: font.display, fontWeight: 600, fontSize: 15, color: color.ink, letterSpacing: "-0.01em" }}>Sea Level Rise Explorer</div>
                        <div style={{ fontFamily: font.mono, fontSize: 10, color: color.muted, letterSpacing: "0.06em", marginTop: 2 }}>IPCC AR6 · regional projections</div>
                    </div>
                </div>
            )}

            {/* Desktop top-right actions */}
            {!isMobile && (
                <div style={{ position: "absolute", right: 24, top: 24, zIndex: 2000, display: "flex", gap: 10 }}>
                    {!storyMode && shareIconBtn}
                    {storyButton}
                </div>
            )}

            {/* Mobile top bar */}
            {isMobile && (
                <div style={{ position: "absolute", left: 12, right: 12, top: 14, zIndex: 2000, display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{
                        flex: 1, display: "flex", alignItems: "center", gap: 9, height: 44, padding: "0 12px",
                        background: color.glass, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
                        borderRadius: 13, boxShadow: shadow.chip, overflow: "hidden",
                    }}>
                        <div style={{ width: 24, height: 24, borderRadius: 7, background: color.ocean, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"><path d="M2 8c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2"/><path d="M2 14c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2"/></svg>
                        </div>
                        <span style={{ fontFamily: font.display, fontWeight: 600, fontSize: 13.5, color: color.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Sea Level Rise Explorer</span>
                    </div>
                    {!storyMode && shareIconBtn}
                </div>
            )}

            {/* Desktop left column: control panel + readout */}
            {!storyMode && !isMobile && (
                <div style={{
                    position: "absolute", left: 24, top: 92, bottom: 24, width: 344, zIndex: 1400,
                    display: "flex", flexDirection: "column", gap: 16,
                }}>
                    <div style={{ ...panelStyle, padding: "20px", flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}>
                        {controlsInner}
                    </div>
                    {(resolvedSlr || floodData) && readoutFull}
                </div>
            )}

            {/* Mobile: floating readout chip + bottom sheet */}
            {!storyMode && isMobile && (
                <>
                    {readoutChip}
                    <div style={{
                        position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 1400,
                        background: "#fff", borderRadius: "22px 22px 0 0", boxShadow: "0 -8px 30px rgba(16,36,51,0.18)",
                        padding: "10px 18px calc(20px + env(safe-area-inset-bottom))", maxHeight: "62vh", overflowY: "auto",
                    }}>
                        <div style={{ width: 38, height: 4, borderRadius: 2, background: "#D7DDE1", margin: "0 auto 14px" }} />
                        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>{storyButton}</div>
                        {controlsInner}
                    </div>
                </>
            )}

            {/* Story Panel */}
            {storyMode && (
                <StoryMap
                    stories={stories}
                    currentIndex={currentStory}
                    onNavigate={navigateToStory}
                    onClose={() => setStoryMode(false)}
                    scenario={scenario}
                    year={year}
                    percentile={percentile}
                    resolvedSlr={resolvedSlr}
                />
            )}

            {/* Share modal */}
            {showShare && (
                <div
                    onClick={() => setShowShare(false)}
                    style={{ position: "absolute", inset: 0, zIndex: 3000, background: "rgba(11,24,34,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{ background: "#fff", borderRadius: 18, padding: "26px 26px 24px", width: 380, maxWidth: "100%", boxShadow: shadow.modal }}
                    >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                            <h3 style={{ margin: 0, fontFamily: font.display, fontSize: 19, fontWeight: 600, color: color.ink }}>Share this view</h3>
                            <button
                                onClick={() => setShowShare(false)}
                                aria-label="Close share dialog"
                                style={{ width: 30, height: 30, border: "none", borderRadius: 8, background: color.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                            >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color.muted} strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
                            </button>
                        </div>
                        <p style={{ margin: "0 0 18px", fontSize: 13, lineHeight: 1.5, color: color.subtle }}>
                            Anyone with the link opens this exact map, scenario, year, and percentile.
                        </p>
                        {shareQr && (
                            <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
                                <div style={{ width: 172, height: 172, borderRadius: 14, background: "#fff", border: `1px solid ${color.line}`, padding: 12, boxShadow: "0 4px 14px rgba(16,36,51,0.08)" }}>
                                    <img src={shareQr} alt="QR code for this view" width={148} height={148} style={{ display: "block" }} />
                                </div>
                            </div>
                        )}
                        <div style={{ display: "flex", gap: 8 }}>
                            <input
                                readOnly
                                value={shareUrl}
                                onFocus={(e) => e.target.select()}
                                style={{ flex: 1, padding: "0 12px", height: 44, border: `1px solid ${color.line}`, borderRadius: radius.card, background: color.surface, fontFamily: font.mono, fontSize: 12, color: color.muted, boxSizing: "border-box", minWidth: 0 }}
                            />
                            <button
                                onClick={copyShare}
                                style={{ height: 44, padding: "0 18px", border: "none", borderRadius: radius.card, background: color.ocean, font: `600 13.5px ${font.body}`, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}
                            >
                                {copied ? "Copied!" : "Copy"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function StatCard({ label, value }) {
    return (
        <div style={{ flex: 1, background: color.surface, borderRadius: radius.control, padding: "9px 11px" }}>
            <div style={{ fontFamily: font.mono, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: color.faint }}>{label}</div>
            <div style={{ fontFamily: font.display, fontSize: 16, fontWeight: 600, color: color.ink, marginTop: 2 }}>{value}</div>
        </div>
    );
}

function compactNumber(n) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
    return String(n);
}
