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

// ── Structured preview feedback ────────────────────────────────────────────────
// Shown only on protected-preview results (pv_ result ids). Five 1-5 ratings,
// a yes/no, an optional category and comment — the candidate-evaluation shape
// the preview phase collects. Internal ratings and engine identities are never
// shown or asked about.
// Wave 1 issue categories (schema v2) with tester-facing labels.
const PREVIEW_CATEGORIES = [
  ["NONE", "No issue"],
  ["CRASH_OR_ERROR", "Crash or error"],
  ["IMPOSSIBLE_RESULT", "Impossible result"],
  ["BASKETBALL_CREDIBILITY", "Didn't feel like basketball"],
  ["TEAM_IDENTITY", "Team didn't feel right"],
  ["COACH_IDENTITY", "Coach didn't matter"],
  ["ERA_STYLE", "Era didn't matter"],
  ["POSTGAME_EXPLANATION", "Postgame didn't explain it"],
  ["UI_FRICTION", "Clunky to use"],
  ["MOBILE", "Mobile problem"],
  ["PERFORMANCE", "Slow"],
  ["OTHER", "Other"],
];

const PREVIEW_QUESTIONS = [
  ["resultBelievability", "The result felt believable"],
  ["teamIdentityFeltAccurate", "Each team felt like itself"],
  ["coachDifferenceFeltMeaningful", "The coaches made a real difference"],
  ["eraStyleFeltMeaningful", "The era changed how the game played"],
  ["postgameExplanationHelpful", "The postgame explained the result"],
];

function PreviewFeedback({ ctx }) {
  const [ratings, setRatings] = useState({});
  const [share, setShare] = useState(null);
  const [category, setCategory] = useState("NONE");
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);
  const ready = PREVIEW_QUESTIONS.every(([k]) => ratings[k]) && share !== null;

  const submit = () => {
    track("feedback_submitted", { simulation_id: ctx.simulation_id, preview: true });
    fetch("/api/feedback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "preview", resultId: ctx.resultId,
        scenarioId: ctx.scenarioId || undefined, gameMode: ctx.mode,
        ...ratings, wouldRematchOrShare: share === true,
        issueCategory: category, optionalComment: comment || undefined,
      }),
    }).catch(() => {});
    setDone(true);
  };

  if (done) return <div style={{ marginTop: 14, fontSize: 12, color: T.textDim, textAlign: "center" }}>🙏 Thanks — preview feedback recorded.</div>;
  const pill = (active) => ({ padding: "5px 9px", fontSize: 11.5, borderRadius: 14, cursor: "pointer",
    border: `1px solid ${active ? T.gold : T.border}`, background: active ? T.goldSoft : T.bgCard,
    color: active ? T.gold : T.textDim });
  return (
    <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: T.bgCardHover, border: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>PREVIEW — rate this result (1 = no, 5 = fully)</div>
      {PREVIEW_QUESTIONS.map(([k, label]) => (
        <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 11.5, color: T.textDim }}>{label}</span>
          <span style={{ display: "flex", gap: 4 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setRatings((r) => ({ ...r, [k]: n }))} style={pill(ratings[k] === n)}>{n}</button>
            ))}
          </span>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 11.5, color: T.textDim }}>Would you rematch or share this?</span>
        <span style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setShare(true)} style={pill(share === true)}>yes</button>
          <button onClick={() => setShare(false)} style={pill(share === false)}>no</button>
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
        {PREVIEW_CATEGORIES.map(([k, label]) => (
          <button key={k} onClick={() => setCategory(k)} style={pill(category === k)}>{label}</button>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value.slice(0, 500))}
        placeholder="Optional: anything that felt off or great…" rows={2}
        style={{ width: "100%", marginTop: 8, padding: 8, fontSize: 12, background: T.bg, color: T.text, border: `1px solid ${T.border}`, borderRadius: 7, resize: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
      <button onClick={submit} disabled={!ready} style={{ marginTop: 6, padding: "8px 16px", fontSize: 12, fontWeight: 800, border: "none", borderRadius: 7, background: ready ? T.gold : T.border, color: T.onGold, cursor: ready ? "pointer" : "default" }}>
        Send preview feedback
      </button>
    </div>
  );
}

// ctx: { simulation_id, resultId, mode, my_team (ids), opp_team (ids) }
export function Feedback({ ctx }) {
  if (typeof ctx?.resultId === "string" && ctx.resultId.startsWith("pv_")) {
    return <PreviewFeedback ctx={ctx} />;
  }
  return <BelievabilityFeedback ctx={ctx} />;
}

function BelievabilityFeedback({ ctx }) {
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
              background: category === k ? T.goldSoft : T.bgCard,
              color: category === k ? T.gold : T.textDim,
            }}>{label}</button>
          ))}
        </div>
        <textarea value={comment} onChange={(e) => setComment(e.target.value.slice(0, 280))}
          placeholder="Optional: tell us more…" rows={2}
          style={{ width: "100%", marginTop: 8, padding: 8, fontSize: 12, background: T.bg, color: T.text, border: `1px solid ${T.border}`, borderRadius: 7, resize: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
        <button onClick={submitWhy} style={{ marginTop: 6, padding: "8px 16px", fontSize: 12, fontWeight: 800, border: "none", borderRadius: 7, background: T.gold, color: T.onGold, cursor: "pointer" }}>
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
