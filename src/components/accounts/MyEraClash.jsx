// ── /my-eraclash ────────────────────────────────────────────────────────────
// The career page. Everything on it is real: the totals are derived in the
// database from saved clashes, the mode breakdown shows only modes with actual
// records, and a saved Clash reopens from its own stored snapshot rather than
// being recomputed by a newer candidate.
//
// There is no rank, no contender grade, no percentile and no leaderboard
// position, because none of those exist yet.
import { useCallback, useEffect, useState } from "react";
import { T, R } from "../../theme.js";
import { withProvider } from "../../accounts/provider.js";
import { useAccount, updateDisplayName, initialsOf } from "../../accounts/accountState.js";
import { MAX_DISPLAY_NAME } from "../../accounts/config.js";
import { previewDeviceImport, importDeviceHistory } from "../../accounts/cloudSave.js";
import { unsavedDeviceResultIds, importOfferDismissed, dismissImportOffer } from "../../accounts/deviceResults.js";
import { track } from "../../analytics.js";

const MODE_LABEL = { single: "Dream Matchup", chaos: "Chaos Clash", best7: "Best of 7", 82: "Win 82", daily: "Daily Clash", challenge: "Challenge", tournament: "Tournament" };
const modeName = (m) => MODE_LABEL[m] || String(m || "Clash");
const dateOf = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); } catch { return ""; } };
const OUTCOME_WORD = { win: "Won", loss: "Lost", tie: "Tied" };

