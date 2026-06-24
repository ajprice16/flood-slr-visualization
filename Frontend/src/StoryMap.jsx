import { useState, useEffect } from "react";
import { font, color, radius, shadow, SCENARIO_META } from "./theme";

const SCENARIO_LABELS = {
    ssp126: "SSP1-2.6 (Very Low)",
    ssp245: "SSP2-4.5 (Intermediate)",
    ssp370: "SSP3-7.0 (High)",
    ssp585: "SSP5-8.5 (Very High)",
};

export default function StoryMap({ stories, currentIndex, onNavigate, onClose, scenario, year, percentile, resolvedSlr }) {
    const [content, setContent] = useState("");
    const [loading, setLoading] = useState(false);
    const story = stories[currentIndex];

    useEffect(() => {
        if (!story?.textFile) {
            setContent(story?.description || "");
            return;
        }

        setLoading(true);
        fetch(story.textFile)
            .then(res => res.text())
            .then(text => {
                setContent(text);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to load story content:", err);
                setContent(story.description || "Content unavailable");
                setLoading(false);
            });
    }, [story]);

    if (!story) return null;

    const meta = SCENARIO_META[scenario];
    const atFirst = currentIndex === 0;
    const atLast = currentIndex === stories.length - 1;

    return (
        <div style={{
            position: "absolute",
            top: 28,
            left: 28,
            bottom: 28,
            width: 404,
            background: "#fff",
            borderRadius: 18,
            boxShadow: "0 14px 44px rgba(16,36,51,0.26)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            zIndex: 1600,
            fontFamily: font.body,
        }}>
            {/* Media / title header */}
            <div style={{
                height: 188,
                position: "relative",
                flexShrink: 0,
                background: story.media
                    ? `url('${story.media}') center/cover no-repeat`
                    : "linear-gradient(135deg, #0E4B70, #102433)",
            }}>
                {story.media && (story.media.endsWith('.mp4') || story.media.endsWith('.webm')) && (
                    <video src={story.media} controls style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                )}
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(11,24,34,0.1), rgba(11,24,34,0.55))" }} />
                <button
                    type="button"
                    aria-label="Close story panel"
                    onClick={onClose}
                    style={{
                        position: "absolute", top: 16, right: 16, width: 32, height: 32,
                        border: "none", borderRadius: 9, background: "rgba(255,255,255,0.92)",
                        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                        fontSize: 20, color: color.muted, lineHeight: 1,
                    }}
                >×</button>
                <div style={{ position: "absolute", left: 20, bottom: 16, right: 20 }}>
                    <div style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.8)" }}>
                        Story {String(currentIndex + 1).padStart(2, "0")} / {String(stories.length).padStart(2, "0")}
                    </div>
                    <div style={{ fontFamily: font.display, fontSize: 30, fontWeight: 600, color: "#fff", letterSpacing: "-0.01em", marginTop: 3, textShadow: "0 2px 12px rgba(0,0,0,0.4)" }}>
                        {story.name}
                    </div>
                </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, padding: "22px 24px 8px", overflowY: "auto" }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 8, background: color.surfaceAlt, fontSize: 11.5, fontWeight: 600, color: color.muted }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: meta?.dot || color.ocean }} />
                        {meta?.code || scenario} · {year}
                    </span>
                    {resolvedSlr?.slr_meters != null && (
                        <span style={{ padding: "5px 11px", borderRadius: 8, background: "#EAF2F6", fontFamily: font.mono, fontSize: 11.5, fontWeight: 500, color: color.ocean }}>
                            {resolvedSlr.slr_meters.toFixed(2)} m rise
                        </span>
                    )}
                </div>
                {loading ? (
                    <p style={{ color: color.subtle }}>Loading…</p>
                ) : (
                    <div style={{ whiteSpace: "pre-wrap", fontSize: 14.5, lineHeight: 1.62, color: color.ink2 }}>{content}</div>
                )}
            </div>

            {/* Scenario info */}
            <div style={{ padding: "12px 24px", borderTop: `1px solid ${color.line2}`, background: "#F0F7FF", fontSize: 13, flexShrink: 0 }}>
                <div style={{ fontWeight: 600, marginBottom: 4, color: color.ink }}>
                    {SCENARIO_LABELS[scenario] || scenario} — {year}
                </div>
                {resolvedSlr?.slr_meters != null && (
                    <div style={{ fontSize: 12, color: color.muted }}>
                        <div>Sea level rise: {resolvedSlr.slr_meters.toFixed(2)}m ({percentile}th percentile)</div>
                        <div>Source: IPCC AR6</div>
                    </div>
                )}
            </div>

            {/* Progress + navigation */}
            <div style={{ padding: "16px 24px 20px", borderTop: `1px solid ${color.line2}`, flexShrink: 0 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                    {stories.map((_, i) => (
                        <span key={i} style={{ flex: i === currentIndex ? 2 : 1, height: 4, borderRadius: 2, background: i <= currentIndex ? color.ocean : color.line }} />
                    ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <button
                        type="button"
                        aria-label="Previous story"
                        onClick={() => onNavigate(currentIndex - 1)}
                        disabled={atFirst}
                        style={{
                            display: "flex", alignItems: "center", gap: 7, height: 40, padding: "0 14px",
                            border: `1px solid ${color.line}`, borderRadius: radius.control,
                            background: atFirst ? color.surface : "#fff",
                            color: atFirst ? color.faint : color.ink,
                            cursor: atFirst ? "not-allowed" : "pointer", font: `500 13px ${font.body}`,
                        }}
                    >← Previous</button>
                    <span style={{ fontFamily: font.mono, fontSize: 12, color: color.subtle }}>
                        {currentIndex + 1} / {stories.length}
                    </span>
                    <button
                        type="button"
                        aria-label="Next story"
                        onClick={() => onNavigate(currentIndex + 1)}
                        disabled={atLast}
                        style={{
                            display: "flex", alignItems: "center", gap: 7, height: 40, padding: "0 16px",
                            border: "none", borderRadius: radius.control,
                            background: atLast ? color.surface : color.ocean,
                            color: atLast ? color.faint : "#fff",
                            cursor: atLast ? "not-allowed" : "pointer", font: `600 13px ${font.body}`,
                        }}
                    >Next →</button>
                </div>
            </div>
        </div>
    );
}
