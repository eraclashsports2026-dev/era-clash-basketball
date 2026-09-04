// ── Reading whatever the email actually gave you ─────────────────────────────
// Supabase's default templates render only `{{ .ConfirmationURL }}`, so most
// people never see a typeable code at all. What they hold is a link, and
// depending on the template and on where the link has already been, it carries
// one of three kinds of proof — each redeemed by a different call:
//
//   token / token_hash   the untouched link out of the email. Redeemed against
//                        the address or the digest, so it works in ANY browser
//                        on ANY device. Copy the link's address, don't click it.
//   code                 what is LEFT after the link has been clicked and the
//                        provider has redirected. PKCE: only the browser that
//                        asked can finish it, because the verifier never left.
//
// The shapes overlap in ways that are not safe to guess at. With the PKCE flow
// switched on, `?token=` in a magic link holds a `pkce_`-prefixed DIGEST rather
// than a raw token, so redeeming it as a raw token double-hashes it and fails;
// without PKCE the same parameter holds the raw token, where the digest call
// fails instead. Rather than bet on one reading, this module returns an ORDERED
// PLAN: the most likely redemption first, the other legitimate reading of the
// same proof behind it. Every attempt is the same single-use proof presented
// the way one of the provider's endpoints expects it.
//
// This exists because of a defect I shipped: the callback handed a whole URL to
// exchangeCodeForSession, whose parameter is a code. It could not ever have
// produced a session, in any browser, and no test noticed.
export const VIA = Object.freeze({ OTP: "otp", TOKEN_HASH: "tokenHash", CODE: "code" });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIGEST = /^[0-9a-f]{40,}$/i;
const clean = (v) => String(v ?? "").trim().replace(/^<+|>+$/g, "");
// The SDK appends this to the redirect it asks the provider to use, and keeps
// each flow's verifier in a slot named after it. Without it the exchange falls
// back to a single fixed key that mirrors only the MOST RECENT flow — so
// clicking an older link would present the wrong verifier and burn a code that
// was perfectly good. It has to survive the address-bar scrub, which is why it
// is read out of the string handed in rather than out of window.location.
const FLOW_ID = /^[0-9a-f]{32}$/i;
// A digest masquerading as a token: the PKCE marker, or a bare hex hash.
const isDigest = (v) => /^pkce_/i.test(v) || DIGEST.test(v);

/**
 * Every legitimate way the pasted value could be redeemed, best guess first.
 * @returns {Array<{via: string, value: string, type: string|null}>} empty when
 *   there is nothing usable, so a caller never builds a request on a guess.
 */
export const redemptionPlan = (raw) => {
  const entry = clean(raw);
  if (!entry) return [];
  const both = (value, type) => isDigest(value)
    ? [{ via: VIA.TOKEN_HASH, value, type }, { via: VIA.OTP, value, type }]
    : [{ via: VIA.OTP, value, type }, { via: VIA.TOKEN_HASH, value, type }];

  // A typed one-time code, when the template has been customised to send one.
  if (/^\d{6,8}$/.test(entry)) return [{ via: VIA.OTP, value: entry, type: null }];

  if (/^https?:\/\//i.test(entry) || /[?#]/.test(entry)) {
    let q, h;
    try {
      const u = new URL(entry, "https://eraclash.invalid");
      q = new URLSearchParams(u.search);
      h = new URLSearchParams(u.hash.replace(/^#/, ""));
    } catch { return []; }
    const pick = (k) => q.get(k) || h.get(k) || null;
    const type = pick("type");
    const rawFlow = pick("sb_flow_id");
    const flowId = rawFlow && FLOW_ID.test(rawFlow) ? rawFlow : null;
    const tokenHash = pick("token_hash");
    const token = pick("token");
    const code = pick("code");
    // Order matters: the two portable proofs are preferred over the
    // browser-bound one, so a link that still carries its token is never
    // downgraded to PKCE and made un-redeemable on a phone.
    if (tokenHash) return [{ via: VIA.TOKEN_HASH, value: tokenHash, type }, { via: VIA.OTP, value: tokenHash, type }];
    if (token) return both(token, type);
    if (code) return [{ via: VIA.CODE, value: code, type, flowId }];
    return [];
  }

  // A bare value, told apart by shape. A PKCE authorization code is a UUID; a
  // `pkce_` prefix or a long hex string is a digest, not a raw token.
  if (UUID.test(entry)) return [{ via: VIA.CODE, value: entry, type: null }];
  if (isDigest(entry)) return both(entry, null);
  return [{ via: VIA.OTP, value: entry, type: null }];
};

/** The single best reading, for callers that only want one. */
export const readProof = (raw) => redemptionPlan(raw)[0] ?? null;

/** Whether this proof can only be redeemed by the browser that asked for it. */
export const isBrowserBound = (proof) => proof?.via === VIA.CODE;

/**
 * Walk a redemption plan and return the first session it produces.
 *
 * Kept here, out of both components, for two reasons. It is the part worth
 * testing — ordering, fallback, and which failure gets reported — and a loop
 * duplicated in two files is a loop that will drift. The calls are injected so
 * a test can drive it without a provider or a DOM.
 *
 * Attempts that redeem against an address are skipped when no address is
 * known, because guessing one would mean sending a forged request.
 *
 * @param raw whatever was pasted, or the callback's own URL — read as a string,
 *   so a flow id survives a caller that has already cleaned the address bar
 * @param calls the three provider methods, plus the address if there is one
 * @returns the session, or null if nothing in the plan was usable
 * @throws the FIRST real failure, which is the one that explains the problem —
 *   a later attempt failing for its own reason must not mask it
 */
export const redeem = async (raw, { email = null, verifyEmailCode, verifyTokenHash, exchangeCodeForSession } = {}) => {
  const plan = redemptionPlan(raw).filter((a) => a.via !== VIA.OTP || email);
  if (!plan.length) return null;
  let firstFailure = null;
  for (const a of plan) {
    try {
      const session = a.via === VIA.OTP
        ? await verifyEmailCode(email, a.value, a.type)
        : a.via === VIA.TOKEN_HASH
          ? await verifyTokenHash(a.value, a.type)
          : await exchangeCodeForSession(a.value, a.flowId ?? null);
      if (session) return session;
    } catch (e) { firstFailure = firstFailure || e; }
  }
  if (firstFailure) throw firstFailure;
  return null;
};
