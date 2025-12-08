import { useState, useEffect } from "react";

export default function StoryMap({ stories, currentIndex, onNavigate, onClose }) {
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

    return (
        <div style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "400px",
            maxHeight: "100%",
            background: "rgba(255, 255, 255, 0.95)",
            boxShadow: "2px 0 10px rgba(0,0,0,0.3)",
            display: "flex",
            flexDirection: "column",
            zIndex: 1000
        }}>
            {/* Header */}
            <div style={{
                padding: "16px 20px",
                borderBottom: "1px solid #ddd",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#fff"
            }}>
                <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "600" }}>
                    {story.name}
                </h2>
                <button
                    onClick={onClose}
                    style={{
                        background: "none",
                        border: "none",
                        fontSize: "24px",
                        cursor: "pointer",
                        color: "#666",
                        padding: "0 4px"
                    }}
                >×</button>
            </div>

            {/* Media */}
            {story.media && (
                <div style={{ 
                    width: "100%", 
                    height: "200px", 
                    overflow: "hidden",
                    background: "#f5f5f5"
                }}>
                    {story.media.endsWith('.mp4') || story.media.endsWith('.webm') ? (
                        <video 
                            src={story.media} 
                            controls 
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                    ) : (
                        <img 
                            src={story.media} 
                            alt={story.name}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                    )}
                </div>
            )}

            {/* Content */}
            <div style={{
                flex: 1,
                padding: "20px",
                overflowY: "auto",
                fontSize: "14px",
                lineHeight: "1.6"
            }}>
                {loading ? (
                    <p style={{ color: "#999" }}>Loading...</p>
                ) : (
                    <div style={{ whiteSpace: "pre-wrap" }}>{content}</div>
                )}
            </div>

            {/* Navigation */}
            <div style={{
                padding: "16px 20px",
                borderTop: "1px solid #ddd",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#fff"
            }}>
                <button
                    onClick={() => onNavigate(currentIndex - 1)}
                    disabled={currentIndex === 0}
                    style={{
                        padding: "8px 16px",
                        border: "1px solid #ddd",
                        background: currentIndex === 0 ? "#f5f5f5" : "#fff",
                        cursor: currentIndex === 0 ? "not-allowed" : "pointer",
                        borderRadius: "4px",
                        fontSize: "14px"
                    }}
                >← Previous</button>

                <span style={{ fontSize: "12px", color: "#666" }}>
                    {currentIndex + 1} / {stories.length}
                </span>

                <button
                    onClick={() => onNavigate(currentIndex + 1)}
                    disabled={currentIndex === stories.length - 1}
                    style={{
                        padding: "8px 16px",
                        border: "1px solid #ddd",
                        background: currentIndex === stories.length - 1 ? "#f5f5f5" : "#fff",
                        cursor: currentIndex === stories.length - 1 ? "not-allowed" : "pointer",
                        borderRadius: "4px",
                        fontSize: "14px"
                    }}
                >Next →</button>
            </div>
        </div>
    );
}
