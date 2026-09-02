// ── One drafted player in the Time Arena ─────────────────────────────────────
// A trading card: narrow, tall, and portrait-dominant. The portrait zone is a
// fixed 212px of the card's 322px, so an approved portrait is a straight asset
// swap — nothing about the layout depends on whether art exists yet.
//
// The card takes its colour from the TEAM, never from the position: the theme
// arrives through --pc-accent, set by the team container (and by data-team as a
// belt-and-braces fallback). An earlier build decided the tint per position and
// Team Gold's power forward and centre came out blue.
//
// No state is signalled by colour alone. Held cards carry a lock glyph, the word
// LOCKED, and a vertical lift.
import { PLAYERS } from "../../players.js";
import { displayOVR } from "../../rating.js";
import { resolvePortrait, initialsOf, PORTRAIT_STATUS } from "../../ui/time-arena/portraits.js";
import { eligibleLabel } from "../../lineupPlacement.js";

const byId = new Map(PLAYERS.map((p) => [p.id, p]));

const TIER_TITLE = {
  APEX: "Apex — a franchise cornerstone in this environment",
  ELITE: "Elite — a clear first option",
  STAR: "Star — a high-quality starter",
  SPECIALIST: "Specialist — a defined role",
};

/**
 * The card back. Same width and height as a populated card, so Roll 1 REVEALS
 * cards rather than reflowing the board.
 */
export function EmptyCard({ slot, team = "gold" }) {
  return (
    <div className="ec-pc-empty" data-slot={slot} data-team={team}
      aria-label={`Empty ${slot} slot, Team ${team === "blue" ? "Blue" : "Gold"}`}>
      <div className="ec-pc-empty-slot">{slot}</div>
      <div className="ec-pc-empty-mark" aria-hidden="true">EC</div>
      <div className="ec-pc-empty-hint">ROLL TO<br />REVEAL</div>
    </div>
  );
}

/** The portrait zone: an approved image when one exists, the masked figure otherwise. */
function Portrait({ card, player }) {
  const art = resolvePortrait(card.id, card.decade);
  if (art.portraitStatus === PORTRAIT_STATUS.APPROVED && art.src) {
    return (
      <img src={art.src} alt={`${card.name}, ${card.decade}`} loading="lazy" decoding="async"
        style={{ objectPosition: art.objectPosition, transform: art.scale !== 1 ? `scale(${art.scale})` : undefined }} />
    );
  }
  return (
    <>
      <div className="ec-pc-figure" aria-hidden="true" />
      <div className="ec-pc-figure-initials" aria-hidden="true">{initialsOf(card.name)}</div>
      <span className="sr-only">{`${card.name} — EraClash silhouette, no portrait approved yet`}</span>
    </>
  );
}

export default function PlayerCard({
  card, team = "gold", interactive = false, held = false, kept = false,
  locked = false, disabled = false, onToggle,
}) {
  if (!card) return <EmptyCard slot="—" team={team} />;
  const player = byId.get(card.id);
  const teamLabel = team === "blue" ? "Team Blue" : "Team Gold";

  return (
    <div className="ec-pc" data-team={team} data-slot={card.slot} data-held={held ? "true" : "false"}
      aria-label={`${card.name}, ${teamLabel} ${card.slot}, ${card.decade}${kept ? ", kept from the last roll" : ""}${held ? ", held" : ""}`}>
      <div className="ec-pc-portrait">
        <span className="ec-pc-slot">{card.slot}</span>
        {/* KEPT rides on the portrait, opposite the position chip. In the meta
            row it wrapped "2010s · KEPT" onto a second line, and in a card of
            fixed height a second line pushes the footer out through the bottom
            — which is why held cards' buttons sat lower than the rest. */}
        {kept && <span className="ec-pc-kept" aria-hidden="true">KEPT</span>}
        <Portrait card={card} player={player} />
        {/* Every position the card is eligible at, from card data alone. Chaos
            keeps its authoritative slot logic; this is information, not a
            control. Absolutely positioned so the frozen geometry is untouched. */}
        {player && player.positions?.length > 1 && (
          <span className="ec-pc-elig" title={`Eligible positions: ${eligibleLabel(player)}`}>
            {eligibleLabel(player)}<span className="sr-only"> eligible positions</span>
          </span>
        )}
      </div>

      <div className="ec-pc-name" title={card.name}>{card.name}</div>

      <div className="ec-pc-meta">
        <span className="ec-pc-decade">{card.decade}</span>
        <span className="ec-pc-ovr" title={`Draft guide rating${card.tier ? ` · ${TIER_TITLE[card.tier] || card.tier}` : ""}`}>
          {player ? displayOVR(player, card.slot) : "—"}<span>OVR</span>
        </span>
      </div>

      {interactive ? (
        <button className="ec-pc-action" data-on={held ? "true" : "false"}
          onClick={onToggle} disabled={disabled} aria-pressed={held}
          aria-label={`${held ? "Release" : "Hold"} ${card.name}, ${teamLabel} ${card.slot}`}>
          <span aria-hidden="true">{held ? "🔒" : ""}</span>{held ? "LOCKED" : "HOLD"}
        </button>
      ) : locked ? (
        // After the final roll there is no fourth: the card is not "held", it is
        // simply on the team.
        <div className="ec-pc-static" aria-label={`${card.name} is on the final ${teamLabel} roster`}>
          FINAL ROSTER
        </div>
      ) : (
        <div className="ec-pc-static" data-on={held ? "true" : "false"}
          aria-label={held ? `${card.name} held by the Legend CPU` : `${card.name} not held by the Legend CPU`}>
          <span aria-hidden="true">{held ? "🔒" : ""}</span>{held ? "HELD" : "—"}
        </div>
      )}
    </div>
  );
}
