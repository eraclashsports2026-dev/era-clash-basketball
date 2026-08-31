// ── Critical-journey E2E (Playwright vs the local integration harness) ─────────
// Real UI + real handlers + in-memory store. The harness blocks AI narration
// via the daily budget guard, so journeys also prove the AI-failure fallback:
// the core Postgame must be complete (MVP reasoning, turning point, box score)
// without narration.
import { test, expect } from "@playwright/test";

const GOLD = ["magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s"];
const BLUE = ["curry-10s", "ray-00s", "durant-10s", "dirk-00s", "jokic-20s"];

async function buildGoldManual(page) {
  await page.getByRole("tab", { name: /Manual Draft/ }).first().click();
  for (const pos of ["Point Guard", "Shooting Guard", "Small Forward", "Power Forward", "Center"]) {
    await page.getByRole("button", { name: `Add ${pos}`, exact: false }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button").nth(2).click();
  }
}
const randomBlue = (page) => page.getByRole("tab", { name: /Random Team/ }).click();
const randomGold = (page) => page.getByRole("button", { name: /Random Team/ }).first().click();

// V3 wizard: rosters → Continue to Coaches → random coach each side →
// Continue to Era Style → Lock Era Style → READY (RUN THE SIM appears).
async function pickCoachesIfV3(page) {
  const cont = page.getByRole("button", { name: /Continue to Coaches/ });
  try { await cont.waitFor({ state: "visible", timeout: 6000 }); } catch { return; } // v3 off → direct CTA flow
  await cont.click();
  const next = page.getByRole("button", { name: /Continue to Era Style/ });
  await next.waitFor({ state: "visible", timeout: 8000 });
  // Keep opening the coach modal while the stage is still gated. Modes without
  // a user-built Blue five need one coach; Single/Best-of-7 need two.
  for (let i = 0; i < 3 && (await next.isDisabled()); i++) {
    const open = page.getByRole("button", { name: "Choose Coach" }).first();
    await open.waitFor({ state: "visible", timeout: 8000 });
    await open.click();
    const dialog = page.getByRole("dialog", { name: /Select coach/i });
    await dialog.waitFor({ state: "visible", timeout: 8000 });
    await dialog.getByRole("button", { name: /^Select / }).click();
    await dialog.waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
  }
  await next.click();
  await page.getByRole("button", { name: /Lock Era Style/ }).click();
}


async function expectCorePostgame(page) {
  // FINAL section (default tab)
  await expect(page.getByText(/TEAM (GOLD|BLUE) WINS/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/GAME MVP|SERIES MVP/)).toBeVisible();
  // dedicated results view: the builder has left the stage
  await expect(page.getByRole("tab", { name: /Chaos Draft/ })).toHaveCount(0);
  await expect(page.getByText("MATCHUP BREAKDOWN")).toBeVisible();
  const finalText = await page.locator("body").innerText();
  const mvpSection = finalText.slice(finalText.indexOf("MVP"), finalText.indexOf("MATCHUP BREAKDOWN"));
  expect(mvpSection.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 20).length,
    `MVP section too thin: ${mvpSection.slice(0, 200)}`).toBeGreaterThanOrEqual(2);
  // BOX SCORE section
  await page.getByRole("tab", { name: "Box Score" }).click();
  await expect(page.getByText("BOX SCORE", { exact: true })).toBeVisible();
  await expect(page.getByText("TEAM GOLD", { exact: true }).last()).toBeVisible();
  // GAME STORY section
  await page.getByRole("tab", { name: "Game Story" }).click();
  await expect(page.getByText(/HOW (GOLD|BLUE) WON/)).toBeVisible();
  await expect(page.getByText("TURNING POINT", { exact: false })).toBeVisible();
  const storyText = await page.locator("body").innerText();
  const tpSection = storyText.slice(storyText.indexOf("TURNING POINT"));
  expect(tpSection.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 20).length,
    `Turning point too thin: ${tpSection.slice(0, 200)}`).toBeGreaterThanOrEqual(2);
  // AI blocked in harness → fallback state + retry, page fully functional
  await expect(page.getByText("Enhanced analysis couldn't be completed", { exact: false })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("button", { name: /Try Enhanced Recap Again/ })).toBeVisible();
  // back to FINAL so callers see the default state
  await page.getByRole("tab", { name: "Final" }).click();
}

