// ── One breakpoint, shared ────────────────────────────────────────────────────
// The header, the account control and the arena all need to know "is this
// narrow?", and three components measuring three different widths is how a
// header ends up 217px tall on a phone while every component believes it is
// behaving.
import { useEffect, useState } from "react";

export const useCompact = (max) => {
  const [compact, setCompact] = useState(() =>
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia(`(max-width: ${max}px)`).matches : false);
  useEffect(() => {
    if (!window.matchMedia) return;
    const q = window.matchMedia(`(max-width: ${max}px)`);
    const sync = () => setCompact(q.matches);
    sync();
    q.addEventListener("change", sync);
    return () => q.removeEventListener("change", sync);
  }, [max]);
  return compact;
};

/** Below this, six top-level nav items cannot sit on one line. */
export const NAV_COMPACT_MAX = 900;
/** Below this, the account chip drops its name and tier and keeps its avatar. */
export const ACCOUNT_COMPACT_MAX = 620;
