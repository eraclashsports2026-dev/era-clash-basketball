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

const KEY = "ec_account";
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

export const hasAccount = () => !!lsGet(KEY);

export const getAccount = () => {
  if (!hasAccount()) return null;
  return { name: getDisplayName() || "Coach", createdAt: Number(lsGet(`${KEY}_at`)) || null };
};

export const createFreeAccount = (name) => {
  setDisplayName(String(name || "Coach"));
  lsSet(KEY, "1");
  lsSet(`${KEY}_at`, String(Date.now()));
  return getAccount();
};

export const signOut = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } };

/** The tier handed to the central entitlement function. */
export const currentTier = () => (hasAccount() ? "FREE" : "GUEST");
