
import { useEffect, useRef, useState } from "react";
import MapView from "./MapView";
import StoryMap from "./StoryMap";
import { analyzeRegion } from "./api";

export default function App() {
    const [bbox, setBbox] = useState(null);
    const [slr, setSlr] = useState(1);
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
            slr: 1,
            textFile: "/cities/miami.txt",
            media: null
        },
        {
            name: "New Orleans",
            coords: [-90.0715, 29.9511],
            zoom: 11,
            slr: 2,
            textFile: "/cities/new-orleans.txt",
            media: null
        },
        {
            name: "Tokyo",
            coords: [139.6917, 35.6895],
            zoom: 11,
            slr: 1.5,
            textFile: "/cities/tokyo.txt",
            media: null
        },
        {
            name: "Tabasco, Mexico",
            coords: [-92.93, 17.99],
            zoom: 8,
            slr: 1.5,
            textFile: "/cities/tabasco-mexico.txt",
            media: null
        },
        {
            name: "Bangladesh",
            coords: [90.4, 22.5],
            zoom: 8,
            slr: 1,
            textFile: "/cities/bangladesh.txt",
            media: null
        }
    ];

    const navigateToStory = (index) => {
        if (index < 0 || index >= stories.length) return;
        const story = stories[index];
        setCurrentStory(index);
        setSlr(story.slr);
        if (mapRef.current) {
            mapRef.current.flyTo(story.coords, story.zoom);
        }
    };

    const handleStoryNavigation = (index) => {
        navigateToStory(index);
    };

    // Debounced analysis on bbox or slr change (skip extremely broad views)
    useEffect(() => {
        if (!bbox) return; // wait until map emits bounds
        if (slr === 0) {
            // Short-circuit: no network call, clear flood visuals
            setFloodData({ flooded_pixels: [], tiles_used: [], flood_ratio: 0, flooded_count: 0, total_valid: 0 });
            setPending(false);
            setLastRequest({ status: 0, ok: true, durationMs: 0 });
            setError(null);
            return;
        }
        const lonSpan = Math.abs(bbox.lon_max - bbox.lon_min);
        const latSpan = Math.abs(bbox.lat_max - bbox.lat_min);
        if (lonSpan > 40 || latSpan > 40) return; // avoid analyzing global spans
        setError(null);
        setPending(true);
        const controller = new AbortController();
        controllerRef.current = controller;
        const handle = setTimeout(async () => {
            const start = performance.now();
            try {
                const result = await analyzeRegion(bbox, slr, { signal: controller.signal });
                setFloodData(result.data);
                setLastRequest({ status: result.status, ok: result.ok, durationMs: result.durationMs });
            } catch (e) {
                if (e.name === 'AbortError') return; // ignore canceled requests
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
    }, [bbox?.lon_min, bbox?.lat_min, bbox?.lon_max, bbox?.lat_max, slr, forceRefresh]);

    const cancelAndRestart = async () => {
        try {
            if (controllerRef.current) controllerRef.current.abort();
        } catch {}
        if (!bbox) return;
        // Trigger immediate analysis without debounce
        setPending(true);
        const controller = new AbortController();
        controllerRef.current = controller;
        const start = performance.now();
        try {
            const result = await analyzeRegion(bbox, slr, { signal: controller.signal });
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

    const handleBoundsChange = (bounds) => {
        // bounds: { lon_min, lat_min, lon_max, lat_max, zoom? }
        setBbox(bounds);
        if (bounds.zoom != null) setZoom(bounds.zoom);
    };

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
                    onNavigate={handleStoryNavigation}
                    onClose={() => setStoryMode(false)}
                />
            )}

            {/* Sidebar - hide in story mode */}
            {!storyMode && (
                <div style={{ width: "300px", padding: "15px", background: "#eee" }}>
                <h2>SLR Viewer</h2>
                <div style={{ marginBottom: "10px" }}>
                    <strong>Region:</strong> determined by current map view
                    <div style={{ fontSize: "0.85em", marginTop: "6px" }}>
                        {bbox ? (
                            <div>
                                <div>Lon: {bbox.lon_min.toFixed(3)} → {bbox.lon_max.toFixed(3)}</div>
                                <div>Lat: {bbox.lat_min.toFixed(3)} → {bbox.lat_max.toFixed(3)}</div>
                                <div>Zoom: {zoom.toFixed(1)}</div>
                            </div>
                        ) : (
                            <div>Pan/zoom the map to set bounds.</div>
                        )}
                    </div>
                </div>

                <br/><br/>
                <label>Sea Level Rise (m)</label>
                <input type="range" min="0" max="5" step="0.25" value={slr} onChange={e => setSlr(parseFloat(e.target.value))} />
                <div>{slr.toFixed(2)} m</div>

                <button 
                    onClick={() => setForceRefresh(prev => prev + 1)}
                    style={{marginTop:"12px", padding:"8px 12px", cursor:"pointer", background:"#007acc", color:"#fff", border:"none", borderRadius:"4px"}}
                >
                    Refresh Analysis
                </button>

                {pending && <div style={{marginTop:"10px"}}>Analyzing...</div>}
                {error && <div style={{color:"red"}}>Error: {error}</div>}
                {!pending && bbox && (Math.abs(bbox.lon_max - bbox.lon_min) > 40 || Math.abs(bbox.lat_max - bbox.lat_min) > 40) && (
                    <div style={{marginTop:"8px", color:"#555", fontSize:"0.85em"}}>
                        View is too broad. Zoom in or narrow the map to analyze flooding.
                    </div>
                )}

                {floodData && (
                    <div style={{marginTop:"15px", fontSize:"0.9em"}}>
                        <h3 style={{margin:"4px 0"}}>Stats</h3>
                        <div><strong>Tiles Used:</strong> {floodData.tiles_used?.length || 0}</div>
                        <div><strong>Flood Ratio:</strong> {(floodData.flood_ratio*100).toFixed(2)}%</div>
                        <div><strong>Flooded Count:</strong> {floodData.flooded_count}</div>
                        <div><strong>Total Valid:</strong> {floodData.total_valid}</div>
                        <div><strong>Elevation Min:</strong> {floodData.elevation_min?.toFixed(2)}</div>
                        <div><strong>Elevation Max:</strong> {floodData.elevation_max?.toFixed(2)}</div>
                        <div><strong>Elevation Mean:</strong> {floodData.elevation_mean?.toFixed(2)}</div>
                        {floodData.estimated_population_affected != null && (
                            <div style={{marginTop:"8px", padding:"8px", background:"#fff3cd", borderRadius:"4px"}}>
                                <strong>Est. Population Affected:</strong><br/>
                                <span style={{fontSize:"1.1em", color:"#856404"}}>
                                    {floodData.estimated_population_affected.toLocaleString()} people
                                </span>
                            </div>
                        )}
                        {lastRequest && (
                            <div style={{marginTop:"6px"}}>
                                <strong>Last Request:</strong> {Math.round(lastRequest.durationMs)} ms (status {lastRequest.status}){lastRequest.error ? ' - failed' : ''}
                            </div>
                        )}
                        <div style={{marginTop:"10px"}}>
                            <button onClick={cancelAndRestart} disabled={!bbox || pending}>
                                Cancel pending and reanalyze current view
                            </button>
                        </div>
                    </div>
                )}
            </div>
            )}

            <div style={{ flex: 1 }}>
                <MapView 
                    floodData={floodData} 
                    bbox={bbox} 
                    slr={slr} 
                    onBoundsChange={handleBoundsChange} 
                    pending={pending} 
                    lastRequest={lastRequest}
                    mapRef={mapRef}
                />
            </div>
        </div>
    );
}
