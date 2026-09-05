// ── /my-eraclash — the persistent career home (Career V2) ───────────────────
// A sports-career destination, not an admin panel. Five tabs: Overview, Clash
// History, Saved Rosters, Favorites, Account. Everything on it is real: totals
// are derived in the database, a saved report reopens from its own snapshot,
// and where there is nothing the page says so.
//
// What the browser writes here — a saved roster, a favorite, a preference — it
// writes directly under RLS through the provider. Nothing on this page can
// influence a simulation. Account deletion is the one action that goes through
// the server, and it is gated by reauthentication and a typed confirmation.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { T, R } from "../../theme.js";
import { withProvider } from "../../accounts/provider.js";
import { useAccount, updateDisplayName, initialsOf } from "../../accounts/accountState.js";
import { MAX_DISPLAY_NAME } from "../../accounts/config.js";
import { previewDeviceImport, importDeviceHistory } from "../../accounts/cloudSave.js";
import { unsavedDeviceResultIds, deviceResultCount, importOfferDismissed, dismissImportOffer } from "../../accounts/deviceResults.js";
import { assembleAccountExport, deleteAccountRequest } from "../../accounts/careerCloud.js";
import {
  CAREER_TABS, CAREER_TAB_IDS, tabFromSearch, modeName,
  HISTORY_FILTERS, HISTORY_SORTS, HISTORY_PAGE_SIZE, defaultHistoryFilters,
  erasInHistory, applyHistoryFilters, sortHistory, pageOf,
  suggestRosterName, SAVED_ROSTER_LIMIT_FREE, rosterLimitReached, MAX_ROSTER_NAME,
  replayCapability, PREF_SCHEMA, PREF_KEYS, PREF_DEFAULTS, mergePrefs,
  reconciliationState, RECONCILIATION,
  DELETION_PHRASE, DELETION_REMOVES, DELETION_RETAINS, needsReauthentication,
} from "../../accounts/careerV2.js";
import { track } from "../../analytics.js";
import ChallengesTab from "../challenges/ChallengesTab.jsx";   // Phase 9C

const dateOf = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); } catch { return ""; } };
const OUTCOME_WORD = { win: "Won", loss: "Lost", tie: "Tied" };
const WIN_GREEN = "var(--ec-a-green, #2fa96d)";

