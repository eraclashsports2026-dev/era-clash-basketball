// ── The account provider adapter ─────────────────────────────────────────────
// One narrow surface the product talks to. Two implementations exist:
//
//   · Supabase  — the real provider (Google OAuth + email one-time code, PKCE,
//                 persisted session, automatic token refresh, RLS-backed reads)
//   · a test adapter — injected by the suite, enforcing the SAME ownership
//                 rules the SQL policies enforce, so the claim, save and
//                 isolation logic is testable without a live Postgres
//
// The SDK is imported dynamically so a build with cloud accounts off never
// downloads it, and guest play is untouched.
import { SUPABASE_URL, SUPABASE_ANON_KEY, cloudAccountsEnabled, cleanDisplayName } from "./config.js";
import { readProof, PROOF } from "./linkProof.js";

let injected = null;
/** Tests (and only tests) install an adapter here. */
export const _setProvider = (p) => { injected = p; };
export const _providerIsInjected = () => !!injected;

let clientPromise = null;
const client = async () => {
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          flowType: "pkce",            // the code, not a token, travels through the URL
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,   // the callback route exchanges the code itself
        },
      }));
  }
  return clientPromise;
};

const REDIRECT = () => `${window.location.origin}/auth/callback`;

/** The provider-neutral session shape the product uses. */
const session = (s) => ({
  userId: s.user?.id || null,
  email: s.user?.email || null,          // private: settings only, never a public identity field
  authMethod: s.user?.app_metadata?.provider === "google" ? "google" : "email",
  accessToken: s.access_token || null,
  expiresAt: s.expires_at || null,
});

/** Provider errors become closed codes: no vendor text reaches telemetry. */
const asError = (e) => {
  const raw = String(e?.message || "");
  const code = /rate|too many/i.test(raw) ? "RATE_LIMITED"
    : /expired|invalid.*(token|code|otp)/i.test(raw) ? "CODE_INVALID_OR_EXPIRED"
    : /email/i.test(raw) ? "EMAIL_INVALID"
    : /row-level security|permission|denied/i.test(raw) ? "NOT_PERMITTED"
    : /network|fetch/i.test(raw) ? "NETWORK"
    : "PROVIDER_ERROR";
  return Object.assign(new Error(code), { code });
};

export const FAILURE_CODES = Object.freeze([
  "RATE_LIMITED", "CODE_INVALID_OR_EXPIRED", "EMAIL_INVALID", "NOT_PERMITTED",
  "NETWORK", "PROVIDER_ERROR", "DISPLAY_NAME_INVALID", "CLOUD_ACCOUNTS_DISABLED",
  "RESULT_NOT_FOUND", "NOT_YOUR_RESULT", "ALREADY_CLAIMED", "SAVE_FAILED",
  "LINK_OPENED_ELSEWHERE",
]);

/**
 * What the PROJECT actually offers, read from its public settings endpoint and
 * cached for the tab. Without this the dialog offered "Continue with Google"
 * whenever the provider was configured, even when Google was switched off in
 * the project — a button that could only ever fail. Email is the floor: if the
 * settings call fails we still offer it, because it is the method the product
 * requires and a failed probe should not remove a working path.
 */
