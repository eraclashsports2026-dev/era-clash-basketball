// ── Wave 2 structured feedback (Phase 9A.3) ──────────────────────────────────
// One panel, two homes: under a preview result (task-aware, result-bound) and
// in the arena's Help dialog (for the lobby, placement and comparison tasks).
// The tester picks the task they just did; only that task's ratings are shown.
// Identity is never asked for: the server takes tester, cohort, wave, candidate
// and build from the signed session and the deployment, and IGNORES any
// identity field a client might send.
import { useMemo, useState } from "react";
import { T } from "../theme.js";
import { track } from "../analytics.js";
import { currentBuild } from "../buildStamp.js";
import { WAVE2, WAVE2_TASKS, WAVE2_TASK_IDS, WAVE2_RATINGS, WAVE2_ISSUE_CATEGORIES, WAVE2_ISSUE_LABELS, WAVE2_COMMENT_MAX } from "../wave2.js";

const pill = (on) => ({
  minHeight: 36, minWidth: 36, padding: "0 10px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 800,
  border: `1px solid ${on ? T.goldBorder : T.border}`, background: on ? T.goldSoft : T.bgCard, color: on ? T.gold : T.textDim,
});

/**
 * @param resultId   the pv_ result on screen, when the panel sits under a result
 * @param defaultTask the task chip to preselect
 * @param onSent     optional callback after a 2xx
 */
export default function Wave2Feedback({ resultId = null, defaultTask = null, onSent }) {
  const groups = useMemo(() => ({
    "First time here": WAVE2_TASK_IDS.filter((id) => WAVE2_TASKS[id].cohort === "first-time"),
    "Returning tester": WAVE2_TASK_IDS.filter((id) => WAVE2_TASKS[id].cohort === "returning"),
    "": ["FREE"],
  }), []);
  const [task, setTask] = useState(defaultTask || (resultId ? "N2" : "N1"));
  const [ratings, setRatings] = useState({});
  const [category, setCategory] = useState("NONE");
  const [comment, setComment] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | sent | error
  const def = WAVE2_TASKS[task];
  const fields = def.ratings;
  const ready = fields.every((f) => ratings[f]) && (!def.needsResult || !!resultId);

  const submit = async () => {
    if (!ready || state === "sending") return;
    setState("sending");
    const body = { kind: "wave2", taskId: task, resultId: resultId || undefined, ratings: Object.fromEntries(fields.map((f) => [f, ratings[f]])), issueCategory: category, optionalComment: comment.trim() || undefined, clientBuildStamp: currentBuild() || "dev" };
    try {
      const r = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (r.ok) { setState("sent"); track("feedback_submitted", { kind: "wave2", task_id: task, has_result: !!resultId }); onSent?.(); }
      else setState("error");
    } catch { setState("error"); }
  };

  return (
    <section aria-label="Wave 2 feedback" data-wave2-feedback="true" style={{ marginTop: 16, padding: 14, borderRadius: 12, border: `1px solid ${T.border}`, background: T.bgCard, color: T.text }}>
      <div style={{ fontSize: 10.5, letterSpacing: 2, fontWeight: 900, color: T.gold }}>WAVE 2 FEEDBACK</div>
      <div style={{ fontSize: 12.5, color: T.textDim, marginTop: 3, lineHeight: 1.5 }}>Which step did you just do? Rate a few statements from 1 (no) to 5 (yes). One submission per step; a resubmission replaces it.</div>

      <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
        {Object.entries(groups).map(([label, ids]) => (
          <div key={label || "free"} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {label && <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: T.textMuted, marginRight: 4 }}>{label.toUpperCase()}</span>}
            {ids.map((id) => (
              <button key={id} onClick={() => { setTask(id); setRatings({}); setState("idle"); }} aria-pressed={task === id} style={pill(task === id)}>{id === "FREE" ? "Anything else" : `${id} · ${WAVE2_TASKS[id].label}`}</button>
            ))}
          </div>
        ))}
      </div>

      {def.needsResult && !resultId && (
        <div role="status" style={{ marginTop: 10, fontSize: 12.5, color: T.textDim }}>This step is rated from a finished game: open a result and find this panel under it.</div>
      )}

      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {fields.map((f) => (
          <div key={f} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8, alignItems: "center" }}>
            <span id={`w2-${f}`} style={{ fontSize: 13, lineHeight: 1.4 }}>{WAVE2_RATINGS[f]}</span>
            <div role="group" aria-labelledby={`w2-${f}`} style={{ display: "flex", gap: 4 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRatings((r) => ({ ...r, [f]: n }))} aria-pressed={ratings[f] === n} aria-label={`${n} of 5`} style={pill(ratings[f] === n)}>{n}</button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, fontSize: 11, fontWeight: 800, letterSpacing: 1.2, color: T.textDim }}>ANYTHING WRONG?</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
        {WAVE2_ISSUE_CATEGORIES.map((k) => (
          <button key={k} onClick={() => setCategory(k)} aria-pressed={category === k} style={pill(category === k)}>{WAVE2_ISSUE_LABELS[k]}</button>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value.slice(0, WAVE2_COMMENT_MAX))} maxLength={WAVE2_COMMENT_MAX} rows={2} aria-label="Optional comment"
        placeholder="Optional: what confused you, or what you liked. No personal details, please." style={{ width: "100%", marginTop: 8, padding: 8, borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 13, boxSizing: "border-box" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
        <button onClick={submit} disabled={!ready || state === "sending"} style={{ minHeight: 44, padding: "0 18px", borderRadius: 9, border: "none", fontWeight: 900, fontSize: 13, letterSpacing: 0.6, cursor: ready ? "pointer" : "default", background: ready ? T.gold : T.border, color: T.onGold }}>
          {state === "sending" ? "Sending…" : "Send Wave 2 feedback"}
        </button>
        {state === "sent" && <span role="status" style={{ fontSize: 12.5, color: T.green, fontWeight: 700 }}>Wave 2 feedback recorded — thank you.</span>}
        {state === "error" && <span role="alert" style={{ fontSize: 12.5, color: T.red }}>That didn't send. Try again in a moment.</span>}
        <span style={{ fontSize: 11, color: T.textMuted, marginLeft: "auto" }}>{comment.length}/{WAVE2_COMMENT_MAX} · {WAVE2.waveId}</span>
      </div>
    </section>
  );
}
