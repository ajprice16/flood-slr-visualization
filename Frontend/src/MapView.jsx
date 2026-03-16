
import { useEffect, useRef, useImperativeHandle } from "react";
import maplibregl from "maplibre-gl";

export default function MapView({ floodData, bbox, scenario, year, percentile, resolvedSlr, onBoundsChange, pending, lastRequest, mapRef: externalMapRef }) {
    const mapContainer = useRef(null);
    const mapRef = useRef(null);
    const debounceRef = useRef(null);
    const cityMarkersRef = useRef([]);  // keep references for potential future cleanup
    // Keep a ref to the latest onBoundsChange callback so the map event listeners
    // (registered once at init) always call the current version without needing
    // to re-register on every render.
    const onBoundsChangeRef = useRef(onBoundsChange);
    useEffect(() => { onBoundsChangeRef.current = onBoundsChange; }, [onBoundsChange]);

    // Expose flyTo method to parent
    useImperativeHandle(externalMapRef, () => ({
        flyTo: (coords, zoom) => {
            if (mapRef.current) {
                mapRef.current.flyTo({
                    center: coords,
                    zoom: zoom,
                    duration: 2000,
                    essential: true
                });
            }
        }
    }), []);

    useEffect(() => {
        if (!mapRef.current) {
            mapRef.current = new maplibregl.Map({
                container: mapContainer.current,
                style: {
                    version: 8,
                    sources: {},
                    layers: []
                },
                center: bbox ? [(bbox.lon_min + bbox.lon_max) / 2, (bbox.lat_min + bbox.lat_max) / 2] : [-80.19, 25.76],
                zoom: bbox ? 9 : 9,
            });
            // Emit bounds on load and on move end
            const map = mapRef.current;
            // Add satellite basemap (ESRI World Imagery)
            const addBasemap = () => {
                if (!map.getSource('satellite')) {
                    map.addSource('satellite', {
                        type: 'raster',
                        tiles: [
                            'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                        ],
                        tileSize: 256
                    });
                    map.addLayer({
                        id: 'satellite-layer',
                        type: 'raster',
                        source: 'satellite'
                    });
                }
                // Add city/place labels (ESRI Reference - Boundaries & Places)
                if (!map.getSource('labels')) {
                    map.addSource('labels', {
                        type: 'raster',
                        tiles: [
                            'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
                        ],
                        tileSize: 256
                    });
                    map.addLayer({
                        id: 'labels-layer',
                        type: 'raster',
                        source: 'labels',
                        paint: {
                            'raster-opacity': 0.85
                        }
                    });
                }
            };

            // Add city markers with popups
            const addCityMarkers = async () => {
                const cities = [
                    {
                        name: "Miami",
                        coords: [-80.1918, 25.7617],
                        textFile: "/cities/miami.txt"
                    },
                    {
                        name: "New Orleans",
                        coords: [-90.0715, 29.9511],
                        textFile: "/cities/new-orleans.txt"
                    },
                    {
                        name: "Tabasco, Mexico",
                        coords: [-92.93, 17.99],
                        textFile: "/cities/tabasco-mexico.txt"
                    },
                    {
                        name: "Tokyo",
                        coords: [139.6917, 35.6895],
                        textFile: "/cities/tokyo.txt"
                    },
                    {
                        name: "Bangladesh",
                        coords: [90.4, 22.5],
                        textFile: "/cities/bangladesh.txt"
                    }
                ];

                const escapeHtml = (str) => str
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');

                for (const city of cities) {
                    try {
                        const response = await fetch(city.textFile);
                        const description = await response.text();
                        
                        const popup = new maplibregl.Popup({ offset: 25, closeButton: true })
                            .setHTML(`<div style="padding: 8px; max-width: 250px;">
                                <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">${escapeHtml(city.name)}</h3>
                                <p style="margin: 0; font-size: 12px; line-height: 1.4;">${escapeHtml(description)}</p>
                            </div>`);

                        const marker = new maplibregl.Marker({ color: '#ff6b6b' })
                            .setLngLat(city.coords)
                            .setPopup(popup)
                            .addTo(map);
                        cityMarkersRef.current.push(marker);
                    } catch (error) {
                        console.error(`Failed to load description for ${city.name}:`, error);
                    }
                }
            };

            if (map.isStyleLoaded()) {
                addBasemap();
                addCityMarkers();
            } else {
                map.on('load', () => {
                    addBasemap();
                    addCityMarkers();
                });
            }
            const emitBoundsImmediate = () => {
                const b = map.getBounds();
                const bounds = {
                    lon_min: b.getWest(),
                    lat_min: b.getSouth(),
                    lon_max: b.getEast(),
                    lat_max: b.getNorth(),
                    zoom: map.getZoom()
                };
                onBoundsChangeRef.current && onBoundsChangeRef.current(bounds);
            };
            const emitBoundsDebounced = () => {
                if (debounceRef.current) clearTimeout(debounceRef.current);
                debounceRef.current = setTimeout(() => {
                    emitBoundsImmediate();
                }, 350);
            };
            map.on('load', emitBoundsImmediate);
            map.on('moveend', emitBoundsDebounced);
        }
    }, []);  // map is initialised once; onBoundsChange updates are tracked via ref

    // Update map view when bbox changes
    // Do not recenter on bbox changes; bbox is derived from map view.
    // Keeping user interactions smooth without fighting panning.

    // Points overlay (sampled flooded pixels)
    useEffect(() => {
        if (!floodData || !mapRef.current) return;
        const map = mapRef.current;

        const applyPoints = () => {
            const pixels = Array.isArray(floodData.flooded_pixels) ? floodData.flooded_pixels : [];
            if (!pixels.length) {
                // Remove previous layer/source if exists when no pixels
                if (map.getLayer("flood-points-layer")) map.removeLayer("flood-points-layer");
                if (map.getSource("flood-points")) map.removeSource("flood-points");
                return;
            }
            if (map.getSource("flood-points")) {
                if (map.getLayer("flood-points-layer")) map.removeLayer("flood-points-layer");
                map.removeSource("flood-points");
            }

            const features = pixels.map(p => ({
                type: "Feature",
                geometry: { type: "Point", coordinates: [p.x, p.y] }
            }));

            map.addSource("flood-points", {
                type: "geojson",
                data: { type: "FeatureCollection", features }
            });

            map.addLayer({
                id: "flood-points-layer",
                type: "circle",
                source: "flood-points",
                paint: {
                    "circle-radius": 2,
                    "circle-color": "#0044ff",
                    "circle-opacity": 0.6,
                },
            });
        };

        if (map.isStyleLoaded()) {
            applyPoints();
        } else {
            const onLoad = () => {
                applyPoints();
                map.off('load', onLoad);
            };
            map.on('load', onLoad);
        }
    }, [floodData]);

    // Raster tile layer (flood mask)
    useEffect(() => {
        if (!mapRef.current) return;
        const map = mapRef.current;

        const applyRaster = () => {
            const origin = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:5173';
            const apiBase = origin.includes(':5173') ? origin.replace(':5173', ':8000') : '/api';
            // v=2: cache-bust after NaN dst_arr / bilinear resampling fix
            const tileUrl = `${apiBase}/tiles/{z}/{x}/{y}?scenario=${scenario}&year=${year}&pct=${percentile}&v=3`;

            const hasSlr = resolvedSlr != null && resolvedSlr > 0;
            const desiredOpacity = hasSlr ? 0.7 : 0.0;
            const source = map.getSource("flood-raster");

            if (source) {
                source.setTiles([tileUrl]);
                map.setPaintProperty("flood-raster-layer", "raster-opacity", desiredOpacity);
            } else if (hasSlr) {
                map.addSource("flood-raster", {
                    type: "raster",
                    tiles: [tileUrl],
                    tileSize: 256,
                });
                map.addLayer({
                    id: "flood-raster-layer",
                    type: "raster",
                    source: "flood-raster",
                    paint: {
                        "raster-opacity": desiredOpacity,
                    },
                }, map.getLayer("labels-layer") ? "labels-layer" : undefined);
            }
        };

        if (map.isStyleLoaded()) {
            applyRaster();
        } else {
            const onLoad = () => {
                applyRaster();
                map.off('load', onLoad);
            };
            map.on('load', onLoad);
        }
    }, [scenario, year, percentile, resolvedSlr]);

    return (
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
            <div ref={mapContainer} style={{ position: "absolute", inset: 0 }} />
            <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.55)", color: "#fff", padding: "6px 10px", borderRadius: 4, fontSize: 12, display:"flex", flexDirection:"column", gap:4 }}>
                <div>
                    {pending ? "Analyzing…" : "Ready"}
                    {floodData?.tiles_used && (
                        <span style={{ marginLeft: 8 }}>Tiles: {floodData.tiles_used.length}</span>
                    )}
                </div>
                {lastRequest && (
                    <div style={{
                        color: lastRequest.ok ? "#a8f7a8" : "#ffb3b3"
                    }}>
                        Last: {Math.round(lastRequest.durationMs)}ms (status {lastRequest.status}{lastRequest.error ? " error" : ""})
                    </div>
                )}
            </div>
            <div style={{ 
                position: "absolute", 
                bottom: 8, 
                left: 8, 
                background: "rgba(0,0,0,0.6)", 
                color: "#fff", 
                padding: "6px 10px", 
                borderRadius: 4, 
                fontSize: 10,
                maxWidth: "400px",
                lineHeight: 1.4
            }}>
                <div>© Satellite imagery: <a href="https://www.esri.com" target="_blank" rel="noopener noreferrer" style={{color:"#6cf"}}>Esri</a>, Maxar, Earthstar Geographics</div>
                <div>© Labels: <a href="https://www.esri.com" target="_blank" rel="noopener noreferrer" style={{color:"#6cf"}}>Esri</a>, HERE, Garmin, INCREMENT P</div>
                <div>© DEM: <a href="https://github.com/ddusseau/DiluviumDEM" target="_blank" rel="noopener noreferrer" style={{color:"#6cf"}}>DiluviumDEM</a> (Dusseau et al.)</div>
                <div>© Population: <a href="https://www.worldpop.org" target="_blank" rel="noopener noreferrer" style={{color:"#6cf"}}>WorldPop</a></div>
                <div>© Mapping: <a href="https://maplibre.org" target="_blank" rel="noopener noreferrer" style={{color:"#6cf"}}>MapLibre GL JS</a></div>
            </div>
        </div>
    );
}
 

