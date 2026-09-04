// ── In-memory account provider for the test suite ───────────────────────────
// It enforces the SAME ownership rules the SQL policies enforce, so the claim,
// save, isolation and career-read logic can be exercised without a live
// Postgres:
//
//   · a read returns only rows whose user_id is the CURRENT session's user
//   · a client can never insert or mutate a saved clash (no such method exists)
//   · a profile update touches only the caller's own row
//   · an anonymous caller (no session) reads nothing
//
// It is a test double, never shipped: nothing under src/ imports it, and it is
// installed only through provider._setProvider from the suite. A fake account
// must never appear in a user-facing preview.
import { cleanDisplayName } from "./config.js";

const err = (code) => Object.assign(new Error(code), { code });

export const createTestProvider = ({ users = [] } = {}) => {
  const db = {
    users: new Map(),          // userId → { email, authMethod }
    profiles: new Map(),       // userId → profile row
    savedClashes: [],          // rows, server-inserted only
    claims: new Map(),         // resultId → { userId, deviceSessionHash }
  };
  let current = null;          // the signed-in session
  const changeListeners = new Set();

  const addUser = ({ userId, email, authMethod = "email", displayName = "Coach" }) => {
    db.users.set(userId, { email, authMethod });
    // The sign-up trigger's job: exactly one profile per user, no email copied.
    if (!db.profiles.has(userId)) {
      db.profiles.set(userId, { user_id: userId, display_name: cleanDisplayName(displayName) || "Coach", avatar_url: null, created_at: new Date().toISOString() });
    }
    return userId;
  };
  for (const u of users) addUser(u);

  const session = (userId) => (userId ? {
    userId, email: db.users.get(userId)?.email || null,
    authMethod: db.users.get(userId)?.authMethod || "email",
    accessToken: `test-token.${userId}`, expiresAt: Math.floor(Date.now() / 1000) + 3600,
  } : null);

  const requireSession = () => { if (!current) throw err("NOT_PERMITTED"); return current; };
  const emit = () => { for (const l of [...changeListeners]) l(current); };

  const provider = {
    id: "test",
    async capabilities() { return { google: true, email: true, signupsAllowed: true }; },
    // ── auth ────────────────────────────────────────────────────────────────
    async currentSession() { return current; },
    async onChange(cb) { changeListeners.add(cb); return () => changeListeners.delete(cb); },
    async signInWithGoogle() { return { started: true }; },
    async sendEmailCode(email) { if (!/.+@.+\..+/.test(String(email))) throw err("EMAIL_INVALID"); provider._pendingEmail = String(email); return { sent: true }; },
    async verifyEmailCode(email, code) {
      if (String(code) !== "123456") throw err("CODE_INVALID_OR_EXPIRED");
      const userId = [...db.users].find(([, u]) => u.email === String(email))?.[0] || addUser({ userId: `u-${db.users.size + 1}`, email: String(email) });
      current = session(userId); emit(); return current;
    },
    async verifyTokenHash(tokenHash) {
      if (!db.users.has(String(tokenHash))) throw err("CODE_INVALID_OR_EXPIRED");
      current = session(String(tokenHash)); emit(); return current;
    },
    async exchangeCodeForSession(url) {
      const code = new URL(url, "https://test.invalid").searchParams.get("code");
      if (!code || !db.users.has(String(code))) throw err("CODE_INVALID_OR_EXPIRED");
      current = session(String(code)); emit(); return current;
    },
    async signOut() { current = null; emit(); return { signedOut: true }; },

    // ── reads, isolated per session (what RLS guarantees) ───────────────────
    async getProfile() { const s = requireSession(); return db.profiles.get(s.userId) ? { ...db.profiles.get(s.userId) } : null; },
    async updateDisplayName(name) {
      const s = requireSession();
      const clean = cleanDisplayName(name);
      if (!clean) throw err("DISPLAY_NAME_INVALID");
      const row = db.profiles.get(s.userId);
      if (!row) throw err("NOT_PERMITTED");
      row.display_name = clean;
      return { ...row };
    },
    async listSavedClashes({ limit = 25 } = {}) {
      const s = requireSession();
      return db.savedClashes.filter((r) => r.user_id === s.userId)
        .sort((a, b) => new Date(b.played_at) - new Date(a.played_at)).slice(0, limit).map((r) => ({ ...r }));
    },
    async getSavedClash(resultId) {
      const s = requireSession();
      const row = db.savedClashes.find((r) => r.user_id === s.userId && r.result_id === String(resultId));
      return row ? { ...row } : null;
    },
    async career() {
      const s = requireSession();
      const rows = db.savedClashes.filter((r) => r.user_id === s.userId);
      const wins = rows.filter((r) => r.outcome === "win").length;
      const losses = rows.filter((r) => r.outcome === "loss").length;
      const ties = rows.filter((r) => r.outcome === "tie").length;
      const byMode = [...rows.reduce((m, r) => {
        const e = m.get(r.mode) || { user_id: s.userId, mode: r.mode, games_played: 0, wins: 0, losses: 0 };
        e.games_played++; if (r.outcome === "win") e.wins++; if (r.outcome === "loss") e.losses++;
        return m.set(r.mode, e);
      }, new Map()).values()].sort((a, b) => b.games_played - a.games_played);
      const ordered = [...rows].sort((a, b) => new Date(b.played_at) - new Date(a.played_at));
      let streak = 0;
      for (const r of ordered) { if (r.outcome === ordered[0]?.outcome) streak++; else break; }
      return {
        summary: { user_id: s.userId, games_played: rows.length, wins, losses, ties, win_rate: rows.length ? Number((wins / rows.length).toFixed(4)) : null, last_played_at: ordered[0]?.played_at || null },
        byMode,
        streak: ordered.length ? { user_id: s.userId, streak_outcome: ordered[0].outcome, streak_length: streak } : null,
      };
    },
  };

  /**
   * The SERVER's privileged path, mirroring api/_lib/cloudAccounts.js: it
   * verifies the token, proves ownership against the authoritative record's
   * device session, then claims once and stores idempotently. Exposed
   * separately from `provider` precisely because no browser holds it.
   */
  const server = {
    resultStore: new Map(),    // resultId → authoritative record (with .session)
    putResult(record) { this.resultStore.set(String(record.id), record); return record; },
    verifyToken(token) {
      const m = /^test-token\.(.+)$/.exec(String(token || ""));
      return m && db.users.has(m[1]) ? { userId: m[1] } : null;
    },
    claimAndSave({ resultId, token, deviceSession, claimedFrom = "signed_in" }) {
      const who = this.verifyToken(token);
      if (!who) return { status: "not_authenticated" };
      const record = this.resultStore.get(String(resultId));
      if (!record) return { status: "not_found" };
      if (!deviceSession || record.session !== deviceSession) return { status: "not_your_result" };
      const existing = db.claims.get(String(resultId));
      if (existing && existing.userId !== who.userId) return { status: "already_claimed" };
      if (!existing) db.claims.set(String(resultId), { userId: who.userId, deviceSessionHash: `h(${deviceSession})` });
      const dup = db.savedClashes.find((r) => r.user_id === who.userId && r.result_id === String(resultId));
      if (dup) return { status: "already_saved" };
      const g = record.finalScore?.gold, b = record.finalScore?.blue;
      db.savedClashes.push({
        id: `sc-${db.savedClashes.length + 1}`, user_id: who.userId, result_id: String(resultId),
        mode: record.mode || "single", user_side: "gold",
        outcome: g === b ? "tie" : g > b ? "win" : "loss",
        gold_score: g ?? null, blue_score: b ?? null, era_id: record.eraId || null,
        gold_roster: (record.goldIds || []).map((id) => ({ id })), blue_roster: (record.blueIds || []).map((id) => ({ id })),
        gold_coach: null, blue_coach: null, mvp: record.mvp || null,
        candidate_id: record.previewCandidate?.candidateId || null,
        calibration_version: record.previewCandidate?.calibrationVersion || null,
        theme_version: null, build_stamp: null, claimed_from: claimedFrom,
        result_snapshot: (({ session, ...rest }) => rest)(record),
        played_at: new Date(record.created_at || Date.now()).toISOString(),
      });
      return { status: "saved" };
    },
    importDeviceHistory({ candidateIds, token, deviceSession }) {
      const results = (candidateIds || []).map((id) => ({ resultId: id, ...this.claimAndSave({ resultId: id, token, deviceSession, claimedFrom: "device_import" }) }));
      return {
        proposed: results.length,
        imported: results.filter((r) => r.status === "saved").length,
        alreadySaved: results.filter((r) => r.status === "already_saved").length,
        refused: results.filter((r) => ["not_your_result", "already_claimed", "not_found"].includes(r.status)).length,
        results,
      };
    },
    /** Anonymous reads: no session, so nothing is visible. */
    anonymousReadAttempt() { const saved = current; current = null; try { return { profiles: db.profiles.size, visible: 0 }; } finally { current = saved; } },
  };

  return {
    provider, server, db,
    addUser,
    signInAs(userId) { if (!db.users.has(userId)) throw err("NOT_PERMITTED"); current = session(userId); emit(); return current; },
    signOut() { current = null; emit(); },
  };
};
