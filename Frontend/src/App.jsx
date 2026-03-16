
import { useCallback, useEffect, useRef, useState } from "react";
import MapView from "./MapView";
import StoryMap from "./StoryMap";
import { analyzeRegion, fetchResolvedSlr } from "./api";

const SCENARIO_LABELS = {
    ssp126: "SSP1-2.6 (Very Low)",
    ssp245: "SSP2-4.5 (Intermediate)",
    ssp370: "SSP3-7.0 (High)",
    ssp585: "SSP5-8.5 (Very High)",
};

export default function App() {
    const [bbox, setBbox] = useState(null);
    const [scenario, setScenario] = useState("ssp245");
    const [year, setYear] = useState(2100);
    const [percentile, setPercentile] = useState(50);
    const [resolvedSlr, setResolvedSlr] = useState(null);
    const [floodData, setFloodData] = useState(null);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState(null);
    const [zoom, setZoom] = useState(9);
    const [lastRequest, setLastRequest] = useState(null);
    const [forceRefresh, setForceRefresh] = useState(0);
    const [storyMode, setStoryMode] = useState(false);
    const [currentStory, setCurrentStory] = useState(0);
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
            .then(result => {
                if (!cancelled) setResolvedSlr(result.data);
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
                const result = await analyzeRegion(bbox, { scenario, year, percentile }, { signal: controller.signal });
                setFloodData(result.data);
                setLastRequest({ status: result.status, ok: result.ok, durationMs: result.durationMs });
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
            const result = await analyzeRegion(bbox, { scenario, year, percentile }, { signal: controller.signal });
            setFloodData(result.data);
            setLastRequest({ status: result.status, ok: result.ok, durationMs: result.durationMs });
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

    const effectiveSlr = resolvedSlr?.slr_meters ?? null;

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
                <h2 style={{ margin: "0 0 12px 0" }}>IPCC Projections</h2>

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
                    <label style={{ fontWeight: "600", fontSize: "0.85em" }}>Confidence</label>
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
                            Effective SLR: {resolvedSlr.slr_meters?.toFixed(2)}m
                        </div>
                        <div>IPCC projection: {resolvedSlr.ipcc_slr_meters?.toFixed(2)}m</div>
                        <div>VLM correction: {resolvedSlr.vlm_offset_meters > 0 ? "+" : ""}{resolvedSlr.vlm_offset_meters?.toFixed(3)}m</div>
                        <div style={{ fontSize: "0.9em", color: "#666", marginTop: "2px" }}>
                            Source: {resolvedSlr.projection_source === "regional" ? "Regional" : "Global mean"}
                            {resolvedSlr.vlm_source !== "none" && ` + ${resolvedSlr.vlm_source === "gps_midas" ? "GPS" : "GIA"} VLM`}
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
                    onClick={() => setForceRefresh(prev => prev + 1)}
                    style={{marginTop:"4px", padding:"8px 12px", cursor:"pointer", background:"#007acc", color:"#fff", border:"none", borderRadius:"4px", width:"100%"}}
                >
                    Refresh Analysis
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
                        <div><strong>Flooded Pixels:</strong> {floodData.flooded_count?.toLocaleString()}</div>
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
                        <button
                            onClick={cancelAndRestart}
                            disabled={!bbox || pending}
                            style={{marginTop:"8px", padding:"6px 10px", fontSize:"12px", cursor:"pointer"}}
                        >
                            Reanalyze current view
                        </button>
                    </div>
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
                    onBoundsChange={handleBoundsChange}
                    pending={pending}
                    lastRequest={lastRequest}
                    mapRef={mapRef}
                />
            </div>
        </div>
    );
}
