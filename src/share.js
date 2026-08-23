// ── Sharing ────────────────────────────────────────────────────────────────────
// Every meaningful result can become a public /result/{id} page (OG preview →
// straight back into gameplay). If the result service is unavailable we share
// a challenge link instead — sharing never dead-ends.
import { getDisplayName } from "./identity.js";
import { track } from "./analytics.js";

// Publish a result snapshot; returns a public URL or null.
export const publishResult = async (snapshot) => {
  try {
    const res = await fetch("/api/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result: { ...snapshot, name: getDisplayName() || null } }),
    });
    if (!res.ok) return null;
    const { id } = await res.json();
    return `${window.location.origin}/result/${id}`;
  } catch { return null; }
};

// Web Share with clipboard fallback. Returns "shared" | "copied" | "failed".
export const shareText = async (text, shareType) => {
  track("share_initiated", { share_type: shareType });
  if (navigator.share) {
    try {
      await navigator.share({ title: "EraClash Basketball", text });
      track("share_completed", { share_type: shareType, destination: "web_share" });
      return "shared";
    } catch (e) {
      if (e?.name === "AbortError") { track("share_failed", { share_type: shareType, reason: "cancelled" }); return "failed"; }
      // fall through to clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    track("share_completed", { share_type: shareType, destination: "clipboard" });
    return "copied";
  } catch {
    track("share_failed", { share_type: shareType, reason: "clipboard" });
    return "failed";
  }
};
