import { describe, it, expect } from "vitest";
import { isKnownRoute, PLAY_MODES, KNOWN_ROUTES, KNOWN_ROUTE_PREFIXES } from "../src/navigation.js";

// 2026-09-10 audit: a mistyped or stale address rendered the Chaos board under
// the wrong URL. The registry now says which addresses exist; App sends the
// rest to the lobby with a notice.
describe("known routes", () => {
  it("every declared address is known", () => {
    for (const r of ["/", "/play", "/play/", ...PLAY_MODES.map((m) => m.route), ...KNOWN_ROUTES, "/membership", "/membership/plus", "/fantasy/live", "/modes/chaos", "/auth/callback", "/challenge/EC-AAAA-BBBB", "/result/abc123", "/player/abc123", "/dev/basketball-theme-lab"]) {
      expect(isKnownRoute(r), r).toBe(true);
    }
  });
  it("a typo, a stale path or a partial prefix is not", () => {
    for (const r of ["/this-route-does-not-exist", "/play/nope", "/leaderboards", "/my-eraclash/settings", "/membershipx", "/players", "/challenge", "/p/abc"]) {
      expect(isKnownRoute(r), r).toBe(false);
    }
  });
  it("a family prefix needs a child segment; a section root is listed as a route", () => {
    for (const pre of KNOWN_ROUTE_PREFIXES) expect(pre.startsWith("/")).toBe(true);
    expect(isKnownRoute("/membership")).toBe(true);
    expect(isKnownRoute("/fantasy")).toBe(false);
    expect(isKnownRoute("/player")).toBe(false);
  });
});
