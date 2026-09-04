// ── Reading whatever the email actually gave you ─────────────────────────────
// Supabase's default email templates render only `{{ .ConfirmationURL }}`, so
// most people never see a typeable code at all. What they hold is a link, and
// depending on where it has been the link carries one of three different kinds
// of proof — which need three different calls to redeem:
//
//   token      the untouched link straight out of the email. Redeemed with the
//              address, so it signs you in in ANY browser, on ANY device. This
//              is the good one: copy the link's address, don't click it.
//   token_hash the same idea in the server-side template. Also portable.
//   code       what is left AFTER the link has been clicked and the provider
//              has redirected. PKCE: it can only be exchanged by the browser
//              that asked for it, because the verifier never left that browser.
//
// Keeping this pure and separate is deliberate. The bug it exists to prevent
// was mine: the callback handed a whole URL to a function whose parameter is a
// code, which cannot ever succeed, and nothing failed loudly enough to notice.
export const PROOF = Object.freeze({ OTP: "otp", TOKEN_HASH: "tokenHash", CODE: "code" });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param raw anything pasted into the one code field: a typed code, a bare
 *   token, or a full URL copied out of an email or a failed address bar.
 * @returns {{kind: string, value: string}|null} null when there is nothing
 *   usable, so the caller can refuse without inventing a request.
 */
export const readProof = (raw) => {
  const entry = String(raw ?? "").trim().replace(/^<|>$/g, "");
  if (!entry) return null;

  // A typed one-time code, when the template has been customised to send one.
  if (/^\d{6,8}$/.test(entry)) return { kind: PROOF.OTP, value: entry };

  if (/^https?:\/\//i.test(entry) || /[?#]/.test(entry)) {
    let q, h;
    try {
      const u = new URL(entry, "https://eraclash.invalid");
      q = new URLSearchParams(u.search);
      h = new URLSearchParams(u.hash.replace(/^#/, ""));
    } catch { return null; }
    const pick = (k) => q.get(k) || h.get(k) || null;
    // Order matters: prefer the two portable proofs over the browser-bound one,
    // so a link that still carries its token is never downgraded to PKCE.
    const token = pick("token");
    const tokenHash = pick("token_hash");
    const code = pick("code");
    if (tokenHash) return { kind: PROOF.TOKEN_HASH, value: tokenHash };
    if (token) return { kind: PROOF.OTP, value: token };
    if (code) return { kind: PROOF.CODE, value: code };
    return null;
  }

  // A bare value. A PKCE code is a UUID or carries the pkce_ marker; a token
  // hash is a long hex digest. Anything else is treated as a one-time token,
  // which is the shape the provider is most permissive about.
  if (UUID.test(entry) || /^pkce_/i.test(entry)) return { kind: PROOF.CODE, value: entry };
  if (/^[0-9a-f]{40,}$/i.test(entry)) return { kind: PROOF.TOKEN_HASH, value: entry };
  return { kind: PROOF.OTP, value: entry };
};

/** Whether this proof can only be redeemed by the browser that asked for it. */
export const isBrowserBound = (proof) => proof?.kind === PROOF.CODE;
