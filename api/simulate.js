// ── EraClash Basketball — Simulation API ──────────────────────────────────────
// This serverless function runs on Vercel. It holds your Anthropic API key in a
// server-side environment variable (ANTHROPIC_API_KEY) so it is NEVER exposed to
// the browser. The frontend sends structured team data; this function builds the
// analyst prompt and calls Claude. Users can only run basketball simulations —
// they cannot send arbitrary prompts through your key.

const POSITIONS = ["PG", "SG", "SF", "PF", "C"];

function buildPrompt(myTeam, oppTeam, seriesType) {
  const sl = seriesType === "single" ? "single game" : "best-of-7 series";
  const line = (p, i) =>
    `- [${POSITIONS[i]}] ${p.name} (${p.decade}, ${p.team}): ${p.pts}pts ${p.reb}reb ${p.ast}ast ${p.stl}stl ${p.blk}blk`;

  return `You are an elite NBA analytics engine with deep knowledge of basketball strategy, team construction, and historical player evaluation. Simulate a ${sl} between these two all-time teams. Always refer to them as "Team Gold" and "Team Blue".

Team Gold (in slot order PG/SG/SF/PF/C):
${myTeam.map(line).join("\n")}

Team Blue (in slot order PG/SG/SF/PF/C):
${oppTeam.map(line).join("\n")}

Evaluate both teams across ALL of the following dimensions — raw stats are only one factor:

TEAM CONSTRUCTION: Does each team have the right personnel mix — a primary ball handler, perimeter shooters, a playmaker, frontcourt presence, and a rim protector? Teams missing key roles (no true PG, no rim protection, no spacing) should be penalized significantly even if their raw stats are high. Two dominant bigs with no guard play, or a lineup of all wings with no interior defense, should struggle.

POSITIONAL MATCHUPS: Analyze each position head-to-head. Which team wins the PG matchup? SG? SF? PF? C? Consider both offensive and defensive implications. A mismatch in one slot can swing a series even if the other team has more total talent.

TEAM CHEMISTRY & BALANCE: Does the lineup flow together? Are there too many ball-dominant players? Do they complement each other — scoring, playmaking, defense, rebounding distributed across the 5? A team of 5 high scorers with no defenders is not a good team. A team with a star and 4 complementary players may outperform a team of 5 individual stars with poor fit.

SPACING & SHOOTING: Can the team space the floor to enable drives and ball movement? A lineup with no perimeter shooting collapses defensively and offensively. Reward lineups that have shooting spread across multiple positions.

DEFENSIVE VERSATILITY: Can players guard multiple positions? A team with multiple defenders who can switch is far superior to one that is a liability on defense. Rim protection + perimeter defense together create elite defensive teams.

PLAYMAKING DEPTH: Who creates for others? If a team has only one playmaker, defenses can key on them. Teams with multiple assist threats create unsolvable defensive problems.

HISTORICAL CONTEXT: Factor in what made each player great in their era. Some eras were more physical, faster, or more perimeter-oriented. Consider how players would translate.

OUTPUT RULES — these are mandatory for accuracy:
1. The winner should reflect which team is better CONSTRUCTED overall (positional fit, chemistry, spacing, defense, matchups) — not just raw stats. A balanced team can beat a top-heavy one.
2. Generate realistic individual box scores for all 5 players on each team. ${seriesType === "single" ? "For a SINGLE GAME, these are that player's points/rebounds/assists/steals/blocks for the game." : "For a BEST-OF-7 SERIES, these are that player's per-game AVERAGES across the series."}
3. CRITICAL: The team that wins MUST have a higher total than the team that loses. The winning team's five players' points must sum higher than the losing team's five players' points. Make the box scores internally consistent with the winner you choose.
4. The MVP must be one of the 10 players listed above, and should be the standout performer from the WINNING team in almost all cases. The mvpReason should reference that player's actual box-score line you generated (not career stats).
5. The summary and strengths/weaknesses must explain WHY teams win or lose based on construction, matchups, and fit. Do not reveal any scoring formula — narrate like an expert analyst.

Respond ONLY with valid JSON (no markdown, no backticks):
{"winner":"Gold or Blue","seriesResult":"e.g. 108-101 or 4-2","teamAStats":[{"name":"","pts":0,"reb":0,"ast":0,"stl":0,"blk":0}],"teamBStats":[{"name":"","pts":0,"reb":0,"ast":0,"stl":0,"blk":0}],"summary":"2-3 sentences, analytical narrative using Team Gold and Team Blue — explain WHY the winner won based on team construction and matchups","teamAStrengths":["specific analytical strength, max 10 words","specific analytical strength, max 10 words","specific analytical strength, max 10 words"],"teamAWeaknesses":["specific analytical weakness, max 10 words","specific analytical weakness, max 10 words"],"teamBStrengths":["specific analytical strength, max 10 words","specific analytical strength, max 10 words","specific analytical strength, max 10 words"],"teamBWeaknesses":["specific analytical weakness, max 10 words","specific analytical weakness, max 10 words"],"mvp":"player name","mvpReason":"one sentence, max 15 words"}`;
}

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server is not configured. Missing API key." });
  }

  try {
    const { myTeam, oppTeam, seriesType } = req.body || {};

    // Validate input — only well-formed 5-player teams are accepted.
    // This prevents abuse: users can't send arbitrary prompts through your key.
    if (
      !Array.isArray(myTeam) || myTeam.length !== 5 ||
      !Array.isArray(oppTeam) || oppTeam.length !== 5 ||
      (seriesType !== "single" && seriesType !== "series7")
    ) {
      return res.status(400).json({ error: "Invalid team data." });
    }
    const valid = (t) => t.every(p => p && p.name && p.decade && p.team &&
      typeof p.pts === "number" && typeof p.reb === "number");
    if (!valid(myTeam) || !valid(oppTeam)) {
      return res.status(400).json({ error: "Invalid player data." });
    }

    const prompt = buildPrompt(myTeam, oppTeam, seriesType);

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await anthropicRes.json();
    if (data.error) {
      console.error("Anthropic error:", data.error);
      return res.status(502).json({ error: "Simulation engine error. Please try again." });
    }

    const text = data.content?.find(b => b.type === "text")?.text || "";
    return res.status(200).json({ text });
  } catch (err) {
    console.error("Simulate handler error:", err);
    return res.status(500).json({ error: "Simulation failed. Please try again." });
  }
}
