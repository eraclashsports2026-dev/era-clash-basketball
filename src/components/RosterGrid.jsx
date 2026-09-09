// ── Roster grid — the concept's five-across card row ─────────────────────────
// Position header above each card, portrait, name split (given name small /
// family name bold), OVR beneath. Five columns on desktop, two on tablet, one
// on phones — the same cards, reflowed, never a horizontally scrolling page.
// Portraits come from PlayerImage, which serves an approved image when one
// exists and a branded EraClash fallback otherwise. No invented likenesses.
//
// Phase 9A: every card shows the player's team and ALL eligible positions from
// the card data, and the grid has a PLACEMENT mode. While a player is being
// placed, each slot carries a state — ELIGIBLE, OCCUPIED (a swap), INELIGIBLE,
// SELECTED — as a word and a border, and only the legal slots are controls.
import { POSITIONS, DECADE_COLORS } from "../players.js";
import { displayOVR } from "../rating.js";
import { T, R, FONT, teamAccent } from "../theme.js";
import { fitColor } from "../chemistryView.js";
import { eligibleLabel, SLOT_STATE } from "../lineupPlacement.js";
import PlayerImage from "./PlayerImage.jsx";

const POS_LABEL = { PG: "Point Guard", SG: "Shooting Guard", SF: "Small Forward", PF: "Power Forward", C: "Center" };
const splitName = (name) => {
  const parts = String(name).split(" ");
  return parts.length === 1 ? { first: "", last: parts[0] } : { first: parts[0], last: parts.slice(1).join(" ") };
};

const STATE_WORD = {
  [SLOT_STATE.ELIGIBLE]: "PLACE HERE",
  [SLOT_STATE.OCCUPIED]: "SWAP",
  [SLOT_STATE.INELIGIBLE]: "NOT ELIGIBLE",
  [SLOT_STATE.SELECTED]: "SELECTED",
};

function PositionHeader({ pos, accent }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.5, color: accent, textAlign: "center", marginBottom: 5 }}>{pos}</div>
  );
}

