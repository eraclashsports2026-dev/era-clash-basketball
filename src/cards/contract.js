// ── Shareable Clash Cards V1: the pure contract ──────────────────────────────
// One card-rendering system, two clearly different uses:
//
//   RESULT CARD            an intentional visual recap of a completed Clash
//   CHALLENGE INVITATION   a spoiler-safe invitation attached to an existing
//                          governed Challenge
//
// The card is DRAWN from a structured, allowlisted payload the server built
// from the authoritative result (or the public invitation view). Nothing is
// serialised and hidden; what is not on the list is not on the card, not in the
// alt text, not in the filename and not in the image (a canvas PNG carries no
// metadata). Where a field's safety is uncertain it is simply absent.
export const CARD_VERSION = "1.0.0";
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;
export const CARD_KINDS = Object.freeze({ RESULT: "result", INVITATION: "invitation" });

// The neutral attribution a card carries unless the owner intentionally adds
// their display name for THIS export. A guest never has a name to add.
export const NEUTRAL_LABEL = "MY CLASH";
export const GUEST_LABEL = "GUEST CLASH";

/** The server payload for a RESULT card: the score line and its context, nothing about the five, the coach or the MVP. */
export const RESULT_CARD_FIELDS = Object.freeze([
  "kind", "cardVersion", "score", "outcome", "margin", "era", "eraCustom", "guest", "displayName", "completedAt",
]);
/**
 * The server payload for an INVITATION card: exactly the public invitation
 * contract (src/challenges/contract.js PUBLIC_INVITATION_FIELDS) minus the
 * viewer block — the creator's headline result and era, never the five, the
 * coach, the MVP, the seed, the roll sequence or any Legend opponent detail.
 */
export const INVITATION_CARD_FIELDS = Object.freeze([
  "kind", "cardVersion", "code", "creatorName", "creatorScore", "creatorOutcome", "era", "eraCustom", "expiresAt", "url",
]);
/** Anything on this list anywhere in a card payload, alt text, filename or link is a leak. */
export const FORBIDDEN_CARD_FIELDS = Object.freeze([
  "roster", "creatorRoster", "coach", "creatorCoach", "mvp", "creatorMvp", "legend", "opponent", "seed", "seedId", "rolls", "holds",
  "chaosManifestId", "manifest", "resultId", "result_id", "userId", "user_id", "email", "rating", "rank", "xp", "totalXp", "level",
  "achievements", "token", "session", "cookie", "accessToken", "chaosRunId", "attemptId",
]);

// ── Filenames and alt text ───────────────────────────────────────────────────
// The Challenge code belongs in the link and on the invitation card's face.
// It is NOT in the filename (a file list is not a share surface).
export const cardFilename = (kind) => (kind === CARD_KINDS.INVITATION ? "eraclash-challenge-invitation.png" : "eraclash-clash-card.png");

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");
const OUTCOME_WORD = Object.freeze({ win: "WIN", loss: "LOSS", tie: "TIE" });

/** A safe, display-only name: no angle brackets, collapsed whitespace, 24 characters. */
export const safeName = (name) => String(name || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 24);

/** The era's face label. Ids are like "1990s" or "2010s-pace-and-space"; the card shows the decade word. */
export const eraLabel = (eraId, custom = false) => {
  if (!eraId) return null;
  const s = String(eraId);
  const m = s.match(/^(\d{4})s/);
  return `${m ? `${m[1]}s` : s.toUpperCase().slice(0, 18)} ERA${custom ? " · CHOSEN" : ""}`;
};

/** The margin line: "+18 RESULT MARGIN", "−6 RESULT MARGIN", "EVEN · TIE". Result margin, never "points". */
export const marginLine = ({ outcome, margin }) => (outcome === "tie" ? "EVEN · TIE" : `${signed(outcome === "win" ? margin : -margin)} RESULT MARGIN`);

// ── The drawable model ───────────────────────────────────────────────────────
/**
 * From the server's RESULT payload to what the renderer draws. `includeName`
 * is the owner's explicit choice for THIS export; default off. A guest's card
 * is labelled GUEST CLASH and never implies rated competition.
 */
