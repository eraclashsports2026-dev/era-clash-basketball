// ── /api/v3meta — coach & era data for the V3 UI (read-only, public) ───────────
//   GET                        → { eras, coaches } (public card info only)
//   POST {goldIds, eraStyleId} → { recommended } (3 roster-fit coach cards)
// Engine attributes never leave the server in raw form beyond what the cards
// need; there is no coach OVR to expose. Flag-gated with the engine.
import { sendError, newRequestId } from "./_lib/errors.js";
import { flags } from "./_lib/flags.js";
import { tooLarge, validateTeamIds, validEraId } from "./_lib/validate.js";
import { COACHES } from "../src/v3/coaches.js";
import { ERA_STYLES, ERA_NOTE, getEra, eraInteraction } from "../src/v3/eraStyles.js";
import { recommendCoaches } from "../src/v3/analysis.js";
import { teamDNA } from "../src/v3/playerProfile.js";

const publicCoach = (c) => ({
  id: c.id, name: c.name, span: c.span, championships: c.championships,
  teams: c.teams, systemTags: c.systemTags, bestWith: c.bestWith, concern: c.concern,
});
const publicEra = (e) => ({
  id: e.id, label: e.label, anchorSeason: e.anchorSeason,
  styleSummary: e.styleSummary,
  threePoint: e.rules.threePoint,
});

export default async function handler(req, res) {
  const requestId = newRequestId();
  if (!flags().simV3) return sendError(res, "FEATURE_DISABLED", requestId);

  if (req.method === "GET") {
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.status(200).json({
      note: ERA_NOTE,
      eras: ERA_STYLES.map(publicEra),
      coaches: COACHES.map(publicCoach),
    });
  }

  if (req.method !== "POST") return sendError(res, "VALIDATION_FAILURE", requestId);
  if (tooLarge(req, 2048)) return sendError(res, "PAYLOAD_TOO_LARGE", requestId);
  const team = validateTeamIds(req.body?.goldIds);
  if (!team) return sendError(res, "VALIDATION_FAILURE", requestId);
  const era = validEraId(req.body?.eraStyleId) ? getEra(req.body.eraStyleId) : null;
  return res.status(200).json({
    recommended: recommendCoaches(team, era, 3),
    eraNote: era ? eraInteraction(era, teamDNA(team)) : null,
  });
}
