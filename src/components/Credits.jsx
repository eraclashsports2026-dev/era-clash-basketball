// ── Image credits ──────────────────────────────────────────────────────────────
// Legally required attribution surface, generated from the approved-image
// registry. Every approved real photograph is listed with creator, source,
// and license. Reached from the footer ("Image credits").
import approvedData from "../images/approved.json";
import { T, card } from "../theme.js";

export default function Credits() {
  const images = approvedData.images.filter((i) => i.approved_for_product);
  return (
    <div style={{ ...card, padding: 20 }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>📷 Image Credits</h2>
      <p style={{ fontSize: 12.5, color: T.textDim, margin: "0 0 14px", lineHeight: 1.6 }}>
        Player photographs on EraClash come from verified open-license or public-domain sources, each with
        recorded provenance. Players without an approved photograph are shown with an EraClash silhouette —
        never a generated likeness.
      </p>
      {images.length === 0 ? (
        <div style={{ fontSize: 13, color: T.textDim }}>
          No licensed photographs are in use yet — all players currently display EraClash silhouettes.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: T.textDim, textAlign: "left" }}>
                <th style={{ padding: 6 }}>PLAYER</th><th style={{ padding: 6 }}>CREATOR</th>
                <th style={{ padding: 6 }}>SOURCE</th><th style={{ padding: 6 }}>LICENSE</th>
              </tr>
            </thead>
            <tbody>
              {images.map((i) => (
                <tr key={i.id} style={{ borderTop: `1px solid ${T.border}` }}>
                  <td style={{ padding: 6, fontWeight: 700 }}>{i.player_name} <span style={{ color: T.textDim }}>({i.season_or_decade})</span></td>
                  <td style={{ padding: 6 }}>{i.creator || "Unknown"}</td>
                  <td style={{ padding: 6 }}><a href={i.source_page} target="_blank" rel="noreferrer" style={{ color: T.blue }}>{i.source_name}</a></td>
                  <td style={{ padding: 6 }}>{i.license_url
                    ? <a href={i.license_url} target="_blank" rel="noreferrer" style={{ color: T.blue }}>{i.license_name}</a>
                    : i.license_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
