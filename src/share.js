// ── Sharing ────────────────────────────────────────────────────────────────────
// Every meaningful result can become a public /result/{id} page (OG preview →
// straight back into gameplay). If the result service is unavailable we share
// a challenge link instead — sharing never dead-ends.
import { track } from "./analytics.js";
import { loopEvent } from "./loop/events.js";

// Explicitly publish the server-owned score, lineups and performers. The
// caller's publish/copy action is the consent; never call during page load.
export const publishResult = async ({ resultId, chaosRunId } = {}) => {
  if (!resultId && !chaosRunId) return null;
  try {
    const res = await fetch("/api/result", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resultId, chaosRunId, publicRecap: true }),
    });
    if (!res.ok) return null;
    const { id, created } = await res.json();
    if (!/^[a-z0-9]{6,16}$/.test(String(id || ""))) return null;
    if (created) loopEvent("card_created", { source: "direct" });
    return `${window.location.origin}/card/${id}`;
  } catch { return null; }
};

// Web Share with clipboard fallback. Returns "shared" | "copied" | "failed".
export const shareText = async (text, shareType) => {
  track("share_initiated", { share_type: shareType });
  if (navigator.share) {
    try {
      await navigator.share({ title: "EraClash Basketball", text });
      track("share_completed", { share_type: shareType, destination: "web_share" });
      loopEvent("card_shared", { channel: "native" });
      return "shared";
    } catch (e) {
      if (e?.name === "AbortError") { track("share_failed", { share_type: shareType, reason: "cancelled" }); return "failed"; }
      // fall through to clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    track("share_completed", { share_type: shareType, destination: "clipboard" });
    loopEvent("card_shared", { channel: "copy" });
    return "copied";
  } catch {
    track("share_failed", { share_type: shareType, reason: "clipboard" });
    return "failed";
  }
};