function FilledCard({ p, pos, team, accent, fit, hideStats, flash, onSwap, placeState, onPlace, placingName }) {
  const { first, last } = splitName(p.name);
  const ovr = displayOVR(p, pos);
  const body = (
    <>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
        <PlayerImage player={p} variant="card" team={team} />
      </div>
      <div style={{ fontSize: 10.5, color: T.textDim, textAlign: "center", lineHeight: 1.15, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{first}</div>
      <div style={{ fontSize: 12.5, fontWeight: 800, textAlign: "center", lineHeight: 1.2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{last}</div>
      <div style={{ fontSize: 20, fontWeight: 900, fontStyle: "italic", color: accent, textAlign: "center", fontFamily: FONT.display, marginTop: 2 }}>
        {hideStats ? "—" : ovr}
      </div>
      <div style={{ fontSize: 9.5, color: DECADE_COLORS[p.decade] ?? T.textMuted, fontWeight: 700, textAlign: "center" }}>
        {p.decade}<span style={{ color: T.textMuted }}> · {p.team}</span>
      </div>
      {/* Every eligible position, from the card. The primary reads first. */}
      <div className="ec-elig" style={{ color: T.textDim }} aria-label={`Eligible positions: ${eligibleLabel(p)}`}>
        {eligibleLabel(p)}
      </div>
      {/* A fit label reading EXCELLENT on nearly every card carries no
          information. Only a genuine role problem is surfaced. */}
      {fit && !hideStats && (fit === "POOR" || fit === "NEUTRAL") && (
        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.3, color: fitColor(fit, T), textAlign: "center", marginTop: 3 }}>
          {fit === "POOR" ? "OFF-ROLE" : "NEUTRAL FIT"}
        </div>
      )}
      {placeState && <span className="ec-slot-state">{STATE_WORD[placeState]}</span>}
    </>
  );
  const style = {
    padding: "10px 8px", borderRadius: R.md, background: T.bgCardHover,
    border: `1px solid ${T.border}`, minWidth: 0, boxSizing: "border-box", width: "100%",
    textAlign: "center", color: T.text,
  };
  // Placement mode: an OCCUPIED slot is a swap control; anything else is inert.
  if (placeState) {
    if (placeState === SLOT_STATE.OCCUPIED && onPlace) {
      return (
        <button className={flash ? `slot-flash-${team}` : undefined} onClick={onPlace}
          aria-label={`Swap ${p.name} for ${placingName} at ${POS_LABEL[pos]}`} style={{ ...style, cursor: "pointer", minHeight: 132 }}>{body}</button>
      );
    }
    return (
      <div className={flash ? `slot-flash-${team}` : undefined} style={style} aria-disabled={placeState === SLOT_STATE.INELIGIBLE || undefined}
        title={placeState === SLOT_STATE.INELIGIBLE ? `${placingName} is not eligible at ${POS_LABEL[pos]}` : undefined}>
        {body}
        {placeState === SLOT_STATE.INELIGIBLE && <span className="sr-only">{`${placingName} is not eligible at ${POS_LABEL[pos]}.`}</span>}
      </div>
    );
  }
  if (!onSwap) return <div className={flash ? `slot-flash-${team}` : undefined} style={style}>{body}</div>;
  return (
    <button className={flash ? `slot-flash-${team}` : undefined} onClick={onSwap}
      aria-label={`Swap ${p.name}`} style={{ ...style, cursor: "pointer", minHeight: 132 }}>{body}</button>
  );
}

function EmptyCard({ pos, team, accent, onAdd, placeState, onPlace, placingName }) {
  const body = (
    <>
      <div aria-hidden="true" style={{
        width: 40, height: 40, margin: "0 auto 8px", borderRadius: "50%",
        border: `1px dashed ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center",
        color: accent, fontSize: 19, fontWeight: 700,
      }}>+</div>
      <div style={{ fontSize: 11, color: T.textDim, lineHeight: 1.3 }}>
        {placeState ? <>{POS_LABEL[pos]}</> : <>Add<br />{POS_LABEL[pos]}</>}
      </div>
      {placeState && <span className="ec-slot-state">{STATE_WORD[placeState]}</span>}
    </>
  );
  const style = {
    padding: "14px 8px", borderRadius: R.md, background: T.bgCardHover,
    border: `1px dashed ${T.border}`, minWidth: 0, boxSizing: "border-box", width: "100%",
    textAlign: "center", color: T.text, minHeight: 132,
  };
  if (placeState) {
    if (placeState === SLOT_STATE.ELIGIBLE && onPlace) {
      return <button onClick={onPlace} aria-label={`Place ${placingName} at ${POS_LABEL[pos]}`} style={{ ...style, cursor: "pointer" }}>{body}</button>;
    }
    return (
      <div style={style} aria-disabled="true" title={`${placingName} is not eligible at ${POS_LABEL[pos]}`}>
        {body}
        <span className="sr-only">{`${placingName} is not eligible at ${POS_LABEL[pos]}.`}</span>
      </div>
    );
  }
  if (!onAdd) return <div style={style}>{body}</div>;
  return <button onClick={onAdd} aria-label={`Add ${POS_LABEL[pos]}`} style={{ ...style, cursor: "pointer" }}>{body}</button>;
}

/**
 * five: array of 5 player objects or nulls (index = POSITIONS index)
 * onSlot(i): open the picker for that slot (omit for read-only rosters)
 * placement: { plan, onPlace(i) } while a player is being placed — the plan is
 *   the pure module's answer, so every slot state here is the one the rules
 *   computed and the one the tests exercised.
 */
export default function RosterGrid({ five, team = "gold", onSlot, hideStats, fitFor, flashSlot, placement = null }) {
  const accent = teamAccent(team);
  const plan = placement?.plan || null;
  const placingName = plan?.player?.name || "";
  return (
    <div className="roster-grid" role="list" aria-label={`${team === "blue" ? "Team Blue" : "Team Gold"} lineup`}
      data-placing={plan ? "true" : "false"}>
      {POSITIONS.map((pos, i) => {
        const p = five?.[i] ?? null;
        const slot = plan?.slots?.[i] || null;
        const state = slot?.state || null;
        const onPlace = plan && (state === SLOT_STATE.ELIGIBLE || state === SLOT_STATE.OCCUPIED)
          ? () => placement.onPlace(i) : null;
        return (
          <div key={pos} role="listitem" style={{ minWidth: 0 }} data-slot={pos} data-place-state={state || undefined}>
            <PositionHeader pos={pos} accent={accent} />
            {p
              ? <FilledCard p={p} pos={pos} team={team} accent={accent} hideStats={hideStats}
                  fit={fitFor ? fitFor(i) : null} flash={flashSlot === i} onSwap={onSlot ? () => onSlot(i) : null}
                  placeState={state} onPlace={onPlace} placingName={placingName} />
              : <EmptyCard pos={pos} team={team} accent={accent} onAdd={onSlot ? () => onSlot(i) : null}
                  placeState={state} onPlace={onPlace} placingName={placingName} />}
          </div>
        );
      })}
    </div>
  );
}
