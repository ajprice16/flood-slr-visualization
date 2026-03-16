/**
 * Minimal maplibre-gl mock for jsdom test environment.
 * MapLibre requires WebGL which is unavailable in jsdom, so we stub the
 * classes used by MapView.jsx.
 */

export const mapInstance = {
    getSource: vi.fn(() => null),
    addSource: vi.fn(),
    getLayer: vi.fn(() => null),
    addLayer: vi.fn(),
    removeSource: vi.fn(),
    removeLayer: vi.fn(),
    getBounds: vi.fn(function() {
        return {
            getWest: function() { return -81; },
            getEast: function() { return -79; },
            getSouth: function() { return 24; },
            getNorth: function() { return 26; },
        };
    }),
    getZoom: vi.fn(function() { return 9; }),
    flyTo: vi.fn(),
    isStyleLoaded: vi.fn(function() { return true; }),
    on: vi.fn(function(event, fn) {
        if (event === 'load') fn();
    }),
    off: vi.fn(),
    setPaintProperty: vi.fn(),
};

export class Map {
    constructor() {
        Object.assign(this, mapInstance);
    }
}

export class Popup {
    constructor() { this._html = ''; }
    setHTML(html) { this._html = html; return this; }
    addTo() { return this; }
}

export class Marker {
    constructor() {}
    setLngLat() { return this; }
    setPopup() { return this; }
    addTo() { return this; }
}

export default { Map, Popup, Marker };
