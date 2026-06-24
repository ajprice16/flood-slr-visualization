// Design tokens for the Sea Level Explorer redesign.
// Source: Claude Design project "Flood visualization UI redesign" (Frame 06 — Foundations).

export const font = {
    display: "'Space Grotesk', system-ui, sans-serif",   // headings, big numerals
    body: "'IBM Plex Sans', system-ui, sans-serif",       // body & UI
    mono: "'IBM Plex Mono', ui-monospace, monospace",     // data labels, coordinates
};

export const color = {
    // neutrals — ink & surface
    ink: "#102433",
    ink2: "#33424C",
    muted: "#5A6B77",
    subtle: "#8A97A0",
    faint: "#9AA7B0",
    line: "#E4E8EC",
    line2: "#EDF0F2",
    surface: "#F5F7F8",
    surfaceAlt: "#F2F4F6",
    // brand & signal
    ocean: "#0E4B70",
    tide: "#2BA4C9",
    signal: "#D85A3B",
    caution: "#C77A1A",
    danger: "#A6322A",
    // panel
    panel: "rgba(255,255,255,0.97)",
    glass: "rgba(255,255,255,0.94)",
};

export const shadow = {
    panel: "0 8px 30px rgba(16,36,51,0.18)",
    chip: "0 2px 10px rgba(16,36,51,0.14)",
    primary: "0 4px 14px rgba(14,75,112,0.4)",
    modal: "0 20px 60px rgba(0,0,0,0.4)",
};

export const radius = {
    panel: 16,
    card: 11,
    control: 10,
    chip: 12,
};

// Per-scenario metadata: dot color, IPCC AR6 best-estimate warming, severity descriptor.
export const SCENARIO_META = {
    ssp126: { code: "SSP1-2.6", temp: "~1.8°C", descriptor: "Very Low", dot: "#2E6E8E", accent: "#0E4B70", tint: "#EAF2F6" },
    ssp245: { code: "SSP2-4.5", temp: "~2.7°C", descriptor: "Intermediate", dot: "#D69A2D", accent: "#B07A14", tint: "#FBF3E2" },
    ssp370: { code: "SSP3-7.0", temp: "~3.6°C", descriptor: "High", dot: "#CC6A38", accent: "#B5532A", tint: "#FBEEE6" },
    ssp585: { code: "SSP5-8.5", temp: "~4.4°C", descriptor: "Very High", dot: "#A6322A", accent: "#A6322A", tint: "#FBEEEA" },
};

// Shared style fragments.
export const panelStyle = {
    background: color.panel,
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    borderRadius: radius.panel,
    boxShadow: shadow.panel,
    border: "1px solid rgba(255,255,255,0.6)",
};

export const labelStyle = {
    fontFamily: font.mono,
    fontSize: "10.5px",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: color.subtle,
};
