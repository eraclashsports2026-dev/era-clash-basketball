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

async function expectCorePostgame(page) {
  await expect(page.getByText(/TEAM (GOLD|BLUE) WINS/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/GAME MVP|SERIES MVP/)).toBeVisible();
  // dedicated results view: the builder has left the stage
  await expect(page.getByRole("tab", { name: /Chaos Draft/ })).toHaveCount(0);
  await expect(page.getByText("MATCHUP BREAKDOWN")).toBeVisible();
  // FULL BOX SCORE visible by default — both teams, no accordion click
  await expect(page.getByText("FULL BOX SCORE")).toBeVisible();
  await expect(page.getByText("TEAM GOLD", { exact: true }).last()).toBeVisible();
  await expect(page.getByText(/WHY YOU (WON|LOST)/)).toBeVisible();
  // MVP explanation: at least 2 real sentences even with AI unavailable
  const bodyText = await page.locator("body").innerText();
  const mvpSection = bodyText.slice(bodyText.indexOf("MVP"), bodyText.indexOf("WHY YOU"));
  expect(mvpSection.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 20).length,
    `MVP section too thin: ${mvpSection.slice(0, 200)}`).toBeGreaterThanOrEqual(2);
  // Turning point: 2–3 sentences
  await expect(page.getByText("TURNING POINT", { exact: false })).toBeVisible();
  const tpSection = bodyText.slice(bodyText.indexOf("TURNING POINT"), bodyText.indexOf("MATCHUP BREAKDOWN"));
  expect(tpSection.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 20).length,
    `Turning point too thin: ${tpSection.slice(0, 200)}`).toBeGreaterThanOrEqual(2);
  // AI blocked in harness → fallback state + retry, page fully functional
  await expect(page.getByText("Enhanced game analysis is temporarily unavailable", { exact: false })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("button", { name: /Try Enhanced Recap Again/ })).toBeVisible();
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
  await expect(page.getByRole("button", { name: /RUN THE SIM/ })).toBeVisible();
  // card containment: every filled Gold card stays inside the Gold panel
  const panel = await page.getByRole("region", { name: "TEAM GOLD" }).boundingBox();
  for (const name of ["Magic Johnson", "Larry Bird"]) {
    const card = await page.getByText(name).first().boundingBox();
    expect(card.x + card.width, `${name} overflows`).toBeLessThanOrEqual(panel.x + panel.width + 1);
  }
  await page.getByRole("button", { name: /RUN THE SIM/ }).click();
  await expectCorePostgame(page);
  await page.getByRole("button", { name: /Rematch/i }).first().click();
  await expectCorePostgame(page);
});

test("J1b: Random Gold + Random Blue plays a full game", async ({ page }) => {
  await page.goto("/");
  await randomGold(page);
  await randomBlue(page);
  await page.getByRole("button", { name: /RUN THE SIM/ }).click();
  await expectCorePostgame(page);
  // New Game returns to an empty builder: Gold back on Chaos Draft, Blue empty
  await page.getByRole("button", { name: /New Game/ }).click();
  await expect(page.getByRole("tab", { name: /Chaos Draft/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Start Drafting/ })).toBeVisible();
  await expect(page.getByText("Add Point Guard")).toHaveCount(1); // Blue panel empty again
});

test("J3: rapid double-click creates exactly one core result", async ({ page }) => {
  let gamePosts = 0;
  page.on("request", (r) => { if (r.url().includes("/api/game") && r.method() === "POST") gamePosts++; });
  await page.goto("/");
  await randomGold(page);
  await randomBlue(page);
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
  await randomBlue(page); // Blue is user-controlled in Daily too
  await page.getByRole("button", { name: /RUN THE SIM/ }).click();
  await expect(page.getByText(/TEAM (GOLD|BLUE) WINS/)).toBeVisible({ timeout: 15000 });
  const board = await (await page.request.get("/api/daily")).json();
  expect(board.count).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(page.getByText("Today's Clash is done")).toBeVisible();
});

test("J5+J7: core failure records nothing; fabricated scores are rejected server-side", async ({ page }) => {
  await page.goto("/");
  const fail = await page.request.post("/api/game", {
    headers: { "x-chaos": "engine-fail" },
    data: { mode: "single", simulationId: "e2e-fail-123", goldIds: GOLD, blueIds: BLUE },
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
  await page.getByRole("button", { name: "Add Point Guard", exact: false }).first().click();
  await page.getByRole("dialog").getByRole("button").nth(2).click();
  await page.getByRole("button", { name: "Reset Team Gold" }).click();
  await expect(page.getByRole("button", { name: "Add Point Guard", exact: false }).first()).toBeVisible();
  // Gold: random complete → Reset Team returns to build methods, Blue untouched
  await page.getByRole("button", { name: /Random Team/ }).first().click();
  await page.getByRole("tab", { name: /Random Team/ }).click(); // blue random
  await expect(page.getByRole("button", { name: /RUN THE SIM/ })).toBeVisible();
  await page.getByRole("button", { name: "Reset Team Gold" }).click();
  await expect(page.getByRole("tab", { name: /Chaos Draft/ })).toBeVisible(); // gold back to methods
  await expect(page.getByRole("button", { name: /RUN THE SIM/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reset Team Blue" })).toBeVisible(); // blue still built
  // Blue: Reset clears the built five
  await page.getByRole("button", { name: "Reset Team Blue" }).click();
  await expect(page.getByRole("tab", { name: /Random Team/ })).toBeVisible(); // blue methods return
  await expect(page.getByText("Add Point Guard")).toHaveCount(2); // gold (manual mode) + blue both empty
});
