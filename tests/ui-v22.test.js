import { describe, it, expect } from "vitest";
import { PLAYERS } from "../src/players.js";
import { chemistryScore, chemistryLabel, chemistryTags, teamFit } from "../src/chemistryView.js";
import { winProbability } from "../src/components/MatchupPreview.jsx";
import { classifyLicense, eraMatch } from "../image-pipeline/discover.mjs";
import approved from "../src/images/approved.json";

const byId = (id) => PLAYERS.find((p) => p.id === id);
const team = (...ids) => ids.map(byId);

describe("chemistry display layer", () => {
  const elite = team("magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s");
  const flawed = team("ben-00s", "reggie-90s", "dantley-80s", "mcHale-80s", "ewing-90s");
  it("score is a 25–99 rescaling of real chemistry, null under 5 players", () => {
    expect(chemistryScore(elite.slice(0, 4))).toBeNull();
    const s1 = chemistryScore(elite), s2 = chemistryScore(flawed);
    for (const s of [s1, s2]) { expect(s).toBeGreaterThanOrEqual(25); expect(s).toBeLessThanOrEqual(99); }
    expect(s1).toBeGreaterThan(s2); // elite construction outscores the no-playmaking team
    expect(["EXCELLENT", "GOOD", "AVERAGE", "POOR"]).toContain(chemistryLabel(s1));
  });
  it("tags mirror analyzeBalance + attribute insights", () => {
    const { strengths, concerns } = chemistryTags(flawed);
    expect(concerns.some((c) => c.label === "No playmaking engine")).toBe(true);
    expect(Array.isArray(strengths)).toBe(true);
  });
  it("teamFit derives from real chemistry outcomes (OVR ≠ FIT)", () => {
    const fits = elite.map((_, i) => teamFit(elite, i));
    for (const f of fits) expect(["EXCELLENT", "GOOD", "NEUTRAL", "POOR"]).toContain(f);
    // a volume scorer who drives hero-ball risk without anchoring any team
    // strength rates POOR — while Wilt in a similar lineup stays NEUTRAL
    // because he earns credit back by owning the glass
    const heroPete = team("pete-70s", "cooper-80s", "bowen-2ks", "camby-2ks", "smart-20s");
    expect(teamFit(heroPete, 0)).toBe("POOR");
    const heroWilt = team("wilt-60s", "cooper-80s", "bowen-2ks", "ben-00s", "smart-20s");
    expect(["NEUTRAL", "GOOD"]).toContain(teamFit(heroWilt, 0));
  });
});

describe("win probability display", () => {
  it("uses the engine model, clamped to 4–96%", () => {
    const strong = team("magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s");
    const weak = team("mookie-90s", "cooper-80s", "bowen-2ks", "rodman-90s", "camby-2ks");
    const p = winProbability(strong, weak);
    expect(p).toBeGreaterThan(0.5);
    expect(p).toBeLessThanOrEqual(0.96);
    expect(winProbability(weak, strong)).toBeGreaterThanOrEqual(0.04);
    expect(winProbability(strong, strong)).toBeCloseTo(0.5, 5);
  });
});

describe("image pipeline license whitelist", () => {
  it("accepts PD / CC0 / CC BY", () => {
    for (const s of ["Public domain", "CC0", "CC BY 2.0", "CC BY 4.0", "PD-USGov"]) {
      expect(classifyLicense(s), s).toBe("ok");
    }
  });
  it("flags CC BY-SA instead of silently treating it as CC BY", () => {
    for (const s of ["CC BY-SA 3.0", "CC BY-SA 4.0", "cc-by-sa-2.0"]) {
      expect(classifyLicense(s), s).toBe("flag_by_sa");
    }
  });
  it("rejects NC/ND/unknown/empty licenses automatically", () => {
    expect(classifyLicense("CC BY-NC 2.0")).toBe("reject_terms");
    expect(classifyLicense("CC BY-ND 4.0")).toBe("reject_terms");
    expect(classifyLicense("Fair use")).toBe("reject_terms");
    expect(classifyLicense("")).toBe("reject_unknown");
    expect(classifyLicense("Some custom license")).toBe("reject_unknown");
  });
  it("era matching classifies dates against player decades", () => {
    expect(eraMatch("1967", "1960s")).toBe("exact");
    expect(eraMatch("1972-05-01", "1960s")).toBe("near");
    expect(eraMatch("2015", "1980s")).toBe("off_era");
    expect(eraMatch("no date here", "1980s")).toBe("unknown");
  });
});

describe("approved image registry", () => {
  it("only ships human-approved entries with full provenance", () => {
    for (const img of approved.images) {
      expect(img.approved_for_product).toBe(true);
      expect(img.license_verified).toBe(true);
      expect(img.identity_verified).toBe(true);
      expect(img.source_page).toBeTruthy();
      expect(img.license_name).toBeTruthy();
      expect(img.local_asset_path).toMatch(/^\/players\//);
      expect(PLAYERS.some((p) => p.id === img.player_id)).toBe(true);
    }
  });
});
