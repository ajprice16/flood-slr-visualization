
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import MapView from "./MapView";
import StoryMap from "./StoryMap";
import LandingPage from "./LandingPage";
import PopulationChart from "./PopulationChart";
import { analyzeRegion, fetchResolvedSlr } from "./api";
import { parseUrlState, buildShareUrl } from "./urlState";

const SCENARIO_LABELS = {
    ssp126: "SSP1-2.6 (Very Low)",
    ssp245: "SSP2-4.5 (Intermediate)",
    ssp370: "SSP3-7.0 (High)",
    ssp585: "SSP5-8.5 (Very High)",
};

export default function App() {
    const urlState = useRef(parseUrlState()).current;
    const [showLanding, setShowLanding] = useState(true);
    const [bbox, setBbox] = useState(null);
    const [scenario, setScenario] = useState(urlState.scenario ?? "ssp245");
    const [year, setYear] = useState(urlState.year ?? 2100);
    const [percentile, setPercentile] = useState(urlState.percentile ?? 50);
    const [connectivityMode, setConnectivityMode] = useState(urlState.connectivity ?? "boundary");
    const [waterMaskMode, setWaterMaskMode] = useState(urlState.waterMask ?? "none");
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
        {
            name: "Miami",
            coords: [-80.1918, 25.7617],
            zoom: 11,
            scenario: "ssp245",
            year: 2100,
            percentile: 50,
            textFile: "/cities/miami.txt",
            media: null
        },
        {
            name: "New Orleans",
            coords: [-90.0715, 29.9511],
            zoom: 11,
            scenario: "ssp585",
            year: 2100,
            percentile: 50,
            textFile: "/cities/new-orleans.txt",
            media: null
        },
        {
            name: "Tokyo",
            coords: [139.6917, 35.6895],
            zoom: 11,
            scenario: "ssp245",
            year: 2100,
            percentile: 50,
            textFile: "/cities/tokyo.txt",
            media: null
        },
        {
            name: "Tabasco, Mexico",
            coords: [-92.93, 17.99],
            zoom: 8,
            scenario: "ssp370",
            year: 2100,
            percentile: 50,
            textFile: "/cities/tabasco-mexico.txt",
            media: null
        },
        {
            name: "Bangladesh",
            coords: [90.4, 22.5],
            zoom: 8,
            scenario: "ssp245",
            year: 2100,
            percentile: 50,
            textFile: "/cities/bangladesh.txt",
            media: null
        }
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

    return (
        <div style={{ display: "flex", height: "100%", position: "relative" }}>
            {/* Story Mode Toggle */}
            <button
                onClick={() => {
                    setStoryMode(!storyMode);
                    if (!storyMode) navigateToStory(0);
                }}
                style={{
                    position: "absolute",
                    top: "16px",
                    right: "16px",
                    zIndex: 2000,
                    padding: "10px 20px",
                    background: storyMode ? "#ff6b6b" : "#007acc",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: "600",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.2)"
                }}
            >
                {storyMode ? "Exit Story" : "Start Story"}
            </button>

            {/* Share button */}
            {!storyMode && (
                <button
                    onClick={openShare}
                    style={{
                        position: "absolute",
                        top: "16px",
                        right: "140px",
                        zIndex: 2000,
                        padding: "10px 20px",
                        background: "#fff",
                        color: "#007acc",
                        border: "1px solid #007acc",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "14px",
                        fontWeight: "600",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                    }}
                >
                    Share
                </button>
            )}

            {/* Share modal */}
            {showShare && (
                <div
                    onClick={() => setShowShare(false)}
                    style={{
                        position: "absolute", inset: 0, zIndex: 3000,
                        background: "rgba(0,0,0,0.5)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: "#fff", borderRadius: "8px", padding: "24px",
                            width: "320px", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", textAlign: "center",
                        }}
                    >
                        <h3 style={{ margin: "0 0 12px 0" }}>Share this view</h3>
                        <p style={{ fontSize: "0.85em", color: "#666", margin: "0 0 12px 0" }}>
                            Scan or copy the link to open this exact map, scenario, year, and percentile.
                        </p>
                        {shareQr && (
                            <img src={shareQr} alt="QR code for this view" width={220} height={220} style={{ display: "block", margin: "0 auto 12px" }} />
                        )}
                        <input
                            readOnly
                            value={shareUrl}
                            onFocus={(e) => e.target.select()}
                            style={{ width: "100%", padding: "6px", fontSize: "12px", boxSizing: "border-box", marginBottom: "8px" }}
                        />
                        <div style={{ display: "flex", gap: "8px" }}>
                            <button
                                onClick={copyShare}
                                style={{ flex: 1, padding: "8px", cursor: "pointer", background: "#007acc", color: "#fff", border: "none", borderRadius: "4px" }}
                            >
                                {copied ? "Copied!" : "Copy link"}
                            </button>
                            <button
                                onClick={() => setShowShare(false)}
                                style={{ flex: 1, padding: "8px", cursor: "pointer", background: "#eee", color: "#333", border: "none", borderRadius: "4px" }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
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

            {/* Sidebar - hide in story mode */}
            {!storyMode && (
                <div style={{ width: "300px", padding: "15px", background: "#eee", overflowY: "auto" }}>
                <h2 style={{ margin: "0 0 12px 0" }}>Sea Level Rise Explorer</h2>

                {/* Scenario Selector */}
                <div style={{ marginBottom: "12px" }}>
                    <label style={{ fontWeight: "600", fontSize: "0.85em" }}>Scenario</label>
                    <select
                        value={scenario}
                        onChange={e => setScenario(e.target.value)}
                        style={{ width: "100%", padding: "6px", marginTop: "4px", fontSize: "13px" }}
                    >
                        {Object.entries(SCENARIO_LABELS).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                        ))}
                    </select>
                </div>

                {/* Year Timeline */}
                <div style={{ marginBottom: "12px" }}>
                    <label style={{ fontWeight: "600", fontSize: "0.85em" }}>Projection Year</label>
                    <input
                        type="range"
                        min="2030" max="2150" step="10"
                        value={year}
                        onChange={e => setYear(parseInt(e.target.value))}
                        style={{ width: "100%", marginTop: "4px" }}
                    />
                    <div style={{ textAlign: "center", fontWeight: "600" }}>{year}</div>
                </div>

                {/* Percentile Toggle */}
                <div style={{ marginBottom: "12px" }}>
                    <label style={{ fontWeight: "600", fontSize: "0.85em" }}>
                        Uncertainty Level{" "}
                        <span
                            title="Controls which percentile of model runs is shown. Low = optimistic, Median = most likely, High = worst-case."
                            style={{ cursor: "help", fontSize: "0.85em", color: "#555" }}
                            aria-label="What is Uncertainty Level?"
                        >&#x2139;</span>
                    </label>
                    <div style={{ display: "flex", gap: "4px", marginTop: "4px" }}>
                        {[
                            { value: 5, label: "Low (5th)" },
                            { value: 50, label: "Median (50th)" },
                            { value: 95, label: "High (95th)" },
                        ].map(({ value, label }) => (
                            <button
                                key={value}
                                onClick={() => setPercentile(value)}
                                style={{
                                    flex: 1,
                                    padding: "6px 4px",
                                    fontSize: "11px",
                                    border: "1px solid #ccc",
                                    borderRadius: "3px",
                                    cursor: "pointer",
                                    background: percentile === value ? "#007acc" : "#fff",
                                    color: percentile === value ? "#fff" : "#333",
                                    fontWeight: percentile === value ? "600" : "400",
                                }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Connectivity Mode */}
                <div style={{ marginBottom: "12px" }}>
                    <label style={{ fontWeight: "600", fontSize: "0.85em" }}>
                        Flood Spread Mode{" "}
                        <span
                            title="Boundary (default): only shows flooding connected to the ocean edge. None: shows all below-threshold pixels. 3x3 Mosaic: flood propagates across tile boundaries for a seamless view."
                            style={{ cursor: "help", fontSize: "0.85em", color: "#555" }}
                            aria-label="What is Flood Spread Mode?"
                        >&#x2139;</span>
                    </label>
                    <div style={{ display: "flex", gap: "4px", marginTop: "4px" }}>
                        {[
                            { value: "boundary", label: "Boundary" },
                            { value: "none", label: "None" },
                            { value: "full", label: "3x3 Mosaic" },
                        ].map(({ value, label }) => (
                            <button
                                key={value}
                                onClick={() => setConnectivityMode(value)}
                                style={{
                                    flex: 1,
                                    padding: "6px 4px",
                                    fontSize: "11px",
                                    border: "1px solid #ccc",
                                    borderRadius: "3px",
                                    cursor: "pointer",
                                    background: connectivityMode === value ? "#007acc" : "#fff",
                                    color: connectivityMode === value ? "#fff" : "#333",
                                    fontWeight: connectivityMode === value ? "600" : "400",
                                }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Water Mask Mode */}
                <div style={{ marginBottom: "12px" }}>
                    <label style={{ fontWeight: "600", fontSize: "0.85em" }}>Water Mask</label>
                    <select
                        value={waterMaskMode}
                        onChange={e => setWaterMaskMode(e.target.value)}
                        style={{ width: "100%", padding: "6px", marginTop: "4px", fontSize: "13px" }}
                    >
                        <option value="none">None</option>
                        <option value="raster">Raster (if configured)</option>
                    </select>
                </div>

                {/* Resolved SLR Display */}
                {resolvedSlr && (
                    <div style={{
                        padding: "10px",
                        background: "#e3f2fd",
                        borderRadius: "4px",
                        marginBottom: "12px",
                        fontSize: "0.85em"
                    }}>
                        <div style={{ fontWeight: "600", marginBottom: "4px" }}>
                            Sea level rise: {resolvedSlr.slr_meters?.toFixed(2)}m
                        </div>
                        <div style={{ fontSize: "0.9em", color: "#666", marginTop: "2px" }}>
                            Source: IPCC AR6 {resolvedSlr.projection_source === "regional" ? "regional" : "global mean"}
                        </div>
                    </div>
                )}

                {/* Region info */}
                <div style={{ fontSize: "0.85em", marginBottom: "8px" }}>
                    {bbox ? (
                        <div>
                            <div>Lon: {bbox.lon_min.toFixed(3)} to {bbox.lon_max.toFixed(3)}</div>
                            <div>Lat: {bbox.lat_min.toFixed(3)} to {bbox.lat_max.toFixed(3)}</div>
                            <div>Zoom: {zoom.toFixed(1)}</div>
                        </div>
                    ) : (
                        <div>Pan/zoom the map to set bounds.</div>
                    )}
                </div>

                <button
                    onClick={cancelAndRestart}
                    disabled={!bbox || pending}
                    style={{marginTop:"4px", padding:"8px 12px", cursor:"pointer", background:"#007acc", color:"#fff", border:"none", borderRadius:"4px", width:"100%"}}
                >
                    Run Analysis for Current View
                </button>

                {pending && <div style={{marginTop:"10px"}}>Analyzing...</div>}
                {error && <div style={{color:"red", marginTop:"6px"}}>Error: {error}</div>}
                {!pending && bbox && (Math.abs(bbox.lon_max - bbox.lon_min) > 40 || Math.abs(bbox.lat_max - bbox.lat_min) > 40) && (
                    <div style={{marginTop:"8px", color:"#555", fontSize:"0.85em"}}>
                        View is too broad. Zoom in to analyze flooding.
                    </div>
                )}

                {floodData && (
                    <div style={{marginTop:"12px", fontSize:"0.9em"}}>
                        <h3 style={{margin:"4px 0"}}>Stats</h3>
                        <div><strong>Tiles Used:</strong> {floodData.tiles_used?.length || 0}</div>
                        <div><strong>Flood Ratio:</strong> {(floodData.flood_ratio*100).toFixed(2)}%</div>
                        <div>
                            <strong>Flooded Area:</strong>{" "}
                            {floodData.flooded_count != null
                                ? `${((floodData.flooded_count * 30 * 30) / 1_000_000).toFixed(1)} km²`
                                : "—"}
                            <span style={{color:"#888", fontSize:"0.85em"}}>{" "}({floodData.flooded_count?.toLocaleString()} px)</span>
                        </div>
                        <div><strong>Elevation Range:</strong> {floodData.elevation_min?.toFixed(1)}m to {floodData.elevation_max?.toFixed(1)}m</div>
                        {floodData.estimated_population_affected != null && (
                            <div style={{marginTop:"8px", padding:"8px", background:"#fff3cd", borderRadius:"4px"}}>
                                <strong>Est. Population Affected:</strong><br/>
                                <span style={{fontSize:"1.1em", color:"#856404"}}>
                                    {floodData.estimated_population_affected.toLocaleString()} people
                                </span>
                            </div>
                        )}
                        {lastRequest && (
                            <div style={{marginTop:"6px", fontSize:"0.85em"}}>
                                {Math.round(lastRequest.durationMs)} ms (status {lastRequest.status}){lastRequest.error ? ' - failed' : ''}
                            </div>
                        )}
                    </div>
                )}

                <button
                    onClick={() => setShowTrend(v => !v)}
                    style={{marginTop:"12px", padding:"6px 10px", fontSize:"12px", cursor:"pointer", background:"#fff", color:"#007acc", border:"1px solid #007acc", borderRadius:"4px", width:"100%"}}
                >
                    {showTrend ? "Hide trend" : "Show trend over time"}
                </button>
                {showTrend && (
                    <PopulationChart
                        bbox={bbox}
                        scenario={scenario}
                        percentile={percentile}
                        currentYear={year}
                    />
                )}
            </div>
            )}

            <div style={{ flex: 1 }}>
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
        </div>
    );
}
