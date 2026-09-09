// ── Account state ────────────────────────────────────────────────────────────
// This repository has no authentication backend, and Phase 8A explicitly does
// not build billing. A "free account" is therefore a local, device-scoped
// identity: the user names themselves and the tier moves GUEST → FREE.
//
// What matters architecturally is that NOTHING reads this file to make a
// decision. It supplies a tier string to the ONE central entitlement function
// (src/entitlements.js), so swapping in a real auth provider later is a change
// to this file alone — no gate, and certainly no draft-odds function, needs to
// learn about it.
import { getDisplayName, setDisplayName } from "./identity.js";
// Phase 9B.1: when cloud accounts are switched on, a REAL provider session is
// the account. The device-scoped identity below stays as the flag-off path, so
// a build without a provider behaves exactly as it did before this phase.
import { isSignedIn, displayName as cloudDisplayName, accountState } from "./accounts/accountState.js";
import { cloudAccountsEnabled } from "./accounts/config.js";
import { provider } from "./accounts/provider.js";

const cloudActive = () => cloudAccountsEnabled() || !!provider();

const KEY = "ec_account";
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

export const hasAccount = () => (cloudActive() ? isSignedIn() : !!lsGet(KEY));

export const getAccount = () => {
  if (!hasAccount()) return null;
  if (cloudActive()) {
    const { profile } = accountState();
    return { name: cloudDisplayName(), createdAt: profile?.created_at ? Date.parse(profile.created_at) : null, cloud: true };
  }
  return { name: getDisplayName() || "Coach", createdAt: Number(lsGet(`${KEY}_at`)) || null, cloud: false };
};

export const createFreeAccount = (name) => {
  setDisplayName(String(name || "Coach"));
  lsSet(KEY, "1");
  lsSet(`${KEY}_at`, String(Date.now()));
  return getAccount();
};

/** Local sign-out only. A cloud session ends through accountState.signOutAccount(). */
export const signOut = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } };

/** The tier handed to the central entitlement function. */
export const currentTier = () => (hasAccount() ? "FREE" : "GUEST");
