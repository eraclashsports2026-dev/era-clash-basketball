// ── The one account state the product reads ──────────────────────────────────
// A tiny store, not a framework: the provider's session is the source of truth,
// the profile is fetched under RLS, and localStorage is never authoritative.
// When cloud accounts are off this reports a signed-out state forever, so every
// consumer degrades to guest behaviour without a branch of its own.
import { useEffect, useState } from "react";
import { provider, withProvider } from "./provider.js";
import { cloudAccountsEnabled, cleanDisplayName } from "./config.js";
import { track } from "../analytics.js";

let state = { ready: false, session: null, profile: null };
const listeners = new Set();
const emit = () => { for (const l of [...listeners]) { try { l(state); } catch { /* a bad listener must not break the rest */ } } };
const set = (patch) => { state = { ...state, ...patch }; emit(); };

export const accountState = () => state;
export const isSignedIn = () => !!state.session?.userId;
export const accessToken = () => state.session?.accessToken || null;

/** The display identity: never the email. */
export const displayName = () => state.profile?.display_name || "Coach";
export const initialsOf = (name = displayName()) =>
  String(name).trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "C";

let started = false;
let unsubscribeProvider = null;

/** Called once at boot. Safe to call again; safe when cloud accounts are off. */
export const startAccountState = async () => {
  if (started) return state;
  started = true;
  if (!provider()) { set({ ready: true, session: null, profile: null }); return state; }
  try {
    const session = await withProvider((p) => p.currentSession(), null);
    await adopt(session);
    unsubscribeProvider = await withProvider((p) => p.onChange((s) => { adopt(s); }), null);
  } catch {
    set({ ready: true, session: null, profile: null });
  }
  return state;
};

/** Take a provider session and load the profile it may read. */
export const adopt = async (session) => {
  if (!session?.userId) { set({ ready: true, session: null, profile: null }); return state; }
  let profile = null;
  try { profile = await withProvider((p) => p.getProfile(), null); } catch { profile = null; }
  set({ ready: true, session, profile });
  return state;
};

export const refreshProfile = async () => {
  if (!isSignedIn()) return null;
  const profile = await withProvider((p) => p.getProfile(), null);
  set({ profile });
  return profile;
};

export const updateDisplayName = async (name) => {
  const clean = cleanDisplayName(name);
  if (!clean) throw Object.assign(new Error("DISPLAY_NAME_INVALID"), { code: "DISPLAY_NAME_INVALID" });
  const profile = await withProvider((p) => p.updateDisplayName(clean));
  set({ profile });
  track("display_name_updated", {});
  return profile;
};

export const signOutAccount = async () => {
  await withProvider((p) => p.signOut(), { signedOut: true });
  // Every trace of the previous account leaves memory immediately, so nothing
  // private can render between sign-out and the next paint.
  set({ ready: true, session: null, profile: null });
  track("account_signout_completed", {});
  return true;
};

export const subscribeAccount = (listener) => {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
};

/** React binding. */
export const useAccount = () => {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => subscribeAccount(setSnapshot), []);
  return {
    ...snapshot,
    enabled: cloudAccountsEnabled() || !!provider(),
    signedIn: !!snapshot.session?.userId,
    displayName: snapshot.profile?.display_name || "Coach",
  };
};

/** Tests reset the module between cases. */
export const _resetAccountState = () => {
  try { unsubscribeProvider?.(); } catch { /* ignore */ }
  unsubscribeProvider = null;
  started = false;
  state = { ready: false, session: null, profile: null };
  listeners.clear();
};