let capabilitiesPromise = null;
const supabaseCapabilities = async () => {
  if (!capabilitiesPromise) {
    capabilitiesPromise = fetch(`${String(SUPABASE_URL).trim().replace(/\/+$/, "")}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_ANON_KEY },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => ({ google: !!j?.external?.google, email: j ? j.external?.email !== false : true, signupsAllowed: j ? j.disable_signup !== true : true }))
      .catch(() => ({ google: false, email: true, signupsAllowed: true }));
  }
  return capabilitiesPromise;
};

const supabaseProvider = {
  id: "supabase",
  capabilities: supabaseCapabilities,
  async currentSession() {
    const c = await client();
    const { data } = await c.auth.getSession();
    return data?.session ? session(data.session) : null;
  },
  async onChange(cb) {
    const c = await client();
    const { data } = c.auth.onAuthStateChange((_e, s) => cb(s ? session(s) : null));
    return () => data?.subscription?.unsubscribe?.();
  },
  async signInWithGoogle(returnTo) {
    const c = await client();
    const { error } = await c.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${REDIRECT()}?next=${encodeURIComponent(returnTo || "/play")}`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) throw asError(error);
    return { started: true };
  },
  async sendEmailCode(email, returnTo) {
    const c = await client();
    const { error } = await c.auth.signInWithOtp({
      email: String(email || "").trim(),
      options: { emailRedirectTo: `${REDIRECT()}?next=${encodeURIComponent(returnTo || "/play")}`, shouldCreateUser: true },
    });
    if (error) throw asError(error);
    return { sent: true };
  },
  async verifyEmailCode(email, code) {
    const c = await client();
    const addr = String(email || "").trim();
    const token = String(code || "").trim();
    // A code issued to a BRAND NEW address is a "signup" token; one issued to
    // an existing account is an "email" token. Which of the two you get depends
    // on whether the address already existed, which the dialog cannot know. Try
    // both rather than making the visitor guess, and keep the first real
    // failure to report if neither works.
    let firstError = null;
    for (const type of ["email", "signup", "magiclink"]) {
      const { data, error } = await c.auth.verifyOtp({ email: addr, token, type });
      if (!error && data?.session) return session(data.session);
      firstError = firstError || error;
    }
    throw asError(firstError || new Error("CODE_INVALID_OR_EXPIRED"));
  },
  /**
   * Verify an emailed token hash. Unlike the PKCE code path this carries its
   * own proof, so it establishes a session in ANY browser — which is what makes
   * a link forwarded to a phone work. Supabase only puts a token hash in the
   * email when the template asks for one, so this is the path that becomes
   * available once the templates are updated.
   */
  async verifyTokenHash(tokenHash, type) {
    const c = await client();
    const kinds = type ? [type] : ["magiclink", "signup", "email"];
    let firstError = null;
    for (const t of kinds) {
      const { data, error } = await c.auth.verifyOtp({ token_hash: String(tokenHash), type: t });
      if (!error && data?.session) return session(data.session);
      firstError = firstError || error;
    }
    throw asError(firstError || new Error("CODE_INVALID_OR_EXPIRED"));
  },
  /**
   * @param codeOrUrl a bare PKCE code, or a URL carrying ?code=. The SDK takes
   *   the CODE — passing it a whole URL fails every time, which is the bug that
   *   made this callback unable to complete a sign-in even in the right browser.
   */
  async exchangeCodeForSession(codeOrUrl) {
    const c = await client();
    const proof = readProof(codeOrUrl);
    const code = proof?.kind === PROOF.CODE ? proof.value : String(codeOrUrl || "").trim();
    const { data, error } = await c.auth.exchangeCodeForSession(code);
    if (error) {
      // PKCE keeps the code verifier in the REQUESTING browser's storage, so a
      // link opened anywhere else — a phone, another browser, a private window
      // — cannot complete even though the address was verified. That is the
      // difference between an account that exists and a session that exists,
      // and it deserves its own message rather than "invalid link".
      const missingVerifier = /verifier|code challenge|pkce/i.test(String(error?.message || ""));
      throw Object.assign(new Error(missingVerifier ? "LINK_OPENED_ELSEWHERE" : asError(error).code), { code: missingVerifier ? "LINK_OPENED_ELSEWHERE" : asError(error).code });
    }
    return data?.session ? session(data.session) : null;
  },
  async signOut() {
    const c = await client();
    await c.auth.signOut();
    return { signedOut: true };
  },
  async getProfile() {
    const c = await client();
    const { data, error } = await c.from("profiles")
      .select("user_id, display_name, avatar_url, created_at").maybeSingle();
    if (error) throw asError(error);
    return data || null;
  },
  async updateDisplayName(name) {
    const c = await client();
    const clean = cleanDisplayName(name);
    if (!clean) throw Object.assign(new Error("DISPLAY_NAME_INVALID"), { code: "DISPLAY_NAME_INVALID" });
    const { data: me } = await c.auth.getUser();
    const { data, error } = await c.from("profiles")
      .update({ display_name: clean }).eq("user_id", me?.user?.id)
      .select("user_id, display_name, avatar_url, created_at").maybeSingle();
    if (error) throw asError(error);
    return data || null;
  },
  async listSavedClashes({ limit = 25 } = {}) {
    const c = await client();
    const { data, error } = await c.from("saved_clashes")
      .select("id, result_id, mode, user_side, outcome, gold_score, blue_score, era_id, gold_roster, blue_roster, gold_coach, blue_coach, mvp, candidate_id, calibration_version, theme_version, played_at, claimed_from")
      .order("played_at", { ascending: false }).limit(limit);
    if (error) throw asError(error);
    return data || [];
  },
  async getSavedClash(resultId) {
    const c = await client();
    const { data, error } = await c.from("saved_clashes").select("*")
      .eq("result_id", String(resultId)).maybeSingle();
    if (error) throw asError(error);
    return data || null;
  },
  async career() {
    const c = await client();
    const [summary, byMode, streak] = await Promise.all([
      c.from("career_summary").select("*").maybeSingle(),
      c.from("career_by_mode").select("*").order("games_played", { ascending: false }),
      c.from("career_streak").select("*").maybeSingle(),
    ]);
    for (const r of [summary, byMode, streak]) if (r.error) throw asError(r.error);
    return {
      summary: summary.data || { games_played: 0, wins: 0, losses: 0, ties: 0, win_rate: null, last_played_at: null },
      byMode: byMode.data || [],
      streak: streak.data || null,
    };
  },
};

const disabled = () => Object.assign(new Error("CLOUD_ACCOUNTS_DISABLED"), { code: "CLOUD_ACCOUNTS_DISABLED" });

/** THE accessor. Returns the injected test adapter, the real provider, or null. */
export const provider = () => {
  if (injected) return injected;
  if (!cloudAccountsEnabled()) return null;
  return supabaseProvider;
};

/**
 * Every product call goes through here, so a disabled build can never fake a
 * success: with no provider it either returns the caller's explicit fallback or
 * throws the closed CLOUD_ACCOUNTS_DISABLED code.
 */
export const withProvider = async (fn, ...fallback) => {
  const p = provider();
  if (!p) {
    if (fallback.length) return fallback[0];
    throw disabled();
  }
  return fn(p);
};