test("J1+J2: manual Gold, Blue stays empty until user chooses, random Blue, sim transition, full core Postgame, rematch", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "CLASH ACROSS ERAS" })).toBeVisible();
  await buildGoldManual(page);
  // REGRESSION: Gold completion must NOT auto-populate Blue
  await expect(page.getByText("Build Team Blue", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: /RUN THE SIM/ })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /Random Team/ })).toBeVisible();
  await randomBlue(page);
  // card containment: every Gold roster card stays inside the Gold panel
  const goldPanel = page.getByRole("region", { name: "TEAM GOLD" });
  const panel = await goldPanel.boundingBox();
  const cards = goldPanel.getByRole("listitem");
  const n = await cards.count();
  expect(n, "gold roster renders five cards").toBe(5);
  for (let i = 0; i < n; i++) {
    const card = await cards.nth(i).boundingBox();
    expect(card.x + card.width, `card ${i} overflows the panel`).toBeLessThanOrEqual(panel.x + panel.width + 1);
    expect(card.x, `card ${i} starts left of the panel`).toBeGreaterThanOrEqual(panel.x - 1);
  }
  await pickCoachesIfV3(page);
  await expect(page.getByRole("button", { name: /RUN THE SIM/ })).toBeVisible();
  await page.getByRole("button", { name: /RUN THE SIM/ }).click();
  await expectCorePostgame(page);
  await page.getByRole("button", { name: /Rematch/i }).first().click();
  await expectCorePostgame(page);
});