export default function MyEraClash({ onOpenReport, onRunItBack, onChallenge, onSignIn }) {
  const account = useAccount();
  const [career, setCareer] = useState(null);
  const [clashes, setClashes] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [notice, setNotice] = useState(null);
  const [importOffer, setImportOffer] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, list] = await Promise.all([
        withProvider((p) => p.career(), null),
        withProvider((p) => p.listSavedClashes({ limit: 25 }), []),
      ]);
      setCareer(c); setClashes(list || []);
      // Offer the device import once, and only when this browser remembers
      // results that are not already in the career.
      if (!importOfferDismissed()) {
        const candidates = unsavedDeviceResultIds((list || []).map((r) => r.result_id));
        if (candidates.length) {
          const preview = await previewDeviceImport({ accessToken: account.session?.accessToken, resultIds: candidates });
          if (preview?.eligible > 0) setImportOffer({ eligible: preview.eligible, ids: candidates });
        }
      }
    } catch { setNotice("Your career could not be loaded just now."); }
    setLoading(false);
  }, [account.session?.accessToken]);

  useEffect(() => {
    if (!account.signedIn) { setLoading(false); return; }
    track("my_eraclash_viewed", {});
    load();
  }, [account.signedIn, load]);

  if (!account.signedIn) {
    return (
      <main aria-labelledby="ec-me-title" style={wrap}>
        <div style={{ ...card, textAlign: "center" }}>
          <h1 id="ec-me-title" style={{ margin: "0 0 8px", fontSize: 22 }}>My EraClash</h1>
          <p style={{ color: T.textDim, fontSize: 13.5, lineHeight: 1.6, margin: "0 0 16px" }}>
            Your career, your saved Clashes and your full game reports live here, on every device you sign in on.
          </p>
          <button onClick={onSignIn} style={primaryBtn}>CREATE FREE ACCOUNT OR SIGN IN</button>
        </div>
      </main>
    );
  }

  const s = career?.summary || { games_played: 0, wins: 0, losses: 0, ties: 0, win_rate: null };
  const streak = career?.streak;

  const saveName = async () => {
    try { await updateDisplayName(nameDraft); setEditing(false); setNotice("Display name updated."); }
    catch (e) { setNotice(e?.code === "DISPLAY_NAME_INVALID" ? "Pick a name with at least one character." : "That name could not be saved."); }
  };
  const runImport = async () => {
    const ids = importOffer?.ids || [];
    setNotice("Importing…");
    const out = await importDeviceHistory({ accessToken: account.session?.accessToken, resultIds: ids });
    track("guest_history_imported", { claimCountBucket: out.imported === 0 ? "0" : out.imported <= 3 ? "1-3" : "4+", success: out.status === "ok" });
    dismissImportOffer(); setImportOffer(null);
    setNotice(out.imported ? `Imported ${out.imported} Clash${out.imported === 1 ? "" : "es"} from this device.` : "Nothing new to import from this device.");
    load();
  };

  return (
    <main aria-labelledby="ec-me-title" style={wrap}>
      {/* Header card: real data only. The email is not an identity field here. */}
      <section style={{ ...card, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <span aria-hidden="true" style={{
          width: 56, height: 56, borderRadius: 14, display: "grid", placeItems: "center", flex: "0 0 auto",
          background: T.goldSoft, color: T.gold, fontWeight: 900, fontSize: 20,
        }}>{initialsOf(account.displayName)}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 id="ec-me-title" style={{ margin: 0, fontSize: 22 }}>{account.displayName}</h1>
          <div style={{ fontSize: 12.5, color: T.textDim, marginTop: 3 }}>
            Free account{account.profile?.created_at ? ` · member since ${dateOf(account.profile.created_at)}` : ""}
          </div>
        </div>
        {editing ? (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label htmlFor="ec-me-name" style={label}>Display name</label>
              <input id="ec-me-name" value={nameDraft} maxLength={MAX_DISPLAY_NAME} onChange={(e) => setNameDraft(e.target.value)} style={input} />
            </div>
            <button onClick={saveName} style={secondaryBtn}>SAVE</button>
            <button onClick={() => setEditing(false)} style={quietBtn}>CANCEL</button>
          </div>
        ) : (
          <button onClick={() => { setNameDraft(account.displayName); setEditing(true); }} style={secondaryBtn}>EDIT NAME</button>
        )}
      </section>

      <div role="status" aria-live="polite" style={{ minHeight: 18, fontSize: 12.5, color: T.textDim, padding: "0 2px" }}>{notice}</div>

      {importOffer && (
        <section aria-labelledby="ec-me-import" style={{ ...card, borderColor: T.goldBorder }}>
          <h2 id="ec-me-import" style={h2}>IMPORT CLASHES FROM THIS DEVICE</h2>
          <p style={{ margin: "6px 0 12px", fontSize: 13, color: T.textDim, lineHeight: 1.6 }}>
            This browser remembers {importOffer.eligible} Clash{importOffer.eligible === 1 ? "" : "es"} that {importOffer.eligible === 1 ? "is" : "are"} not in your career yet.
            Importing is optional, safe to repeat, and only ever claims results this device actually played.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={runImport} style={primaryBtn}>IMPORT {importOffer.eligible} CLASH{importOffer.eligible === 1 ? "" : "ES"}</button>
            <button onClick={() => { dismissImportOffer(); setImportOffer(null); }} style={quietBtn}>NOT NOW</button>
          </div>
        </section>
      )}

      {/* Career summary. Zero games is stated, never dressed up. */}
      <section aria-labelledby="ec-me-career" style={card}>
        <h2 id="ec-me-career" style={h2}>CAREER</h2>
        {loading ? <p style={muted}>Loading your career…</p> : s.games_played === 0 ? (
          <p style={{ ...muted, margin: "6px 0 0" }}>
            No saved Clashes yet. Finish a Chaos Clash and it will be saved here automatically.
          </p>
        ) : (
          <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, margin: "10px 0 0" }}>
            <Stat label="Games played" value={s.games_played} />
            <Stat label="Record" value={`${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ""}`} />
            <Stat label="Win rate" value={s.win_rate == null ? "—" : `${Math.round(s.win_rate * 100)}%`} />
            <Stat label="Current streak" value={streak?.streak_length ? `${streak.streak_length} ${OUTCOME_WORD[streak.streak_outcome] || ""}` : "—"} />
          </dl>
        )}
      </section>

      {/* Mode breakdown: only modes with real records. */}
      {(career?.byMode || []).length > 0 && (
        <section aria-labelledby="ec-me-modes" style={card}>
          <h2 id="ec-me-modes" style={h2}>BY MODE</h2>
          <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "grid", gap: 8 }}>
            {career.byMode.map((m) => (
              <li key={m.mode} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13.5 }}>
                <span>{modeName(m.mode)}</span>
                <span style={{ color: T.textDim }}>{m.games_played} played · {m.wins}-{m.losses}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recent Clashes. */}
      <section aria-labelledby="ec-me-recent" style={card}>
        <h2 id="ec-me-recent" style={h2}>RECENT CLASHES</h2>
        {loading ? <p style={muted}>Loading…</p> : clashes.length === 0 ? (
          <p style={{ ...muted, margin: "6px 0 0" }}>Nothing saved yet.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "grid", gap: 8 }}>
            {clashes.map((c) => {
              const open = expanded === c.result_id;
              return (
                <li key={c.result_id} data-clash={c.result_id} style={{ border: `1px solid ${T.border}`, borderRadius: R.sm, overflow: "hidden" }}>
                  <button aria-expanded={open} aria-controls={`ec-clash-${c.result_id}`}
                    onClick={() => { const next = open ? null : c.result_id; setExpanded(next); if (next) track("recent_clash_expanded", { mode: c.mode }); }}
                    style={{
                      width: "100%", minHeight: 48, display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between",
                      padding: "8px 12px", background: "transparent", border: "none", cursor: "pointer", color: T.text, textAlign: "left", fontSize: 13.5,
                    }}>
                    <span style={{ color: T.textDim, minWidth: 88 }}>{dateOf(c.played_at)}</span>
                    <span style={{ fontWeight: 800, flex: 1, minWidth: 0 }}>{modeName(c.mode)}</span>
                    <span style={{ fontWeight: 900, color: c.outcome === "win" ? "var(--ec-a-green, #2fa96d)" : T.textDim }}>{OUTCOME_WORD[c.outcome]}</span>
                    <span style={{ color: T.textDim }}>{c.gold_score != null ? `${c.gold_score}-${c.blue_score}` : ""}</span>
                    <span style={{ color: T.textDim }}>{c.era_id || ""}</span>
                    <span aria-hidden="true" style={{ color: T.textMuted }}>{open ? "−" : "+"}</span>
                  </button>
                  {open && (
                    <div id={`ec-clash-${c.result_id}`} style={{ padding: "0 12px 12px", fontSize: 12.5, color: T.textDim, lineHeight: 1.7 }}>
                      <Row k="Your five" v={(c.gold_roster || []).map((p) => [p.name, p.pos].filter(Boolean).join(" ") || p.id).join(" · ")} />
                      <Row k="Opponent" v={(c.blue_roster || []).map((p) => [p.name, p.pos].filter(Boolean).join(" ") || p.id).join(" · ") || "Legend Rival"} />
                      <Row k="Coaches" v={[c.gold_coach?.name, c.blue_coach?.name].filter(Boolean).join(" vs ") || "—"} />
                      <Row k="Era" v={c.era_id || "—"} />
                      <Row k="MVP" v={c.mvp?.name ? `${c.mvp.name}${c.mvp.pts ? ` · ${c.mvp.pts} pts` : ""}` : "—"} />
                      <Row k="Simulated by" v={[c.candidate_id, c.calibration_version].filter(Boolean).join(" · ") || "production engine"} />
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                        <button onClick={() => { track("saved_report_opened", { mode: c.mode }); onOpenReport?.(c); }} style={secondaryBtn}>VIEW FULL REPORT</button>
                        {onRunItBack && <button onClick={() => onRunItBack(c)} style={quietBtn}>RUN IT BACK</button>}
                        {onChallenge && c.challenge_fingerprint && <button onClick={() => onChallenge(c)} style={quietBtn}>CHALLENGE THIS CHAOS</button>}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p style={{ fontSize: 11.5, color: T.textMuted, lineHeight: 1.6, padding: "0 2px" }}>
        Your career is private. There is no leaderboard, no rank and no public profile in this version.
        Deleting an account is not yet self-service — ask the operator and it is removed with everything in it.
      </p>
    </main>
  );
}

const Stat = ({ label: l, value }) => (
  <div>
    <dt style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, color: T.textMuted }}>{String(l).toUpperCase()}</dt>
    <dd style={{ margin: "3px 0 0", fontSize: 22, fontWeight: 900, fontFamily: "var(--ec-display)" }}>{value}</dd>
  </div>
);
const Row = ({ k, v }) => (
  <div style={{ display: "flex", gap: 10 }}>
    <span style={{ minWidth: 96, color: T.textMuted, fontWeight: 700 }}>{k}</span>
    <span style={{ minWidth: 0 }}>{v}</span>
  </div>
);

const wrap = { maxWidth: 900, margin: "0 auto", padding: "16px 16px 60px", display: "grid", gap: 12 };
const card = { padding: 18, borderRadius: R.lg, border: `1px solid ${T.border}`, background: T.bgCard };
const h2 = { margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: 1.6, color: T.textDim };
const muted = { fontSize: 13, color: T.textDim, lineHeight: 1.6 };
const label = { display: "block", fontSize: 11, fontWeight: 700, color: T.textDim, marginBottom: 4 };
const input = { minHeight: 44, borderRadius: R.sm, padding: "0 10px", fontSize: 14, border: `1px solid ${T.border}`, background: T.bg, color: T.text };
const primaryBtn = { minHeight: 48, padding: "0 18px", borderRadius: R.sm, cursor: "pointer", fontWeight: 900, fontSize: 13.5, border: `1px solid ${T.goldBorder}`, background: T.gold, color: T.onGold };
const secondaryBtn = { minHeight: 44, padding: "0 14px", borderRadius: R.sm, cursor: "pointer", fontWeight: 800, fontSize: 12.5, border: `1.5px solid ${T.border}`, background: "transparent", color: T.text };
const quietBtn = { minHeight: 44, padding: "0 14px", borderRadius: R.sm, cursor: "pointer", fontWeight: 800, fontSize: 12, border: `1px solid ${T.border}`, background: "transparent", color: T.textDim };
