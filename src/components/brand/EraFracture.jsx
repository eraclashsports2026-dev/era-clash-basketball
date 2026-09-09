// ── The Era Fracture — reusable primitives, Phase 9A.2 ───────────────────────
// A controlled DIAGONAL collision between Fracture Gold and Fracture Cobalt
// (masterBrandTokens.ERA_FRACTURE: 112°, gold to 46%, a 2% bright seam). It is
// drawn by these four primitives and by a handful of CSS state hooks — never by
// per-component graphics, never as a border treatment, never as random cracks.
//
// Every primitive is aria-hidden decoration with ZERO layout footprint (absolute
// or a fixed 2px rule), so the one-DOM contract of the theme lab holds: the four
// historical candidates render the same elements and simply paint them with
// their own --ec-a-fracture token (a neutral line), while the production theme
// paints the gold-to-cobalt divide.
//
// Approved placements (data/validation/9a2/era-fracture-contract.json):
//   1 main arena divide            .ec-ta-roster-divider            (CSS)
//   2 selected navigation           header [aria-current] / open menu (CSS)
//   3 roll transition               <EraFractureTransition kind="roll">
//   4 era reveal                    .ec-intel-era[data-revealed]     (CSS)
//   5 selected player-card edge     .ec-pc[data-held="true"]         (CSS)
//   6 selected coach-card edge      .ec-coach-card[data-on="true"]   (CSS)
//   7 simulation transition         <EraFractureTransition kind="sim">
//   8 Result Dock state transition  <EraFractureActiveEdge> on the final-score panel
//   9 share / result graphic        <EraFractureDivider> in the Postgame hero
//  10 one lobby brand moment        <EraFractureDivider> under the lobby's brand band
import { useEffect, useRef, useState } from "react";

/** A 2px horizontal rule carrying the diagonal divide. The ONLY fracture a reading surface may hold. */
export function EraFractureDivider({ width = "100%", className = "" }) {
  return <div className={`ec-fracture ec-fracture-divider ${className}`.trim()} style={{ width }} aria-hidden="true" />;
}

/** The active edge: a 2px bar along the top of a selected panel. Absolute; the panel needs position: relative. */
export function EraFractureActiveEdge({ on = true }) {
  return <div className="ec-fracture ec-fracture-edge" data-on={on ? "true" : "false"} aria-hidden="true" />;
}

/**
 * The transition: one diagonal sweep of light across a stage when a roll lands
 * or the simulation starts. Fires ONCE per `token` change (a roll number, a
 * phase); never loops; honours prefers-reduced-motion by rendering a single
 * static frame that fades in 1ms.
 */
export function EraFractureTransition({ token, kind = "roll", hold = false }) {
  const [active, setActive] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    if (token === undefined || token === null) return undefined;
    setActive(true);
    const t = setTimeout(() => setActive(false), 900);
    return () => clearTimeout(t);
  }, [token]);
  return <div className="ec-fracture ec-fracture-transition" data-kind={kind} data-active={active || hold ? "true" : "false"} data-hold={hold ? "true" : "false"} aria-hidden="true" />;
}

/** A large, very faint diagonal watermark for the share/result graphic only. */
export function EraFractureWatermark() {
  return <div className="ec-fracture ec-fracture-watermark" aria-hidden="true" />;
}