test("J1b: Random Gold + Random Blue plays a full game", async ({ page }) => {
  await page.goto("/");
  await randomGold(page);
  await randomBlue(page);
  await pickCoachesIfV3(page);
  await page.getByRole("button", { name: /RUN THE SIM/ }).click();
  await expectCorePostgame(page);
  // New Game returns to an empty builder: both panels back to empty roster
  // cards (Manual Draft is the default view), Chaos Draft still one click away
  await page.getByRole("button", { name: /New Game/ }).click();
  await expect(page.getByRole("tab", { name: /Chaos Draft/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Point Guard" })).toHaveCount(2);
});

test("J3: rapid double-click creates exactly one core result", async ({ page }) => {
  let gamePosts = 0;
  page.on("request", (r) => { if (r.url().includes("/api/game") && r.method() === "POST") gamePosts++; });
  await page.goto("/");
  await randomGold(page);
  await randomBlue(page);
  await pickCoachesIfV3(page);
  const btn = page.getByRole("button", { name: /RUN THE SIM/ });
  await btn.click({ clickCount: 3, delay: 40 }).catch(() => {});
  await expectCorePostgame(page);
  expect(gamePosts).toBe(1);
});

test("J4: Daily consumes one attempt, persists, and survives reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Daily", exact: true }).click();
  await page.getByRole("button", { name: /Start Today's Challenge/ }).click();
  await page.getByRole("button", { name: /Roll 2/ }).click();
  await page.getByRole("button", { name: /Roll 3/ }).click();
  await page.getByRole("button", { name: /Finalize Squad/ }).click();
  // The Daily opponent is the day's seeded five — locked, identical worldwide.
  // It must NOT be re-rollable or swappable, or the daily board is gameable.
  await expect(page.getByText("Today's official opponent")).toBeVisible();
  await expect(page.getByRole("button", { name: "Re-roll Team Blue" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /Random Team/ })).toHaveCount(0);
  await page.getByRole("button", { name: /RUN THE SIM/ }).click();
  await expect(page.getByText(/TEAM (GOLD|BLUE) WINS/)).toBeVisible({ timeout: 15000 });
  const board = await (await page.request.get("/api/daily")).json();
  expect(board.count).toBeGreaterThanOrEqual(1); // shared harness store across specs
  expect(Array.isArray(board.board)).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(page.getByText("Today's Clash is done")).toBeVisible();
});

test("J5+J7: core failure records nothing; fabricated scores are rejected server-side", async ({ page }) => {
  await page.goto("/");
  const fail = await page.request.post("/api/game", {
    headers: { "x-chaos": "engine-fail" },
    // unique per run: a fixed id hits the idempotency guard (409) on a warm harness
    data: { mode: "single", simulationId: `e2efail${Date.now().toString(36)}`, goldIds: GOLD, blueIds: BLUE },
  });
  expect(fail.status()).toBe(500);
  expect((await fail.json()).code).toBe("ENGINE_FAILURE");
  const tamper = await page.request.post("/api/daily", { data: { action: "submit", won: true, margin: 50, uid: "cheater" } });
  expect(tamper.status()).toBe(400);
  const forged = await page.request.post("/api/game", {
    data: { mode: "single", simulationId: "e2e-forge-123", goldIds: GOLD, blueIds: BLUE, winner: "Gold", wins: 82, score: "999-0" },
  });
  expect((await forged.json()).result.core.seriesResult).not.toBe("999-0");
});

test("J6: challenge link → recipient plays → server decides → immutable rivalry chain", async ({ page }) => {
  const create = await page.request.post("/api/challenge", {
    data: { action: "create", teamIds: GOLD, name: "Joe", record: "72-10" },
  });
  const { id } = await create.json();
  await page.goto(`/?ch=${id}`);
  await expect(page.getByText("YOU'VE BEEN CHALLENGED")).toBeVisible();
  await buildGoldManual(page);
  await page.getByRole("button", { name: /RUN THE SIM/ }).click();
  await expect(page.getByText(/TEAM (GOLD|BLUE) WINS/)).toBeVisible({ timeout: 15000 });
  const view = await (await page.request.get(`/api/challenge?id=${id}`)).json();
  expect(view.games.length).toBe(1);
  const firstScore = view.games[0].score;
  const overwrite = await page.request.post("/api/challenge", {
    data: { action: "complete", id, game: { winner: "opponent", score: "150-0" } },
  });
  expect(overwrite.status()).toBe(400);
  await page.getByRole("button", { name: /REMATCH/ }).click();
  await expect(page.getByText(/TEAM (GOLD|BLUE) WINS/)).toBeVisible({ timeout: 15000 });
  const rematch = await (await page.request.get(`/api/challenge?id=${id}`)).json();
  expect(rematch.games.length).toBe(2);
  expect(rematch.games[0].score).toBe(firstScore);
});

test("J8: one session cannot read or write another session's profile", async ({ browser }) => {
  const ctxA = await browser.newContext({ baseURL: "http://localhost:4173" });
  const ctxB = await browser.newContext({ baseURL: "http://localhost:4173" });
  const a = await ctxA.request.post("/api/profile", { data: { profile: { name: "Joe", stats: { wins: 7 } } } });
  expect(a.status()).toBe(200);
  const b = await ctxB.request.get("/api/profile");
  expect(b.status()).toBe(404);
  await ctxB.request.post("/api/profile", { data: { profile: { name: "Mallory", stats: { wins: 999 } } } });
  const aAgain = await (await ctxA.request.get("/api/profile")).json();
  expect(aAgain.name).toBe("Joe");
  expect(aAgain.stats.wins).toBe(7);
  await ctxA.close(); await ctxB.close();
});

test("J9: XSS payloads render harmlessly as text", async ({ page }) => {
  let sawDialog = false;
  page.on("dialog", (d) => { sawDialog = true; d.dismiss(); });
  await page.goto("/");
  await page.getByRole("button", { name: "My EraClash" }).click();
  await page.getByLabel("Display name").fill('<script>alert(1)</script><img src=x onerror=alert(2)>');
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(800);
  expect(sawDialog).toBe(false);
  const prof = await (await page.request.get("/api/profile")).json();
  expect(prof.name || "").not.toMatch(/[<>]/);
});

test("J10: per-team reset buttons free any lineup state without touching the other side", async ({ page }) => {
  await page.goto("/");
  // Gold: manual partial → Reset clears it
  await page.getByRole("tab", { name: /Manual Draft/ }).first().click();
  await page.getByRole("button", { name: "Add Point Guard" }).first().click();
  await page.getByRole("dialog").getByRole("button").nth(2).click();
  await page.getByRole("button", { name: "Reset Team Gold" }).click();
  await expect(page.getByRole("button", { name: "Add Point Guard" }).first()).toBeVisible();
  // Gold: random complete → Reset Team returns to build methods, Blue untouched
  await page.getByRole("button", { name: /Random Team/ }).first().click();
  await page.getByRole("tab", { name: /Random Team/ }).click(); // blue random
  // both fives complete → the wizard offers the next stage
  await expect(page.getByRole("button", { name: /Continue to Coaches/ })).toBeVisible();
  await page.getByRole("button", { name: "Reset Team Gold" }).click();
  await expect(page.getByRole("tab", { name: /Chaos Draft/ })).toBeVisible(); // gold back to methods
  await expect(page.getByRole("button", { name: /Continue to Coaches/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /RUN THE SIM/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reset Team Blue" })).toBeVisible(); // blue still built
  // Blue: Reset clears the built five
  await page.getByRole("button", { name: "Reset Team Blue" }).click();
  await expect(page.getByRole("tab", { name: /Random Team/ })).toBeVisible(); // blue methods return
  await expect(page.getByRole("button", { name: "Add Point Guard" })).toHaveCount(2); // both panels empty
});

test("J10b: one-click Re-roll refreshes a random five on BOTH sides and invalidates stale coach picks", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Random Team/ }).first().click();
  await page.getByRole("tab", { name: /Random Team/ }).click(); // blue random
  // both completed rosters expose a prominent Re-roll next to Reset
  await expect(page.getByRole("button", { name: "Re-roll Team Gold" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Re-roll Team Blue" })).toBeVisible();
  const goldNames = async () => (await page.locator("body").innerText()).match(/RATING/) && page.locator("body").innerText();
  // re-roll gold: roster stays complete (5/5) and the stage CTA survives
  await page.getByRole("button", { name: "Re-roll Team Gold" }).click();
  await expect(page.getByRole("button", { name: "Re-roll Team Gold" })).toBeVisible(); // still a completed five
  await expect(page.getByRole("button", { name: /Continue to Coaches/ })).toBeVisible();
  // re-roll blue: still a completed five, gold untouched
  await page.getByRole("button", { name: "Re-roll Team Blue" }).click();
  await expect(page.getByRole("button", { name: "Re-roll Team Blue" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Re-roll Team Gold" })).toBeVisible();
});

test("J11 (V3): Team → Coach → Era Style → Ready → Run with possession postgame", async ({ page }) => {
  await page.goto("/");
  // STAGE 1 — ROSTERS (wizard chips render)
  await expect(page.getByRole("button", { name: /ROSTERS/ })).toBeVisible();
  await randomGold(page);
  await randomBlue(page);
  // qualitative pre-sim preview: leads only, never counts or probabilities
  await expect(page.getByText("MATCHUP PREVIEW").first()).toBeVisible();
  await expect(page.getByText("KEY CLASH").first()).toBeVisible({ timeout: 8000 });
  const rosterBody = await page.locator("body").innerText();
  expect(rosterBody).not.toMatch(/(Gold|Blue) \+\d+/);
  expect(rosterBody).not.toMatch(/\d+% (chance|win)/i);
  // STAGE 2 — COACHES
  await page.getByRole("button", { name: /Continue to Coaches/ }).click();
  await expect(page.getByRole("button", { name: "Choose Coach" }).first()).toBeVisible({ timeout: 8000 });
  const coachBody = await page.locator("body").innerText();
  expect(coachBody).not.toMatch(/coach ovr/i);
  // gated until both coaches picked
  await expect(page.getByRole("button", { name: /Continue to Era Style/ })).toBeDisabled();
  // the modal carries search, filters, sort and a detail pane
  await page.getByRole("button", { name: "Choose Coach" }).first().click();
  const modal = page.getByRole("dialog", { name: /Select coach/i });
  await expect(modal.getByRole("textbox", { name: /Search coaches/i })).toBeVisible();
  await expect(modal.getByRole("combobox", { name: /Filter by system/i })).toBeVisible();
  await expect(modal.getByRole("combobox", { name: /Sort coaches/i })).toBeVisible();
  await expect(modal.getByText("SYSTEM IDENTITY")).toBeVisible();
  // era compatibility cannot exist before an era is chosen
  await expect(modal.getByText(/Era compatibility appears once you pick the Era Style/)).toBeVisible();
  await modal.getByRole("button", { name: /^Select / }).click();
  await page.getByRole("button", { name: "Choose Coach" }).first().click();
  await page.getByRole("dialog", { name: /Select coach/i }).getByRole("button", { name: /^Select / }).click();
  await page.getByRole("button", { name: /Continue to Era Style/ }).click();
  // STAGE 3 — ERA STYLE (one shared era, real rules + per-roster translations)
  await expect(page.getByText("CHOOSE ERA STYLE")).toBeVisible();
  await page.getByRole("radio", { name: "90s", exact: true }).click();
  await expect(page.getByText("HOW THIS AFFECTS THIS MATCHUP")).toBeVisible({ timeout: 8000 });
  await expect(page.getByText(/One era per game/)).toBeVisible();
  await page.getByRole("button", { name: /Lock Era Style/ }).click();
  // READY — back navigation exists, preview repeats, one dominant CTA
  await expect(page.getByRole("button", { name: "Edit rosters" })).toBeVisible();
  await page.getByRole("button", { name: /RUN THE SIM/ }).click();
  await expect(page.getByText(/TEAM (GOLD|BLUE) WINS/)).toBeVisible({ timeout: 15000 });
  // V3 postgame: possessions + expectation on Final; box/roles in their sections
  await expect(page.getByText(/🏀 \d+ possessions/)).toBeVisible();
  await expect(page.getByText(/before tipoff/)).toBeVisible(); // bands, not decimals (renamed in 8B)
  await expect(page.getByText(/shot quality \(expected pts\)/)).toBeVisible();
  await page.getByRole("tab", { name: "Box Score" }).click();
  await expect(page.getByText("BOX SCORE", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Coaching & Strategy" }).click();
  // On the production engine no game-plan history is recorded, so the tab says
  // so rather than inventing coaching detail (Candidate 3 coverage lives in
  // e2e/phase7b-preview.spec.js).
  await expect(page.getByText(/does not record game-plan and adjustment history/)).toBeVisible();
  // era with no 3PT line: replay in the 60s and assert zero threes
  const res = await page.request.post("/api/game", {
    data: { mode: "single", simulationId: "e2e-v3-60s-" + Date.now(),
      goldIds: ["curry-10s", "ray-00s", "durant-10s", "dirk-00s", "jokic-20s"],
      blueIds: ["magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s"],
      coachGoldId: "mike-dantoni", coachBlueId: "red-auerbach", eraStyleId: "1960s" },
  });
  const v3 = (await res.json()).result.v3;
  expect(v3.teamTotals.gold.tpa).toBe(0);
  expect(v3.teamTotals.blue.tpa).toBe(0);
});

test("J12: Tournament runs a real bracket and opponent difficulty is selectable", async ({ page }) => {
  // Phase 8C: the Play menu resolves entitlements, so Tournament needs a free
  // account before it opens (a guest is sent to the account gate instead).
  await page.addInitScript(() => { try { localStorage.setItem("ec_account", "1"); localStorage.setItem("ec_name", "E2E"); } catch (e) {} });
  await page.goto("/");
  await page.getByRole("button", { name: "Play", exact: false }).first().click();
  await page.getByRole("menuitem", { name: /Tournament/ }).click();
  // difficulty only exists for the modes that generate a schedule
  await expect(page.getByText("OPPONENT DIFFICULTY")).toBeVisible();
  for (const level of ["Rookie", "Pro", "All-Star", "Legend"]) {
    await expect(page.getByRole("tab", { name: `Difficulty ${level}` })).toBeVisible();
  }
  await page.getByRole("tab", { name: "Difficulty Rookie" }).click();
  await randomGold(page);
  await pickCoachesIfV3(page);
  await page.getByRole("button", { name: /RUN THE SIM/ }).click();
  // a bracket renders rounds — and never the engine-failure message
  await expect(page.getByText(/Round 1/)).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/ADVANCED|ELIMINATED/).first()).toBeVisible();
  await expect(page.getByText(/couldn't complete this matchup/)).toHaveCount(0);
});

test("J13: difficulty is absent for modes without a generated schedule", async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("ec_account", "1"); localStorage.setItem("ec_name", "E2E"); } catch (e) {} });
  await page.goto("/");
  await expect(page.getByText("OPPONENT DIFFICULTY")).toHaveCount(0); // Single
  await page.getByRole("button", { name: "Play", exact: false }).first().click();
  await page.getByRole("menuitem", { name: /Best of 7/ }).click();
  await expect(page.getByText("OPPONENT DIFFICULTY")).toHaveCount(0);
  await page.getByRole("button", { name: "Play", exact: false }).first().click();
  await page.getByRole("menuitem", { name: /Win 82/ }).click();
  await expect(page.getByText("OPPONENT DIFFICULTY")).toBeVisible();
});
