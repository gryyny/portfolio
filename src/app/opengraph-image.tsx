import { ImageResponse } from "next/og";
import { profile } from "@/content/profile";

export const dynamic = "force-static";
export const alt = `${profile.name}, ${profile.headline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ink = "#0d1424";
const line = "#1e2a44";
const accent = "#8e9bff";

// A still of the arena: the blueprint grid, a commit trail, a check and a bug.
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        color: "#e6ebf5",
        backgroundColor: ink,
        backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
        backgroundSize: "28px 28px",
      }}
    >
      <div style={{ display: "flex", fontSize: 26, color: "#9aa6bf", letterSpacing: 4 }}>
        GRYYNY.SI
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", fontSize: 92, fontWeight: 800, letterSpacing: -2 }}>
          {profile.name}
        </div>
        <div style={{ display: "flex", fontSize: 34, color: accent }}>{profile.headline}</div>
        <div style={{ display: "flex", fontSize: 28, color: "#9aa6bf", maxWidth: 900 }}>
          {profile.summary}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{ width: 16, height: 16, borderRadius: 8, border: `3px solid ${accent}` }}
            />
            <div style={{ width: 56, height: 3, backgroundColor: accent, opacity: 0.5 }} />
          </div>
        ))}
        <div style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: accent }} />
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            border: "3px solid #3dccaa",
            marginLeft: 40,
          }}
        />
        <div
          style={{
            width: 26,
            height: 20,
            borderRadius: 10,
            backgroundColor: "#ff7a4a",
            marginLeft: 24,
          }}
        />
      </div>
    </div>,
    size,
  );
}
