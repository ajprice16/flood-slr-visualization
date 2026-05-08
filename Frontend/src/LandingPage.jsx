import { useState } from "react";

export default function LandingPage({ onProceed }) {
    const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);

    return (
        <div style={{
            minHeight: "100vh",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            fontFamily: "system-ui, -apple-system, sans-serif"
        }}>
            <div style={{
                maxWidth: "800px",
                width: "100%",
                background: "#fff",
                borderRadius: "8px",
                boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
                overflow: "hidden"
            }}>
                {/* Header */}
                <div style={{
                    padding: "40px 30px",
                    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                    color: "#fff",
                    textAlign: "center"
                }}>
                    <h1 style={{ margin: "0 0 12px 0", fontSize: "2.5em", fontWeight: "700" }}>
                        Flood & Sea Level Rise Visualization
                    </h1>
                    <p style={{ margin: "0", fontSize: "1.1em", opacity: 0.95 }}>
                        Explore projected flood risks under different climate scenarios
                    </p>
                </div>

                {/* Content */}
                <div style={{
                    padding: "40px 30px",
                    maxHeight: "calc(100vh - 200px)",
                    overflowY: "auto"
                }}>
                    {/* Disclaimer Section */}
                    <div style={{ marginBottom: "30px" }}>
                        <h2 style={{
                            fontSize: "1.3em",
                            fontWeight: "600",
                            color: "#333",
                            marginBottom: "15px",
                            borderBottom: "3px solid #667eea",
                            paddingBottom: "10px"
                        }}>
                            ⚠️ Important Disclaimer
                        </h2>
                        <div style={{
                            background: "#f8f9fa",
                            padding: "20px",
                            borderRadius: "6px",
                            lineHeight: "1.7",
                            fontSize: "0.95em",
                            color: "#444"
                        }}>
                            <p>
                                The sea level rise maps and visualizations on this website are intended for general 
                                informational and educational purposes only. The data displayed is sourced from publicly 
                                available scientific datasets and models; while we strive for accuracy, we cannot guarantee 
                                that all information is complete, current, or free from error.
                            </p>
                            <p style={{ marginBottom: "12px" }}>
                                <strong>Projections are estimates, not predictions.</strong> Sea level rise scenarios are 
                                based on scientific models that involve inherent uncertainties, including future greenhouse gas 
                                emissions, ice sheet dynamics, and local land movement. Actual conditions may differ significantly 
                                from what is shown.
                            </p>
                            <p style={{ marginBottom: "12px" }}>
                                <strong>This tool is not a substitute for professional advice.</strong> The visualizations should 
                                not be used as the sole basis for property, insurance, engineering, emergency management, or any 
                                other professional decision-making. If you are assessing flood risk or planning for coastal resilience, 
                                please consult qualified professionals and refer to official assessments from agencies such as NOAA, 
                                FEMA, or your local government.
                            </p>
                            <p style={{ marginBottom: "12px" }}>
                                <strong>Local conditions vary.</strong> Maps may not reflect localized factors such as land subsidence, 
                                storm surge, or infrastructure changes that can significantly affect real-world flood risk.
                            </p>
                            <p style={{ marginBottom: "0" }}>
                                By using this website, you acknowledge that the creators assume no liability for decisions made 
                                based on the information provided here.
                            </p>
                        </div>

                        {/* Acceptance Checkbox */}
                        <div style={{
                            display: "flex",
                            alignItems: "center",
                            marginTop: "20px",
                            gap: "10px"
                        }}>
                            <input
                                type="checkbox"
                                id="acceptDisclaimer"
                                checked={disclaimerAccepted}
                                onChange={(e) => setDisclaimerAccepted(e.target.checked)}
                                style={{ width: "18px", height: "18px", cursor: "pointer" }}
                            />
                            <label htmlFor="acceptDisclaimer" style={{
                                cursor: "pointer",
                                fontSize: "0.95em",
                                color: "#555"
                            }}>
                                I acknowledge and accept the disclaimer
                            </label>
                        </div>
                    </div>

                    {/* CTA Button */}
                    <button
                        onClick={onProceed}
                        disabled={!disclaimerAccepted}
                        style={{
                            width: "100%",
                            padding: "14px 20px",
                            fontSize: "1em",
                            fontWeight: "600",
                            background: disclaimerAccepted 
                                ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" 
                                : "#ccc",
                            color: "#fff",
                            border: "none",
                            borderRadius: "6px",
                            cursor: disclaimerAccepted ? "pointer" : "not-allowed",
                            transition: "all 0.3s ease",
                            marginBottom: "30px",
                            boxShadow: disclaimerAccepted ? "0 4px 15px rgba(102,126,234,0.3)" : "none"
                        }}
                    >
                        Proceed to Interactive Map
                    </button>

                    {/* Resources Section */}
                    <div style={{
                        paddingTop: "30px",
                        borderTop: "2px solid #eee"
                    }}>
                        <h3 style={{
                            fontSize: "1.1em",
                            fontWeight: "600",
                            color: "#333",
                            marginBottom: "20px"
                        }}>
                            📚 Resources & Links
                        </h3>
                        <div style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "15px"
                        }}>
                            {/* Documentation */}
                            <a
                                href="https://github.com/ajprice16/flood-slr-visualization/wiki"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    padding: "20px",
                                    background: "#f0f4ff",
                                    borderRadius: "6px",
                                    textDecoration: "none",
                                    border: "2px solid transparent",
                                    transition: "all 0.3s ease",
                                    cursor: "pointer"
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = "#e3ecff";
                                    e.currentTarget.style.borderColor = "#667eea";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "#f0f4ff";
                                    e.currentTarget.style.borderColor = "transparent";
                                }}
                            >
                                <div style={{
                                    fontSize: "1.2em",
                                    marginBottom: "8px"
                                }}>
                                    📖
                                </div>
                                <div style={{
                                    fontWeight: "600",
                                    color: "#667eea",
                                    marginBottom: "4px"
                                }}>
                                    Documentation
                                </div>
                                <div style={{
                                    fontSize: "0.85em",
                                    color: "#666"
                                }}>
                                    Learn how to use the tool
                                </div>
                            </a>

                            {/* GitHub Repository */}
                            <a
                                href="https://github.com/ajprice16/flood-slr-visualization"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    padding: "20px",
                                    background: "#f5f5f5",
                                    borderRadius: "6px",
                                    textDecoration: "none",
                                    border: "2px solid transparent",
                                    transition: "all 0.3s ease",
                                    cursor: "pointer"
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = "#e8e8e8";
                                    e.currentTarget.style.borderColor = "#333";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "#f5f5f5";
                                    e.currentTarget.style.borderColor = "transparent";
                                }}
                            >
                                <div style={{
                                    fontSize: "1.2em",
                                    marginBottom: "8px"
                                }}>
                                    🔗
                                </div>
                                <div style={{
                                    fontWeight: "600",
                                    color: "#333",
                                    marginBottom: "4px"
                                }}>
                                    GitHub Repository
                                </div>
                                <div style={{
                                    fontSize: "0.85em",
                                    color: "#666"
                                }}>
                                    View source code
                                </div>
                            </a>

                            {/* Data Sources */}
                            <a
                                href="https://www.ipcc.ch/"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    padding: "20px",
                                    background: "#fff3e0",
                                    borderRadius: "6px",
                                    textDecoration: "none",
                                    border: "2px solid transparent",
                                    transition: "all 0.3s ease",
                                    cursor: "pointer"
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = "#ffe8cc";
                                    e.currentTarget.style.borderColor = "#ff9800";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "#fff3e0";
                                    e.currentTarget.style.borderColor = "transparent";
                                }}
                            >
                                <div style={{
                                    fontSize: "1.2em",
                                    marginBottom: "8px"
                                }}>
                                    🌍
                                </div>
                                <div style={{
                                    fontWeight: "600",
                                    color: "#ff9800",
                                    marginBottom: "4px"
                                }}>
                                    IPCC Data
                                </div>
                                <div style={{
                                    fontSize: "0.85em",
                                    color: "#666"
                                }}>
                                    IPCC Climate Projections
                                </div>
                            </a>

                            {/* NOAA Resources */}
                            <a
                                href="https://www.noaa.gov/"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    padding: "20px",
                                    background: "#e3f2fd",
                                    borderRadius: "6px",
                                    textDecoration: "none",
                                    border: "2px solid transparent",
                                    transition: "all 0.3s ease",
                                    cursor: "pointer"
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = "#bbdefb";
                                    e.currentTarget.style.borderColor = "#2196f3";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "#e3f2fd";
                                    e.currentTarget.style.borderColor = "transparent";
                                }}
                            >
                                <div style={{
                                    fontSize: "1.2em",
                                    marginBottom: "8px"
                                }}>
                                    🌊
                                </div>
                                <div style={{
                                    fontWeight: "600",
                                    color: "#2196f3",
                                    marginBottom: "4px"
                                }}>
                                    NOAA Resources
                                </div>
                                <div style={{
                                    fontSize: "0.85em",
                                    color: "#666"
                                }}>
                                    Official flood/SLR data
                                </div>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
