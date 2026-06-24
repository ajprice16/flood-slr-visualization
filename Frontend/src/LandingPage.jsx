import { useState } from "react";
import { font, color, radius, shadow } from "./theme";

const RESOURCES = [
    {
        href: "https://github.com/ajprice16/flood-slr-visualization/wiki",
        title: "Documentation",
        subtitle: "Learn how to use the tool",
        tint: "#EAF2F6", stroke: color.ocean,
    },
    {
        href: "https://github.com/ajprice16/flood-slr-visualization",
        title: "GitHub Repository",
        subtitle: "View source code",
        tint: color.surfaceAlt, stroke: color.ink2,
    },
    {
        href: "https://doi.org/10.5281/zenodo.6382554",
        title: "IPCC AR6 SLR Dataset",
        subtitle: "Garner et al., 2022 (Zenodo)",
        tint: "#FBF3E2", stroke: color.caution,
    },
    {
        href: "https://coast.noaa.gov/slr/",
        title: "NOAA SLR Viewer",
        subtitle: "coast.noaa.gov/slr/",
        tint: "#EAF2F6", stroke: color.tide,
    },
];

export default function LandingPage({ onProceed }) {
    const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);

    return (
        <div style={{ minHeight: "100vh", display: "flex", background: "#F7F8F9", fontFamily: font.body, color: color.ink }}>
            {/* Left visual panel */}
            <div style={{
                flex: "0 0 42%", minWidth: 340, position: "relative", flexShrink: 0,
                background: "linear-gradient(150deg, #0A2A40, #0B1C2A)",
                padding: "44px 40px", display: "flex", flexDirection: "column",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"><path d="M2 8c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2"/><path d="M2 14c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2"/></svg>
                    </div>
                    <span style={{ fontFamily: font.display, fontWeight: 600, fontSize: 16, color: "#fff" }}>Sea Level Rise Explorer</span>
                </div>

                <div style={{ marginTop: "auto" }}>
                    <h1 style={{ margin: 0, fontFamily: font.display, fontSize: 38, fontWeight: 600, lineHeight: 1.12, color: "#fff", letterSpacing: "-0.02em" }}>
                        Sea Level Rise Explorer
                    </h1>
                    <p style={{ margin: "18px 0 0", fontSize: 15, lineHeight: 1.6, color: "rgba(255,255,255,0.8)" }}>
                        An interactive map of coastal inundation under future sea-level rise, computed live from published climate science.
                    </p>
                    <div style={{ marginTop: 30, display: "flex", gap: 26 }}>
                        {[
                            { value: "4", label: "SSP scenarios" },
                            { value: "2030–2150", label: "projection range" },
                            { value: "5", label: "city stories" },
                        ].map((s) => (
                            <div key={s.label}>
                                <div style={{ fontFamily: font.display, fontSize: 24, fontWeight: 600, color: "#fff" }}>{s.value}</div>
                                <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.65)" }}>{s.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right content */}
            <div style={{ flex: 1, padding: "48px 52px", display: "flex", flexDirection: "column", overflowY: "auto", maxHeight: "100vh" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={color.caution} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
                    <span style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: color.caution, fontWeight: 500 }}>Before you start</span>
                </div>
                <h2 style={{ margin: "0 0 14px", fontFamily: font.display, fontSize: 23, fontWeight: 600, color: color.ink }}>
                    Important Disclaimer
                </h2>

                <div style={{ background: "#FBF7EF", border: "1px solid #F0E4CC", borderRadius: 14, padding: "20px 22px", lineHeight: 1.6, fontSize: 13.5, color: "#5A4A30" }}>
                    <p style={{ margin: "0 0 12px" }}>
                        The sea level rise maps and visualizations on this website are intended for general
                        informational and educational purposes only. The dataset displayed is sourced from publicly
                        available scientific datasets and models; while we strive for accuracy, we cannot guarantee
                        that all information is complete, current, or free from error.
                    </p>
                    <p style={{ margin: "0 0 12px" }}>
                        <strong style={{ color: "#3D3320" }}>Projections are estimates, not predictions.</strong> Sea level rise scenarios are
                        based on scientific models that involve inherent uncertainties, including future greenhouse gas
                        emissions, ice sheet dynamics, and local land movement. Actual conditions may differ significantly
                        from what is shown.
                    </p>
                    <p style={{ margin: "0 0 12px" }}>
                        <strong style={{ color: "#3D3320" }}>This tool is not a substitute for professional advice.</strong> The visualizations should
                        not be used as the sole basis for property, insurance, engineering, emergency management, or any
                        other professional decision-making. If you are assessing flood risk or planning for coastal resilience,
                        please consult qualified professionals and refer to official assessments from agencies such as NOAA,
                        FEMA, or your local government.
                    </p>
                    <p style={{ margin: "0 0 12px" }}>
                        <strong style={{ color: "#3D3320" }}>Local conditions vary.</strong> Maps may not reflect localized factors such as land subsidence,
                        storm surge, or infrastructure changes that can significantly affect real-world flood risk.
                    </p>
                    <p style={{ margin: 0 }}>
                        By using this website, you acknowledge that the creators assume no liability for decisions made
                        based on the information provided here.
                    </p>
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: 12, margin: "22px 0 18px", cursor: "pointer", fontSize: 14, color: color.ink2 }}>
                    <input
                        type="checkbox"
                        checked={disclaimerAccepted}
                        onChange={(e) => setDisclaimerAccepted(e.target.checked)}
                        style={{ width: 20, height: 20, cursor: "pointer", flexShrink: 0, accentColor: color.ocean }}
                    />
                    I acknowledge and accept the disclaimer
                </label>

                <button
                    onClick={onProceed}
                    disabled={!disclaimerAccepted}
                    style={{
                        width: "100%", height: 52, border: "none", borderRadius: 13,
                        background: disclaimerAccepted ? color.ocean : "#CDD4DA",
                        boxShadow: disclaimerAccepted ? shadow.primary : "none",
                        font: `600 15px ${font.body}`, color: "#fff",
                        cursor: disclaimerAccepted ? "pointer" : "not-allowed",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                        transition: "background 0.25s ease",
                    }}
                >
                    Proceed to Interactive Map
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                </button>

                <div style={{ marginTop: 32, paddingTop: 28, borderTop: `1px solid ${color.line2}` }}>
                    <div style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: color.faint, marginBottom: 12 }}>
                        Resources &amp; Links
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        {RESOURCES.map((r) => (
                            <a
                                key={r.title}
                                href={r.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    display: "flex", alignItems: "center", gap: 11, padding: "13px 14px",
                                    border: `1px solid ${color.line}`, borderRadius: radius.card, background: "#fff",
                                    textDecoration: "none",
                                }}
                            >
                                <div style={{ width: 32, height: 32, borderRadius: 8, background: r.tint, flexShrink: 0 }} />
                                <div style={{ lineHeight: 1.2 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: color.ink }}>{r.title}</div>
                                    <div style={{ fontSize: 11, color: color.subtle }}>{r.subtitle}</div>
                                </div>
                            </a>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
