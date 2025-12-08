import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from './ErrorBoundary';
import "maplibre-gl/dist/maplibre-gl.css";

// Instrument fetch for network diagnostics
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const start = performance.now();
  try {
    const res = await originalFetch(...args);
    const duration = (performance.now() - start).toFixed(0);
    if (typeof args[0] === 'string' && args[0].includes('/analyze_region')) {
      console.log(`[analyze_region] ${res.status} ${duration}ms ->`, args[0]);
    }
    return res;
  } catch (err) {
    const duration = (performance.now() - start).toFixed(0);
    if (typeof args[0] === 'string' && args[0].includes('/analyze_region')) {
      if (err && err.name === 'AbortError') {
        console.log(`[analyze_region] CANCELED ${duration}ms ->`, args[0]);
      } else {
        console.error(`[analyze_region] ERROR ${duration}ms ->`, args[0], err);
      }
    }
    throw err;
  }
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