export const resultCardModel = (payload, { includeName = false } = {}) => {
  if (!payload || payload.kind !== CARD_KINDS.RESULT || !payload.score) return null;
  const { gold, blue } = payload.score;
  const outcome = payload.outcome || (gold === blue ? "tie" : gold > blue ? "win" : "loss");
  const margin = Number.isFinite(payload.margin) ? payload.margin : Math.abs(gold - blue);
  const name = includeName && !payload.guest ? safeName(payload.displayName) : "";
  return {
    kind: CARD_KINDS.RESULT, cardVersion: CARD_VERSION,
    kicker: payload.guest ? GUEST_LABEL : NEUTRAL_LABEL,
    attribution: name || null,
    score: { gold, blue }, outcome, outcomeWord: OUTCOME_WORD[outcome] || "RESULT",
    marginLine: marginLine({ outcome, margin }),
    era: eraLabel(payload.era, payload.eraCustom),
    footer: payload.guest ? "CHAOS CLASH · UNRATED GUEST RESULT" : "CHAOS CLASH · ERACLASH BASKETBALL",
    brand: "ERACLASH",
  };
};
/** From the public invitation to what the renderer draws. It never names the five, the coach or the MVP because it never receives them. */
export const invitationCardModel = (payload, { includeName = false } = {}) => {
  if (!payload || payload.kind !== CARD_KINDS.INVITATION || !payload.code || !payload.creatorScore) return null;
  const { gold, blue } = payload.creatorScore;
  const outcome = payload.creatorOutcome || (gold === blue ? "tie" : gold > blue ? "win" : "loss");
  const name = includeName ? safeName(payload.creatorName) : "";
  return {
    kind: CARD_KINDS.INVITATION, cardVersion: CARD_VERSION,
    kicker: "YOUR TURN.",
    headline: "SAME OPPORTUNITY. BEAT MY RESULT.",
    attribution: name || null,
    score: { gold, blue }, outcome, outcomeWord: OUTCOME_WORD[outcome] || "RESULT",
    marginLine: marginLine({ outcome, margin: Math.abs(gold - blue) }),
    era: eraLabel(payload.era, payload.eraCustom),
    code: payload.code, url: payload.url,
    body: "You get the same opening rolls and rules, make your own decisions, and your result is compared with mine.",
    footer: "CHAOS CLASH CHALLENGE · ERACLASH BASKETBALL",
    brand: "ERACLASH",
  };
};

/** Alt text for the composer preview and the shared file. Built from the model only. */
export const cardAltText = (model) => {
  if (!model) return "EraClash card";
  const who = model.attribution ? `${model.attribution}'s` : model.kind === CARD_KINDS.INVITATION ? "A" : "My";
  const era = model.era ? `, ${model.era.toLowerCase()}` : "";
  return model.kind === CARD_KINDS.INVITATION
    ? `${who} EraClash Challenge invitation: beat a ${model.score.gold}–${model.score.blue} ${model.outcomeWord.toLowerCase()}${era}. Code ${model.code}.`
    : `${who} EraClash Clash card: ${model.score.gold}–${model.score.blue} ${model.outcomeWord.toLowerCase()}, ${model.marginLine.toLowerCase()}${era}.`;
};

/** The share text that accompanies a native share (the link is passed separately, once). */
export const shareTextFor = (model) => (model?.kind === CARD_KINDS.INVITATION ? "Your turn. Same opportunity — beat my result in EraClash." : "My EraClash Clash.");

// ── Telemetry (closed; never a code, a name, an id or a payload) ─────────────
export const CARD_EVENTS = Object.freeze({ OPENED: "card_composer_opened", EXPORTED: "card_exported", SHARED: "card_share_invoked", FAILED: "card_export_failed" });
export const CARD_EVENT_METADATA_ALLOWED = Object.freeze(["cardVersion", "kind", "method", "withName", "success", "failureCode", "authState"]);
