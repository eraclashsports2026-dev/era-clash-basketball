// ── Believability feedback ─────────────────────────────────────────────────────
// "Did this result feel believable?" — one tap, no login. Negative answers get
// an optional category + comment. Feeds the simulation calibration system.
import { useState } from "react";
import { T } from "../theme.js";
import { getUid } from "../identity.js";
import { track } from "../analytics.js";
import { VERSIONS } from "../versions.js";

const CATEGORIES = [
  ["player_rating_wrong", "Player rating seems wrong"],
  ["chemistry_wrong", "Chemistry seems wrong"],
  ["result_unrealistic", "Result seems unrealistic"],
  ["box_score_wrong", "Box score seems wrong"],
  ["player_data_wrong", "Player position/data is wrong"],
  ["other", "Other"],
];

const send = (body) => {
  fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
};

// ctx: { simulation_id, mode, my_team (ids), opp_team (ids) }
export function Feedback({ ctx }) {
  const [stage, setStage] = useState("ask"); // ask | why | done
  const [category, setCategory] = useState(null);
  const [comment, setComment] = useState("");

  const base = { ...ctx, uid: getUid(), versions: VERSIONS };

  const answer = (believable) => {
    track("feedback_submitted", { simulation_id: ctx.simulation_id, believable });
    if (believable) { send({ ...base, believable: true }); setStage("done"); }
    else setStage("why");
  };
  const submitWhy = () => {
    send({ ...base, believable: false, category: category || "other", comment: comment || undefined });
    setStage("done");
  };

  if (stage === "done") {
    return <div style={{ marginTop: 14, fontSize: 12, color: T.textDim, textAlign: "center" }}>🙏 Thanks — this tunes the sim engine.</div>;
  }
  if (stage === "why") {
    return (
      <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: T.bgCardHover, border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>What seemed wrong?</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {CATEGORIES.map(([k, label]) => (
            <button key={k} onClick={() => setCategory(k)} style={{
              padding: "6px 10px", fontSize: 11.5, borderRadius: 16, cursor: "pointer",
              border: `1px solid ${category === k ? T.gold : T.border}`,
              background: category === k ? "#2b230a" : "transparent",
              color: category === k ? T.gold : T.textDim,
            }}>{label}</button>
          ))}
        </div>
        <textarea value={comment} onChange={(e) => setComment(e.target.value.slice(0, 280))}
          placeholder="Optional: tell us more…" rows={2}
          style={{ width: "100%", marginTop: 8, padding: 8, fontSize: 12, background: T.bg, color: T.text, border: `1px solid ${T.border}`, borderRadius: 7, resize: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
        <button onClick={submitWhy} style={{ marginTop: 6, padding: "8px 16px", fontSize: 12, fontWeight: 800, border: "none", borderRadius: 7, background: T.gold, color: "#111", cursor: "pointer" }}>
          Send feedback
        </button>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 12.5, color: T.textDim }}>
      <span>Did this result feel believable?</span>
      <button onClick={() => answer(true)} aria-label="Yes, believable" style={{ padding: "6px 12px", fontSize: 14, borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", cursor: "pointer" }}>👍</button>
      <button onClick={() => answer(false)} aria-label="No, not believable" style={{ padding: "6px 12px", fontSize: 14, borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", cursor: "pointer" }}>👎</button>
    </div>
  );
}
