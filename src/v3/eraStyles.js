// ── Era Styles ─────────────────────────────────────────────────────────────────
// One shared basketball ENVIRONMENT per game — never a power ranking. An Era
// Style changes what is legal, what shots are worth, how physical perimeter
// defense may be, and the possession economy. WHO benefits is decided by the
// players, construction, coaches, and matchup inside that environment. There
// is deliberately no "era bonus" anywhere in the engine.
import erasData from "./data/eras.js";

export const ERA_STYLES = erasData.eras;
export const ERA_NOTE = erasData.note;
export const getEra = (id) => ERA_STYLES.find((e) => e.id === id) || null;
export const DEFAULT_ERA_ID = "2020s"; // frictionless onboarding: today's game

// Dynamic, matchup-specific era interaction text (no numbers, no bonuses) —
// drives the "HOW THIS AFFECTS THIS MATCHUP" panel.
export const eraInteraction = (era, dnas) => {
  const outside = dnas.reduce((s, d) => s + d.outsideShooting, 0) / 5;
  const threes = dnas.reduce((s, d) => s + d.threeTendency, 0) / 5;
  const interior = Math.max(...dnas.map((d) => d.postScoring));
  const rim = dnas.reduce((s, d) => s + d.rimProtection, 0) / 5;
  const notes = [];
  if (!era.rules.threePoint) {
    if (threes >= 5) notes.push("Long-range shooting keeps its gravity, but deep shots only count for two — expect this attack to trade some volume for efficient mid-range looks.");
    if (interior >= 7) notes.push("Interior scoring carries extra weight with the paint at a premium.");
  } else if (era.environment.tpaPerGame >= 20) {
    if (threes >= 6) notes.push("A volume-shooting environment plays straight into this team's perimeter game.");
    if (interior >= 7 && outside < 5) notes.push("Post play still works, but the spacing era stretches interior defenders thin — and asks this offense to create room without shooters.");
  } else if (era.rules.handCheckAllowed) {
    if (rim >= 6) notes.push("Physical defensive rules reward this team's rim protection and toughness.");
    if (outside >= 6) notes.push("Perimeter creation faces hand-checking — movement shooting stays valuable, but clean looks are harder to manufacture.");
  }
  if (era.rules.illegalDefenseRestrictions && interior >= 7) notes.push("Illegal-defense rules forbid pre-rotated help — one-on-one post scorers feast.");
  if (!era.rules.illegalDefenseRestrictions && rim >= 6.5) notes.push("Legal zones let this rim protection anchor a packed paint.");
  return notes.slice(0, 2).join(" ") || "This roster translates without major friction into this environment.";
};