export default function MyEraClash({ onOpenReport, onRunItBack, onSaveRoster, onSignIn, onSignedOut }) {
  const account = useAccount();
  const [tab, setTab] = useState(() => tabFromSearch(typeof window !== "undefined" ? window.location.search : ""));
  const [data, setData] = useState({ career: null, clashes: [], rosters: [], prefs: PREF_DEFAULTS, activity: [] });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [importOffer, setImportOffer] = useState(null);

  const token = account.session?.accessToken || null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [career, clashes, rosters, prefs, activity] = await Promise.all([
        withProvider((p) => p.career(), null),
        withProvider((p) => p.listSavedClashes({ limit: 1000 }), []),
        withProvider((p) => p.listRosters(), []),
        withProvider((p) => p.getPreferences(), {}),
        withProvider((p) => p.recentActivity(5), []),
      ]);
      setData({ career, clashes: clashes || [], rosters: rosters || [], prefs: mergePrefs(prefs, {}), activity: activity || [] });
      if (!importOfferDismissed()) {
        const candidates = unsavedDeviceResultIds((clashes || []).map((r) => r.result_id));
        if (candidates.length) {
          const preview = await previewDeviceImport({ accessToken: token, resultIds: candidates });
          if (preview?.eligible > 0) setImportOffer({ eligible: preview.eligible, ids: candidates });
        }
      }
    } catch { setNotice("Your career could not be loaded just now."); }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (!account.signedIn) { setLoading(false); return; }
    track("my_eraclash_viewed", {});
    load();
  }, [account.signedIn, load]);

  const goTab = (id) => {
    if (!CAREER_TAB_IDS.includes(id) || id === tab) { if (id === tab) return; }
    setTab(id);
    try { const u = new URL(window.location.href); u.searchParams.set("tab", id); window.history.replaceState({}, "", u); } catch { /* ignore */ }
    if (id === "history") track("career_history_viewed", {});
  };

  const flash = (msg) => { setNotice(msg); };

  if (!account.signedIn) {
    return (
      <main aria-labelledby="ec-me-title" style={wrap}>
        <div style={{ ...card, textAlign: "center" }}>
          <h1 id="ec-me-title" style={{ margin: "0 0 8px", fontSize: 22 }}>My EraClash</h1>
          <p style={{ color: T.textDim, fontSize: 13.5, lineHeight: 1.6, margin: "0 0 16px" }}>
            Your career, your saved Clashes, your rosters and your favorites live here, on every device you sign in on.
          </p>
          <button onClick={onSignIn} style={primaryBtn}>CREATE FREE ACCOUNT OR SIGN IN</button>
        </div>
      </main>
    );
  }

  const shared = { data, setData, loading, token, account, flash, load, onOpenReport, onRunItBack, onSaveRoster, importOffer, setImportOffer };

  return (
    <main aria-labelledby="ec-me-title" style={wrap}>
      <header style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <span aria-hidden="true" style={avatar}>{initialsOf(account.displayName)}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 id="ec-me-title" style={{ margin: 0, fontSize: 24, fontFamily: "var(--ec-display)" }}>My EraClash</h1>
          <div style={{ fontSize: 12.5, color: T.textDim, marginTop: 2 }}>{account.displayName} · Free account</div>
        </div>
      </header>

      <nav role="tablist" aria-label="My EraClash sections" style={tabRow}>
        {CAREER_TABS.map((t) => (
          <button key={t.id} role="tab" id={`ec-tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`ec-panel-${t.id}`}
            onClick={() => goTab(t.id)} style={tabBtn(tab === t.id)}>{t.label}</button>
        ))}
      </nav>

      <div role="status" aria-live="polite" style={{ minHeight: 18, fontSize: 12.5, color: T.textDim, padding: "0 2px" }}>{notice}</div>

      <div role="tabpanel" id={`ec-panel-${tab}`} aria-labelledby={`ec-tab-${tab}`}>
        {tab === "overview" && <Overview {...shared} goTab={goTab} />}
        {tab === "history" && <History {...shared} />}
        {tab === "rosters" && <Rosters {...shared} />}
        {tab === "favorites" && <Favorites {...shared} />}
        {tab === "challenges" && <ChallengesTab accessToken={token} displayName={account.displayName} />}
        {tab === "account" && <Account {...shared} onSignedOut={onSignedOut} />}
      </div>
    </main>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────
function Overview({ data, loading, account, flash, load, importOffer, setImportOffer, token, goTab }) {
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const s = data.career?.summary || { games_played: 0, wins: 0, losses: 0, ties: 0, win_rate: null };
  const streak = data.career?.streak;
  const longest = data.career?.longestWinStreak || 0;

  const saveName = async () => {
    try { await updateDisplayName(nameDraft); setEditing(false); flash("Display name updated."); }
    catch (e) { flash(e?.code === "DISPLAY_NAME_INVALID" ? "Pick a name with at least one character." : "That name could not be saved."); }
  };
  const runImport = async () => {
    const ids = importOffer?.ids || [];
    flash("Importing…");
    const out = await importDeviceHistory({ accessToken: token, resultIds: ids });
    track("device_history_imported", { imported: Math.min(out.imported || 0, 99), refused: Math.min(out.refused || 0, 99) });
    dismissImportOffer(); setImportOffer(null);
    flash(out.imported ? `Imported ${out.imported} Clash${out.imported === 1 ? "" : "es"} from this device.` : "Nothing new to import from this device.");
    load();
  };

  return (
    <div style={grid}>
      <section style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <SectionLabel>Identity</SectionLabel>
            <div style={{ fontSize: 20, fontWeight: 900, marginTop: 6 }}>{account.displayName}</div>
            <div style={{ fontSize: 12.5, color: T.textDim, marginTop: 2 }}>
              Free account{account.profile?.created_at ? ` · joined ${dateOf(account.profile.created_at)}` : ""}
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
            <button onClick={() => { setNameDraft(account.displayName); setEditing(true); }} style={secondaryBtn}>EDIT PROFILE</button>
          )}
        </div>
      </section>

      {importOffer && (
        <section style={{ ...card, borderColor: T.goldBorder }}>
          <SectionLabel>Import Clashes from this device</SectionLabel>
          <p style={{ margin: "6px 0 12px", fontSize: 13, color: T.textDim, lineHeight: 1.6 }}>
            This browser remembers {importOffer.eligible} Clash{importOffer.eligible === 1 ? "" : "es"} not in your career yet.
            Importing is optional, safe to repeat, and only ever claims results this device actually played.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={runImport} style={primaryBtn}>IMPORT {importOffer.eligible} CLASH{importOffer.eligible === 1 ? "" : "ES"}</button>
            <button onClick={() => { dismissImportOffer(); setImportOffer(null); }} style={quietBtn}>NOT NOW</button>
          </div>
        </section>
      )}

      <section style={card}>
        <SectionLabel>Career</SectionLabel>
        {loading ? <p style={muted}>Loading your career…</p> : s.games_played === 0 ? (
          <p style={{ ...muted, margin: "8px 0 0" }}>No saved Clashes yet. Finish a Chaos Clash and it is saved here automatically.</p>
        ) : (
          <dl style={statGrid}>
            <Stat label="Games played" value={s.games_played} />
            <Stat label="Record" value={`${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ""}`} />
            <Stat label="Win rate" value={s.win_rate == null ? "—" : `${Math.round(s.win_rate * 100)}%`} />
            <Stat label="Current streak" value={streak?.streak_length ? `${streak.streak_length} ${OUTCOME_WORD[streak.streak_outcome] || ""}` : "—"} />
            <Stat label="Longest win streak" value={longest > 0 ? `${longest}` : "—"} />
          </dl>
        )}
      </section>

      {(data.career?.byMode || []).length > 0 && (
        <section style={card}>
          <SectionLabel>By mode</SectionLabel>
          <ul style={list}>
            {data.career.byMode.map((m) => (
              <li key={m.mode} style={rowBetween}>
                <span style={{ fontWeight: 700 }}>{modeName(m.mode)}</span>
                <span style={{ color: T.textDim }}>{m.games_played} played · {m.wins}-{m.losses}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section style={card}>
        <SectionLabel>Recent activity</SectionLabel>
        {loading ? <p style={muted}>Loading…</p> : (data.activity || []).length === 0 ? (
          <p style={{ ...muted, margin: "8px 0 0" }}>Nothing yet. Playing, saving a roster or favoriting a Clash shows up here.</p>
        ) : (
          <ul style={list}>
            {data.activity.map((a, i) => (
              <li key={i} style={rowBetween}>
                <span>{ACTIVITY_WORD[a.kind] || a.kind} {a.label ? <span style={{ color: T.textDim }}>· {modeName(a.label) || a.label}</span> : null}</span>
                <span style={{ color: T.textMuted, fontSize: 12 }}>{dateOf(a.occurred_at)}</span>
              </li>
            ))}
          </ul>
        )}
        {s.games_played > 0 && <button onClick={() => goTab("history")} style={{ ...quietBtn, marginTop: 12 }}>OPEN CLASH HISTORY</button>}
      </section>
    </div>
  );
}
const ACTIVITY_WORD = {
  clash_saved: "Clash saved", clash_favorited: "Clash favorited", roster_saved: "Roster saved",
  roster_renamed: "Roster renamed", roster_favorited: "Roster favorited", display_name_changed: "Display name changed",
};

// ── Clash History ─────────────────────────────────────────────────────────────
function History({ data, loading, onOpenReport, onRunItBack, flash, setData, token }) {
  const [filters, setFilters] = useState(defaultHistoryFilters);
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(null);

  const eras = useMemo(() => erasInHistory(data.clashes), [data.clashes]);
  const filtered = useMemo(() => sortHistory(applyHistoryFilters(data.clashes, filters), sort), [data.clashes, filters, sort]);
  const view = useMemo(() => pageOf(filtered, page, HISTORY_PAGE_SIZE), [filtered, page]);

  const setF = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(0); track("career_filter_changed", Object.keys(patch).reduce((o, k) => ({ ...o, [k]: String(patch[k]) }), {})); };

  const toggleFavorite = async (c) => {
    const next = !c.favorite;
    setData((d) => ({ ...d, clashes: d.clashes.map((r) => (r.result_id === c.result_id ? { ...r, favorite: next } : r)) }));
    try { await withProvider((p) => p.setClashFavorite(c.result_id, next)); track("saved_clash_favorited", { favorite: next }); }
    catch { setData((d) => ({ ...d, clashes: d.clashes.map((r) => (r.result_id === c.result_id ? { ...r, favorite: !next } : r)) })); flash("That favorite could not be saved."); }
  };
  const saveRoster = async (c) => {
    try {
      const row = await withProvider((p) => p.saveRoster({
        displayName: suggestRosterName(c.gold_roster), roster: c.gold_roster, coach: c.gold_coach,
        sourceMode: c.mode, sourceResultId: c.result_id, eraPreference: c.era_id,
      }));
      if (row) { setData((d) => ({ ...d, rosters: [row, ...d.rosters] })); track("roster_saved", { source: "history" }); flash(`Saved “${row.display_name}” to your rosters.`); }
    } catch (e) { flash(e?.code === "ROSTER_LIMIT_REACHED" ? `You have ${SAVED_ROSTER_LIMIT_FREE} saved rosters. Delete one before saving another.` : "That roster could not be saved."); }
  };

  if (loading) return <div style={card}><p style={muted}>Loading your Clashes…</p></div>;
  if ((data.clashes || []).length === 0) return <div style={card}><SectionLabel>Clash history</SectionLabel><p style={{ ...muted, margin: "8px 0 0" }}>Nothing saved yet. Finish a Chaos Clash and it appears here.</p></div>;

  return (
    <div style={grid}>
      <section style={card}>
        <div style={filterWrap}>
          <Select label="Mode" value={filters.mode} onChange={(v) => setF({ mode: v })} options={HISTORY_FILTERS.mode.map((m) => [m, m === "all" ? "All modes" : modeName(m)])} />
          <Select label="Outcome" value={filters.outcome} onChange={(v) => setF({ outcome: v })} options={HISTORY_FILTERS.outcome.map((o) => [o, o === "all" ? "All outcomes" : OUTCOME_WORD[o]])} />
          {eras.length > 1 && <Select label="Era" value={filters.era} onChange={(v) => setF({ era: v })} options={[["all", "All eras"], ...eras.map((e) => [e, e])]} />}
          <Select label="When" value={filters.range} onChange={(v) => setF({ range: v })} options={[["all", "All time"], ["30d", "Last 30 days"], ["recent", "Last 7 days"]]} />
          <Select label="Sort" value={sort} onChange={(v) => { setSort(v); setPage(0); }} options={HISTORY_SORTS.map((s2) => [s2, SORT_LABEL[s2]])} />
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 12, color: T.textMuted }}>
          {view.total} Clash{view.total === 1 ? "" : "es"}{view.total !== data.clashes.length ? ` of ${data.clashes.length}` : ""}
        </p>
      </section>

      {view.rows.length === 0 ? (
        <div style={card}><p style={muted}>No Clashes match these filters.</p></div>
      ) : view.rows.map((c) => {
        const open = expanded === c.result_id;
        const cap = replayCapability(c);
        return (
          <section key={c.result_id} data-clash={c.result_id} style={{ ...card, padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px" }}>
              <button aria-expanded={open} aria-controls={`ec-clash-${c.result_id}`} onClick={() => { const n = open ? null : c.result_id; setExpanded(n); if (n) track("recent_clash_expanded", { mode: c.mode }); }}
                style={rowButton}>
                <span style={{ color: T.textDim, minWidth: 82, fontSize: 12.5 }}>{dateOf(c.played_at)}</span>
                <span style={{ fontWeight: 800, flex: 1, minWidth: 0 }}>{modeName(c.mode)}</span>
                <span style={{ fontWeight: 900, color: c.outcome === "win" ? WIN_GREEN : T.textDim }}>{OUTCOME_WORD[c.outcome]}</span>
                <span style={{ color: T.textDim, minWidth: 54, textAlign: "right" }}>{c.gold_score != null ? `${c.gold_score}-${c.blue_score}` : ""}</span>
                <span aria-hidden="true" style={{ color: T.textMuted, width: 14, textAlign: "center" }}>{open ? "−" : "+"}</span>
              </button>
              <button onClick={() => toggleFavorite(c)} aria-pressed={!!c.favorite} aria-label={c.favorite ? "Remove favorite" : "Add favorite"} style={starBtn(c.favorite)}>{c.favorite ? "★" : "☆"}</button>
            </div>
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
                  {cap.runItBack && onRunItBack && <button onClick={() => { track("run_it_back_started", { mode: c.mode }); onRunItBack(c); }} style={quietBtn}>RUN IT BACK</button>}
                  <button onClick={() => saveRoster(c)} style={quietBtn}>SAVE ROSTER</button>
                </div>
                <p style={{ margin: "8px 0 0", fontSize: 11, color: T.textMuted }} title={cap.exact.message}>
                  Run It Back plays the same five, coaches and era with a new game seed.
                </p>
              </div>
            )}
          </section>
        );
      })}

      {view.pages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12 }}>
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={view.page === 0} style={pagerBtn}>Newer</button>
          <span style={{ fontSize: 12.5, color: T.textDim }}>Page {view.page + 1} of {view.pages}</span>
          <button onClick={() => setPage((p) => Math.min(view.pages - 1, p + 1))} disabled={view.page >= view.pages - 1} style={pagerBtn}>Older</button>
        </div>
      )}
    </div>
  );
}
const SORT_LABEL = { newest: "Newest first", oldest: "Oldest first", margin: "Biggest margin", closest: "Closest game" };

// ── Saved Rosters ─────────────────────────────────────────────────────────────
function Rosters({ data, loading, setData, flash, onRunItBack }) {
  const [renaming, setRenaming] = useState(null);
  const [nameDraft, setNameDraft] = useState("");
  const rosters = data.rosters || [];

  const rename = async (r) => {
    try {
      const row = await withProvider((p) => p.renameRoster(r.id, nameDraft));
      if (row) { setData((d) => ({ ...d, rosters: d.rosters.map((x) => (x.id === r.id ? row : x)) })); track("roster_renamed", {}); flash("Roster renamed."); }
      setRenaming(null);
    } catch (e) { flash(e?.code === "ROSTER_NAME_INVALID" ? "Pick a name with at least one character." : "That roster could not be renamed."); }
  };
  const remove = async (r) => {
    if (!window.confirm(`Delete “${r.display_name}”? This cannot be undone.`)) return;
    setData((d) => ({ ...d, rosters: d.rosters.filter((x) => x.id !== r.id) }));
    try { await withProvider((p) => p.deleteRoster(r.id)); track("roster_deleted", {}); flash("Roster deleted."); }
    catch { flash("That roster could not be deleted."); }
  };
  const toggleFav = async (r) => {
    const next = !r.favorite;
    setData((d) => ({ ...d, rosters: d.rosters.map((x) => (x.id === r.id ? { ...x, favorite: next } : x)) }));
    try { await withProvider((p) => p.setRosterFavorite(r.id, next)); track("roster_favorited", { favorite: next }); }
    catch { setData((d) => ({ ...d, rosters: d.rosters.map((x) => (x.id === r.id ? { ...x, favorite: !next } : x)) })); flash("That favorite could not be saved."); }
  };

  if (loading) return <div style={card}><p style={muted}>Loading your rosters…</p></div>;

  return (
    <div style={grid}>
      <section style={card}>
        <SectionLabel>Saved rosters</SectionLabel>
        <p style={{ margin: "6px 0 0", fontSize: 12.5, color: T.textDim }}>
          {rosters.length} of {SAVED_ROSTER_LIMIT_FREE} kept. Save a roster from any Clash in your history.
        </p>
        {rosterLimitReached(rosters.length) && <p style={{ margin: "6px 0 0", fontSize: 12, color: T.gold }}>You have reached the free-account limit. Delete one before saving another.</p>}
      </section>
      {rosters.length === 0 ? (
        <div style={card}><p style={muted}>No saved rosters yet. Open a Clash in your history and choose Save Roster.</p></div>
      ) : rosters.map((r) => (
        <section key={r.id} data-roster={r.id} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              {renaming === r.id ? (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <input aria-label="Roster name" value={nameDraft} maxLength={MAX_ROSTER_NAME} onChange={(e) => setNameDraft(e.target.value)} style={input} />
                  <button onClick={() => rename(r)} style={secondaryBtn}>SAVE</button>
                  <button onClick={() => setRenaming(null)} style={quietBtn}>CANCEL</button>
                </div>
              ) : (
                <div style={{ fontSize: 16, fontWeight: 900 }}>{r.display_name}</div>
              )}
              <div style={{ fontSize: 12.5, color: T.textDim, marginTop: 4 }}>
                {(r.roster_snapshot || []).map((p) => [p.name, p.pos].filter(Boolean).join(" ") || p.id).join(" · ")}
              </div>
              <div style={{ fontSize: 11.5, color: T.textMuted, marginTop: 3 }}>
                {[r.coach_snapshot?.name && `Coach ${r.coach_snapshot.name}`, r.era_preference, r.source_mode && modeName(r.source_mode)].filter(Boolean).join(" · ")}
              </div>
            </div>
            <button onClick={() => toggleFav(r)} aria-pressed={!!r.favorite} aria-label={r.favorite ? "Remove favorite" : "Add favorite"} style={starBtn(r.favorite)}>{r.favorite ? "★" : "☆"}</button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <button onClick={() => { setRenaming(r.id); setNameDraft(r.display_name); }} style={quietBtn}>RENAME</button>
            <button onClick={() => remove(r)} style={{ ...quietBtn, color: "var(--ec-a-red, #b23b3b)" }}>DELETE</button>
          </div>
        </section>
      ))}
    </div>
  );
}

// ── Favorites ─────────────────────────────────────────────────────────────────
function Favorites({ data, loading, onOpenReport }) {
  const favClashes = (data.clashes || []).filter((c) => c.favorite);
  const favRosters = (data.rosters || []).filter((r) => r.favorite);
  if (loading) return <div style={card}><p style={muted}>Loading…</p></div>;
  if (favClashes.length === 0 && favRosters.length === 0) {
    return <div style={card}><SectionLabel>Favorites</SectionLabel><p style={{ ...muted, margin: "8px 0 0" }}>Nothing favorited yet. Tap the star on a Clash or a roster to keep it here.</p></div>;
  }
  return (
    <div style={grid}>
      {favClashes.length > 0 && (
        <section style={card}>
          <SectionLabel>Favorite Clashes</SectionLabel>
          <ul style={list}>
            {favClashes.map((c) => (
              <li key={c.result_id} style={rowBetween}>
                <span><b>{modeName(c.mode)}</b> <span style={{ color: T.textDim }}>· {dateOf(c.played_at)} · <span style={{ color: c.outcome === "win" ? WIN_GREEN : T.textDim }}>{OUTCOME_WORD[c.outcome]}</span></span></span>
                <button onClick={() => onOpenReport?.(c)} style={quietBtn}>REPORT</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {favRosters.length > 0 && (
        <section style={card}>
          <SectionLabel>Favorite rosters</SectionLabel>
          <ul style={list}>
            {favRosters.map((r) => (
              <li key={r.id} style={{ padding: "6px 0" }}>
                <b>{r.display_name}</b>
                <div style={{ fontSize: 12, color: T.textDim }}>{(r.roster_snapshot || []).map((p) => p.name || p.id).join(" · ")}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ── Account ───────────────────────────────────────────────────────────────────
function Account({ account, data, flash, token, onSignedOut }) {
  const [exporting, setExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deleting, setDeleting] = useState(false);
  const linkRef = useRef(null);

  const authMethod = account.session?.authMethod === "google" ? "Google" : "Email one-time code";

  const runExport = async () => {
    setExporting(true); track("account_export_started", {});
    try {
      const { doc, filename } = await assembleAccountExport();
      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
      const urlObj = URL.createObjectURL(blob);
      const a = linkRef.current;
      a.href = urlObj; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(urlObj), 4000);
      track("account_export_completed", { clashes: Math.min(doc.savedClashes.length, 999), rosters: Math.min(doc.savedRosters.length, 99) });
      flash("Your account data was exported.");
    } catch { flash("The export could not be prepared just now."); }
    setExporting(false);
  };

  const startDelete = () => {
    track("account_deletion_started", {});
    if (needsReauthentication(token)) { flash("For your security, sign in again before deleting your account."); onSignedOut?.({ reason: "reauth_for_delete" }); return; }
    setConfirmDelete(true);
  };
  const doDelete = async () => {
    if (deletePhrase.trim().toUpperCase() !== DELETION_PHRASE) return;
    setDeleting(true);
    const out = await deleteAccountRequest({ accessToken: token });
    if (out.status === "deleted") { track("account_deletion_completed", {}); onSignedOut?.({ reason: "deleted" }); return; }
    setDeleting(false);
    flash(out.status === "provider_rejected_server_key" ? "Deletion is temporarily unavailable. Please try again shortly." : "Your account could not be deleted just now.");
  };

  return (
    <div style={grid}>
      <section style={card}>
        <SectionLabel>Account</SectionLabel>
        <dl style={{ margin: "10px 0 0", display: "grid", gap: 8 }}>
          <KV k="Display name" v={account.displayName} />
          <KV k="Email" v={account.session?.email || "—"} note="Private. Used only to sign you in; never shown to other players." />
          <KV k="Sign-in method" v={authMethod} />
          <KV k="Joined" v={account.profile?.created_at ? dateOf(account.profile.created_at) : "—"} />
        </dl>
      </section>

      <section style={card}>
        <SectionLabel>Your data</SectionLabel>
        <p style={{ margin: "6px 0 12px", fontSize: 12.5, color: T.textDim, lineHeight: 1.6 }}>
          Download everything in your account — profile, preferences, saved Clashes, rosters and favorites — as a JSON file. Credentials and internal identifiers are never included.
        </p>
        <button onClick={runExport} disabled={exporting} style={secondaryBtn}>{exporting ? "PREPARING…" : "EXPORT MY DATA"}</button>
        <a ref={linkRef} style={{ display: "none" }} aria-hidden="true">download</a>
      </section>

      <section style={{ ...card, borderColor: "var(--ec-a-red-border, #e2b4b4)" }}>
        <SectionLabel>Delete account</SectionLabel>
        {!confirmDelete ? (
          <>
            <p style={{ margin: "6px 0 12px", fontSize: 12.5, color: T.textDim, lineHeight: 1.6 }}>
              Permanently delete your account. This cannot be undone.
            </p>
            <button onClick={startDelete} style={{ ...quietBtn, borderColor: "var(--ec-a-red-border, #e2b4b4)", color: "var(--ec-a-red, #b23b3b)" }}>DELETE MY ACCOUNT</button>
          </>
        ) : (
          <div>
            <p style={{ margin: "6px 0 8px", fontSize: 13, color: T.text, fontWeight: 700 }}>This permanently removes:</p>
            <ul style={{ margin: "0 0 8px", paddingLeft: 18, fontSize: 12.5, color: T.textDim, lineHeight: 1.7 }}>
              {DELETION_REMOVES.map((x) => <li key={x}>{x}</li>)}
            </ul>
            <p style={{ margin: "0 0 12px", fontSize: 11.5, color: T.textMuted }}>{DELETION_RETAINS.join(" ")}</p>
            <label htmlFor="ec-del" style={label}>Type {DELETION_PHRASE} to confirm</label>
            <input id="ec-del" value={deletePhrase} onChange={(e) => setDeletePhrase(e.target.value)} autoComplete="off" style={input} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <button onClick={doDelete} disabled={deleting || deletePhrase.trim().toUpperCase() !== DELETION_PHRASE}
                style={{ ...primaryBtn, background: "var(--ec-a-red, #b23b3b)", borderColor: "var(--ec-a-red, #b23b3b)", color: "#fff", opacity: deletePhrase.trim().toUpperCase() === DELETION_PHRASE ? 1 : 0.5 }}>
                {deleting ? "DELETING…" : "PERMANENTLY DELETE"}
              </button>
              <button onClick={() => { setConfirmDelete(false); setDeletePhrase(""); track("account_deletion_cancelled", {}); }} style={quietBtn}>CANCEL</button>
            </div>
          </div>
        )}
      </section>

      <section style={card}>
        <button onClick={() => onSignedOut?.({ reason: "sign_out" })} style={secondaryBtn}>SIGN OUT</button>
      </section>
    </div>
  );
}

// ── small pieces ─────────────────────────────────────────────────────────────
const SectionLabel = ({ children }) => <h2 style={h2}>{String(children).toUpperCase()}</h2>;
const Stat = ({ label: l, value }) => (
  <div><dt style={statDt}>{String(l).toUpperCase()}</dt><dd style={statDd}>{value}</dd></div>
);
const Row = ({ k, v }) => (
  <div style={{ display: "flex", gap: 10 }}><span style={{ minWidth: 96, color: T.textMuted, fontWeight: 700 }}>{k}</span><span style={{ minWidth: 0 }}>{v}</span></div>
);
const KV = ({ k, v, note }) => (
  <div><dt style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: T.textMuted }}>{k.toUpperCase()}</dt><dd style={{ margin: "2px 0 0", fontSize: 14, fontWeight: 700 }}>{v}</dd>{note && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{note}</div>}</div>
);
function Select({ label: l, value, onChange, options }) {
  const id = `ec-f-${l.toLowerCase()}`;
  return (
    <div style={{ display: "grid", gap: 3 }}>
      <label htmlFor={id} style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, color: T.textMuted }}>{l.toUpperCase()}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
        {options.map(([v, lab]) => <option key={v} value={v}>{lab}</option>)}
      </select>
    </div>
  );
}

const wrap = { maxWidth: 920, margin: "0 auto", padding: "16px 16px 64px", display: "grid", gap: 14 };
const grid = { display: "grid", gap: 12 };
const card = { padding: 18, borderRadius: R.lg, border: `1px solid ${T.border}`, background: T.bgCard };
const avatar = { width: 52, height: 52, borderRadius: 14, display: "grid", placeItems: "center", flex: "0 0 auto", background: T.goldSoft, color: T.gold, fontWeight: 900, fontSize: 19 };
const tabRow = { display: "flex", gap: 4, overflowX: "auto", borderBottom: `1px solid ${T.border}`, paddingBottom: 0, WebkitOverflowScrolling: "touch" };
const tabBtn = (on) => ({ minHeight: 44, padding: "0 14px", cursor: "pointer", whiteSpace: "nowrap", fontWeight: 800, fontSize: 13, background: "transparent", border: "none", color: on ? T.text : T.textDim, borderBottom: `2px solid ${on ? T.gold : "transparent"}` });
const h2 = { margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: 1.6, color: T.textDim };
const muted = { fontSize: 13, color: T.textDim, lineHeight: 1.6 };
const label = { display: "block", fontSize: 11, fontWeight: 700, color: T.textDim, marginBottom: 4 };
const input = { minHeight: 44, borderRadius: R.sm, padding: "0 10px", fontSize: 14, border: `1px solid ${T.border}`, background: T.bg, color: T.text, boxSizing: "border-box", width: "100%", maxWidth: 320 };
const selectStyle = { minHeight: 44, borderRadius: R.sm, padding: "0 8px", fontSize: 13, border: `1px solid ${T.border}`, background: T.bg, color: T.text };
const statGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 12, margin: "12px 0 0" };
const statDt = { fontSize: 10.5, fontWeight: 800, letterSpacing: 1.1, color: T.textMuted };
const statDd = { margin: "3px 0 0", fontSize: 24, fontWeight: 900, fontFamily: "var(--ec-display)" };
const list = { listStyle: "none", margin: "10px 0 0", padding: 0, display: "grid", gap: 8, fontSize: 13.5 };
const rowBetween = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" };
const filterWrap = { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" };
const rowButton = { flex: 1, minWidth: 0, minHeight: 48, display: "flex", gap: 10, alignItems: "center", padding: 0, background: "transparent", border: "none", cursor: "pointer", color: T.text, textAlign: "left", fontSize: 13.5 };
const starBtn = (on) => ({ minWidth: 44, minHeight: 44, borderRadius: R.sm, border: "none", background: "transparent", cursor: "pointer", fontSize: 20, color: on ? T.gold : T.textMuted, flex: "0 0 auto" });
const pagerBtn = { minHeight: 44, padding: "0 16px", borderRadius: R.sm, cursor: "pointer", fontWeight: 800, fontSize: 12.5, border: `1px solid ${T.border}`, background: "transparent", color: T.text };
const primaryBtn = { minHeight: 48, padding: "0 18px", borderRadius: R.sm, cursor: "pointer", fontWeight: 900, fontSize: 13.5, border: `1px solid ${T.goldBorder}`, background: T.gold, color: T.onGold };
const secondaryBtn = { minHeight: 44, padding: "0 14px", borderRadius: R.sm, cursor: "pointer", fontWeight: 800, fontSize: 12.5, border: `1.5px solid ${T.border}`, background: "transparent", color: T.text };
const quietBtn = { minHeight: 44, padding: "0 14px", borderRadius: R.sm, cursor: "pointer", fontWeight: 800, fontSize: 12, border: `1px solid ${T.border}`, background: "transparent", color: T.textDim };
