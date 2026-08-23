// ── Critical-journey E2E (Playwright vs the local integration harness) ─────────
// Real UI + real handlers + in-memory store. The harness blocks AI narration
// via the daily budget guard, so every journey also proves the AI-failure
// fallback: the core Postgame must be complete without narration.
import { test, expect } from "@playwright/test";

const GOLD = ["magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s"];

// Build a five via Manual Draft: for each slot open the picker, take the top row.
async function buildManualFive(page) {
  await page.getByRole("tab", { name: /Manual Draft/ }).click();
  for (const pos of ["Point Guard", "Shooting Guard", "Small Forward", "Power Forward", "Center"]) {
    await page.getByRole("button", { name: `Add ${pos}`, exact: false }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button").nth(2).click(); // first player row (after close/search chrome)
  }
  await expect(page.getByText("RUN THE SIM")).toBeVisible();
}

async function expectCorePostgame(page) {
  await expect(page.getByText(/TEAM (GOLD|BLUE) WINS/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/GAME MVP|SERIES MVP/)).toBeVisible();
  await expect(page.getByText("MATCHUP BREAKDOWN")).toBeVisible();
  await expect(page.getByText(/WHY YOU (WON|LOST)/)).toBeVisible();
  // AI is budget-blocked in the harness → fallback state must appear, page stays functional
  await expect(page.getByText("Enhanced game analysis is temporarily unavailable", { exact: false })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("button", { name: /Try Enhanced Recap Again/ })).toBeVisible();
}

test("J1+J2: guest drafts, simulates, gets a full core Postgame despite AI outage, and rematches", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "CLASH ACROSS ERAS" })).toBeVisible();
  await buildManualFive(page);
  await page.getByRole("button", { name: /RUN THE SIM/ }).click();
  await expectCorePostgame(page);
  // replay loop: rematch produces a second complete postgame
  await page.getByRole("button", { name: /Rematch/i }).first().click();
  await expectCorePostgame(page);
});

test("J3: rapid double-click creates exactly one core result", async ({ page }) => {
  let gamePosts = 0;
  page.on("request", (r) => { if (r.url().includes("/api/game") && r.method() === "POST") gamePosts++; });
  await page.goto("/");
  await buildManualFive(page);
  const btn = page.getByRole("button", { name: /RUN THE SIM/ });
  await btn.click({ clickCount: 3, delay: 40 }).catch(() => {});
  await expectCorePostgame(page);
  expect(gamePosts).toBe(1); // UI + in-flight dedupe: one network call, one bill
});

test("J4: Daily consumes one attempt, persists, and survives reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Daily", exact: true }).click();
  await page.getByRole("button", { name: /Start Today's Challenge/ }).click();
  await page.getByRole("button", { name: /Roll 2/ }).click();
  await page.getByRole("button", { name: /Roll 3/ }).click();
  await page.getByRole("button", { name: /Finalize Squad/ }).click();
  await page.getByRole("button", { name: /RUN THE SIM/ }).click();
  await expect(page.getByText(/TEAM (GOLD|BLUE) WINS/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("DAILY CHALLENGE", { exact: false }).first()).toBeVisible();
  // server: exactly one board entry for this session
  const board = await (await page.request.get("/api/daily")).json();
  expect(board.count).toBe(1);
  // reload: the official attempt stays consumed
  await page.reload();
  await page.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(page.getByText("Today's Clash is done")).toBeVisible();
});

test("J5+J7: core failure records nothing; fabricated scores are rejected server-side", async ({ page }) => {
  await page.goto("/");
  // core failure via chaos: 500, no result recorded
  const fail = await page.request.post("/api/game", {
    headers: { "x-chaos": "engine-fail" },
    data: { mode: "single", simulationId: "e2e-fail-123", goldIds: GOLD, blueIds: GOLD.slice().reverse() && ["curry-10s", "ray-00s", "durant-10s", "dirk-00s", "jokic-20s"] },
  });
  expect(fail.status()).toBe(500);
  expect((await fail.json()).code).toBe("ENGINE_FAILURE");
  // tampered leaderboard write: the old submit path is gone
  const tamper = await page.request.post("/api/daily", { data: { action: "submit", won: true, margin: 50, uid: "cheater" } });
  expect(tamper.status()).toBe(400);
  // fabricated authority fields are ignored by /api/game
  const forged = await page.request.post("/api/game", {
    data: { mode: "single", simulationId: "e2e-forge-123", goldIds: GOLD, blueIds: ["curry-10s", "ray-00s", "durant-10s", "dirk-00s", "jokic-20s"], winner: "Gold", wins: 82, score: "999-0" },
  });
  const body = await forged.json();
  expect(body.result.core.seriesResult).not.toBe("999-0");
});

test("J6: challenge link → recipient plays → server decides → immutable rivalry chain", async ({ page }) => {
  // creator makes a challenge via API
  const create = await page.request.post("/api/challenge", {
    data: { action: "create", teamIds: GOLD, name: "Joe", record: "72-10" },
  });
  const { id } = await create.json();
  // recipient opens the public link
  await page.goto(`/?ch=${id}`);
  await expect(page.getByText("YOU'VE BEEN CHALLENGED")).toBeVisible();
  await expect(page.getByText(/Joe thinks this five/)).toBeVisible();
  await buildManualFive(page);
  await page.getByRole("button", { name: /RUN THE SIM/ }).click();
  await expect(page.getByText(/TEAM (GOLD|BLUE) WINS/)).toBeVisible({ timeout: 15000 });
  // server recorded exactly one immutable game
  const view = await (await page.request.get(`/api/challenge?id=${id}`)).json();
  expect(view.games.length).toBe(1);
  const firstScore = view.games[0].score;
  // recipient (or anyone) cannot overwrite it through the API
  const overwrite = await page.request.post("/api/challenge", {
    data: { action: "complete", id, game: { winner: "opponent", score: "150-0" } },
  });
  expect(overwrite.status()).toBe(400);
  const after = await (await page.request.get(`/api/challenge?id=${id}`)).json();
  expect(after.games[0].score).toBe(firstScore);
  // rematch appends a new game instead of rewriting
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
  expect(b.status()).toBe(404); // different cookie session → no access
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
  // stored server-side without executable content
  const prof = await (await page.request.get("/api/profile")).json();
  expect(prof.name || "").not.toMatch(/[<>]/);
});
