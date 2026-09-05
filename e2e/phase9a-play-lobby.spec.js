// ── Phase 9A: the Play Lobby, active-run continuation, disclosure, placement ─
// Runs on the Candidate preview harness (Chaos Clash enabled), which is the
// surface a first-time visitor to the branch preview actually meets.
//
// What a real visitor has to be able to do: open the lobby and understand it
// without a game starting under them; pick Chaos Clash and roll; leave for the
// lobby and come back to the SAME run; abandon it only after being asked; and,
// in Dream Matchup, choose a player and be shown exactly where they can go.
import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const ART = "data/validation/9a";
const artifact = (name, body) => {
  mkdirSync(ART, { recursive: true });
  writeFileSync(`${ART}/${name}`, JSON.stringify(body, null, 2) + "\n");
};

const withAccount = async (page) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("ec_account", "1"); localStorage.setItem("ec_name", "E2E");
      if (!sessionStorage.getItem("e2e_keep_run")) { localStorage.removeItem("ec_chaos_run"); localStorage.removeItem("ec_chaos_run_at"); }
    } catch (e) {}
  });
};
const asGuest = async (page) => {
  await page.addInitScript(() => {
    try { localStorage.removeItem("ec_account"); localStorage.removeItem("ec_chaos_run"); localStorage.removeItem("ec_chaos_run_at"); } catch (e) {}
  });
};

/** Every POST to /api/game while the page is open, by chaosAction. */
const watchGame = (page) => {
  const posts = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/game") && req.method() === "POST") {
      try { posts.push(JSON.parse(req.postData() || "{}").chaosAction || "(sim)"); } catch { posts.push("?"); }
    }
  });
  return posts;
};

// 9B.3: the empty frame offers ROLL; a dealt board is the DRAFTING state.
const stageAt = (page, st) => page.locator(`.ec-ta-stage[data-guided-state="${st}"]`);
const rollOne = async (page) => {
  await page.getByRole("button", { name: /^ROLL$/ }).click();
  await expect(stageAt(page, "DRAFTING")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4)).toBeVisible({ timeout: 20_000 });
};

test("/play opens the lobby, and viewing it starts nothing", async ({ page }) => {
  await withAccount(page);
  const posts = watchGame(page);
  await page.goto("/play");
  await expect(page.getByRole("main", { name: "Play EraClash Basketball" })).toBeVisible();
  await expect(page.getByRole("img", { name: "EraClash Basketball" })).toBeVisible();

  // Three primary cards, Chaos first and recommended; four quieter ones.
  const primary = page.locator(".ec-lobby-primary .ec-mode-card");
  await expect(primary).toHaveCount(3);
  await expect(primary.nth(0)).toHaveAttribute("data-mode", "chaos");
  await expect(primary.nth(0)).toHaveAttribute("data-recommended", "true");
  await expect(primary.nth(0).getByText("RECOMMENDED")).toBeVisible();
  await expect(primary.nth(1)).toHaveAttribute("data-mode", "dream");
  await expect(primary.nth(2)).toHaveAttribute("data-mode", "daily");
  await expect(page.locator(".ec-lobby-secondary .ec-mode-card")).toHaveCount(4);
  // Era Gauntlet is truthfully Coming soon, and its action is information.
  const gauntlet = page.locator('.ec-mode-card[data-mode="gauntlet"]');
  await expect(gauntlet).toHaveAttribute("data-status", "COMING_SOON");
  await expect(gauntlet.getByText("Coming soon")).toBeVisible();
  await expect(gauntlet.locator(".ec-mode-action")).toHaveAttribute("href", /\/modes\/era-gauntlet/);

  // Exactly one action per card.
  const cards = await page.locator(".ec-mode-card").count();
  expect(await page.locator(".ec-mode-card .ec-mode-action").count()).toBe(cards);

  // Nothing was dealt: no /api/game POST of any kind, no remembered run.
  await page.waitForTimeout(800);
  expect(posts).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem("ec_chaos_run"))).toBeNull();
  await expect(page.locator(".ec-continue")).toHaveCount(0);

  // `/` is the same entrance.
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Play EraClash Basketball" })).toBeVisible();
  await expect(page.locator(".ec-lobby")).toHaveAttribute("data-entrance", "true");
  expect(posts).toEqual([]);
});

test("the Play dropdown and the lobby agree, card by card", async ({ page }) => {
  await withAccount(page);
  await page.goto("/play");
  const lobby = await page.locator(".ec-mode-card").evaluateAll((els) => els.map((e) => ({
    id: e.dataset.mode, title: e.querySelector(".ec-mode-title").textContent.trim(),
    badge: e.querySelector(".ec-mode-badge")?.textContent.trim() || null,
  })));
  await page.getByRole("button", { name: /^Play/ }).click();
  const menu = await page.getByRole("menuitem").evaluateAll((els) => els
    .filter((e) => !/How modes work/.test(e.textContent))
    .map((e) => ({ title: e.querySelector("span span").textContent.trim(), badge: e.querySelector("span + span + span")?.textContent.trim() || null })));
  expect(menu.map((m) => m.title)).toEqual(lobby.map((l) => l.title));
  for (let i = 0; i < lobby.length; i++) expect(menu[i].badge, lobby[i].title).toBe(lobby[i].badge);
  artifact("mode-registry-runtime.json", { artifact: "mode-registry-runtime", phase: "9A", lobby, menu });
});

test("choosing Chaos Clash opens the Time Arena; the lobby remembers the run; Continue resumes it exactly", async ({ page }) => {
  test.slow();
  await withAccount(page);
  const posts = watchGame(page);
  await page.goto("/play");
  await page.getByRole("link", { name: /Start Chaos Clash, recommended/ }).click();
  await expect(page).toHaveURL(/\/play\/chaos$/);
  await expect(page.locator(".ec-ta")).toBeVisible();
  // The arena is open and STILL nothing has been dealt.
  await expect(page.locator(".ec-pc-empty")).toHaveCount(10);
  expect(posts).toEqual([]);

  await rollOne(page);
  expect(posts).toEqual(["start"]);
  const runId = await page.evaluate(() => localStorage.getItem("ec_chaos_run"));
  expect(runId).toBeTruthy();
  const names = await page.locator('.ec-ta-team[data-team="gold"] .ec-pc .ec-pc-name').allInnerTexts();
  // Hold one so the resumed board can prove it is the same decision state.
  await page.locator('.ec-ta-team[data-team="gold"] .ec-pc[data-slot="PG"]').getByRole("button", { name: /^Hold/ }).click();

  // The logo goes to the lobby and does NOT erase the run.
  await page.getByRole("button", { name: "EraClash Basketball home" }).click();
  await expect(page).toHaveURL(/\/$/);
  const card = page.locator(".ec-continue");
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toContainText("CONTINUE YOUR CHAOS CLASH");
  await expect(card).toContainText(/Roll 1 of 3/);
  await expect(card).toContainText(/era not yet revealed/);
  await expect(card).toContainText(/last activity/);
  await expect(card).toContainText("TEAM GOLD");
  await expect(card).toContainText("Legend Rival");
  expect(await page.evaluate(() => localStorage.getItem("ec_chaos_run"))).toBe(runId);
  // Nothing unrevealed leaks: no era id, no CPU hold count.
  await expect(card.getByText(/^\d{4}s$/)).toHaveCount(0);

  // Picking ANOTHER mode does not delete the run either.
  await page.getByRole("link", { name: /Daily Clash/ }).click();
  expect(await page.evaluate(() => localStorage.getItem("ec_chaos_run"))).toBe(runId);
  await page.getByRole("button", { name: "EraClash Basketball home" }).click();
  await expect(page.locator(".ec-continue")).toBeVisible({ timeout: 15_000 });

  // Continue resumes the exact server-authoritative run.
  await page.getByRole("button", { name: /Continue your Chaos Clash/ }).click();
  await expect(page).toHaveURL(/\/play\/chaos$/);
  await expect(stageAt(page, "DRAFTING")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4)).toBeVisible({ timeout: 20_000 });
  expect(await page.locator('.ec-ta-team[data-team="gold"] .ec-pc .ec-pc-name').allInnerTexts()).toEqual(names);
  expect(await page.evaluate(() => localStorage.getItem("ec_chaos_run"))).toBe(runId);
  // Resuming re-read the run; it did not start a new one.
  expect(posts.filter((a) => a === "start")).toHaveLength(1);
  expect(posts).toContain("view");
  artifact("active-run-continuation-runtime.json", {
    artifact: "active-run-continuation-runtime", phase: "9A",
    runIdPreserved: true, gamePostsWhileInLobby: posts, resumedRoster: names,
  });
});

test("abandoning from the lobby asks first, and abandoning never refunds a guest run", async ({ page }) => {
  test.slow();
  await withAccount(page);
  await page.goto("/play/chaos");
  await rollOne(page);
  // A full navigation: the init script clears runs unless told to keep this one.
  await page.evaluate(() => sessionStorage.setItem("e2e_keep_run", "1"));
  await page.goto("/play");
  const card = page.locator(".ec-continue");
  await expect(card).toBeVisible({ timeout: 15_000 });

  // NO keeps everything.
  await card.getByRole("button", { name: /Abandon this Chaos Clash/ }).click();
  const dialog = page.getByRole("dialog", { name: /Abandon this Chaos Clash/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/counts when it starts, not when it ends/)).toBeVisible();
  await dialog.getByRole("button", { name: /No, keep this Chaos Clash/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(card).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("ec_chaos_run"))).toBeTruthy();

  // YES discards it, and the lobby shows no false continuation afterwards.
  await card.getByRole("button", { name: /Abandon this Chaos Clash/ }).click();
  await page.getByRole("dialog", { name: /Abandon this Chaos Clash/ }).getByRole("button", { name: /Yes, abandon/ }).click();
  await expect(page.locator(".ec-continue")).toHaveCount(0, { timeout: 15_000 });
  expect(await page.evaluate(() => localStorage.getItem("ec_chaos_run"))).toBeNull();
  await page.reload();
  await expect(page.locator(".ec-lobby")).toBeVisible();
  await expect(page.locator(".ec-continue")).toHaveCount(0);

  // The budget is spent when a run STARTS. A fresh guest session starts and
  // abandons three runs; the fourth start is gated — abandoning bought nothing.
  const guest = await page.context().browser().newContext();
  const api = async (body) => {
    const r = await guest.request.post("/api/game", { data: { tier: "GUEST", ...body }, headers: { "Content-Type": "application/json" } });
    return { status: r.status(), body: await r.json().catch(() => null) };
  };
  const seen = [];
  for (let i = 0; i < 3; i++) {
    const s = await api({ chaosAction: "start" });
    seen.push(s.status);
    expect(s.status, `guest start ${i + 1}`).toBe(200);
    const a = await api({ chaosAction: "abandon", chaosRunId: s.body.chaos.chaosRunId });
    expect(a.status, `guest abandon ${i + 1}`).toBe(200);
  }
  const fourth = await api({ chaosAction: "start" });
  expect(fourth.status).toBe(403);
  expect(fourth.body?.gated).toBe(true);
  expect(fourth.body?.guestRunsUsed).toBe(3);
  await guest.close();
  artifact("active-run-abandon-runtime.json", {
    artifact: "active-run-abandon-runtime", phase: "9A",
    confirmationRequired: true, guestStartsAfterThreeAbandons: fourth.status, guestRunsUsed: fourth.body?.guestRunsUsed,
  });
});

test("an expired or forgotten run gets an honest expired state, not a Continue card", async ({ page }) => {
  await withAccount(page);
  await page.addInitScript(() => { try { localStorage.setItem("ec_chaos_run", "zzzzzzzzzz"); sessionStorage.setItem("e2e_keep_run", "1"); } catch (e) {} });
  await page.goto("/play");
  const expired = page.locator(".ec-continue--expired");
  await expect(expired).toBeVisible({ timeout: 15_000 });
  await expect(expired).toContainText("EXPIRED");
  await expect(expired.getByRole("button", { name: /Continue/ })).toHaveCount(0);
  await expired.getByRole("button", { name: "DISMISS" }).click();
  await expect(page.locator(".ec-continue")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("ec_chaos_run"))).toBeNull();
});

test("a guest who picks Dream Matchup meets the account gate at its own address, and the way back is the lobby", async ({ page }) => {
  await asGuest(page);
  await page.goto("/play");
  const dream = page.locator('.ec-mode-card[data-mode="dream"]');
  await expect(dream).toHaveAttribute("data-status", "ACCOUNT_REQUIRED");
  await expect(dream.getByText("Free account")).toBeVisible();
  await dream.locator(".ec-mode-action").click();
  await expect(page).toHaveURL(/\/play\/dream$/);
  await expect(page.getByText("FREE ACCOUNT REQUIRED")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dream Matchup" })).toBeVisible();
  await page.getByRole("button", { name: "BACK TO THE LOBBY" }).click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.locator(".ec-lobby")).toBeVisible();
});

test("one dominant action per Time Arena state, inactive systems subdued, the Story leads the result", async ({ page }) => {
  test.slow();
  await withAccount(page);
  await page.goto("/play/chaos");
  const stage = page.locator(".ec-ta-stage");
  const ctas = page.locator("button.ec-ta-cta");
  const record = [];
  const snap = async (name) => {
    // The coach section fades over 180ms; read it settled.
    await page.waitForTimeout(350);
    const m = await page.evaluate(() => {
      const s = document.querySelector(".ec-ta-stage");
      const coach = document.querySelector(".ec-ta-coach");
      return {
        focus: s?.dataset.focus || null,
        primaryCtas: document.querySelectorAll("button.ec-ta-cta").length,
        coachActive: coach?.dataset.active || null,
        coachOpacity: coach ? Number(getComputedStyle(coach).opacity) : null,
      };
    });
    record.push({ state: name, ...m });
    return m;
  };
  // 9B.3 guided flow: one primary action per state, and Coach Chaos does not
  // exist on the board until the five is set (owner decision: players → era →
  // coaching → ready → result). `coachActive` is null while it is absent.
  // Empty frame: ROLL is the only primary action.
  await expect(ctas).toHaveCount(1);
  let m = await snap("empty");
  expect(m.focus).toBe("empty"); expect(m.coachActive).toBeNull();

  await rollOne(page);
  await expect(ctas).toHaveCount(1);
  m = await snap("drafting-roll-1");
  expect(m.focus).toBe("drafting"); expect(m.coachActive).toBeNull();

  await page.getByRole("button", { name: /^ROLL 2$/ }).click();
  await expect(stageAt(page, "ERA_REVEAL")).toBeVisible({ timeout: 20_000 });
  await expect(ctas).toHaveCount(1);
  m = await snap("era-reveal");
  expect(m.focus).toBe("era_reveal"); expect(m.coachActive).toBeNull();
  await page.getByRole("button", { name: /ADAPT TO ERA/ }).click();
  await expect(stageAt(page, "DRAFTING")).toBeVisible({ timeout: 20_000 });
  await expect(ctas).toHaveCount(1);
  await snap("drafting-roll-2");
  await page.getByRole("button", { name: /FINAL ROLL/ }).click();
  await expect(stageAt(page, "COACH_SELECT")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("COACH CHAOS").first()).toBeVisible();
  await expect(ctas).toHaveCount(1);
  m = await snap("coach-select");
  expect(m.focus).toBe("coach_select"); expect(m.coachActive).toBe("true"); expect(m.coachOpacity).toBe(1);
  await page.getByRole("button", { name: /^Select / }).first().click();
  await page.getByRole("button", { name: /CONTINUE WITH COACH/ }).click();
  await expect(page.getByRole("button", { name: /RUN CLASH/ })).toBeVisible({ timeout: 20_000 });
  await expect(ctas).toHaveCount(1);
  m = await snap("ready");
  expect(m.focus).toBe("ready"); expect(m.coachActive).toBeNull();
  // Completed rolls compress to ticks.
  expect(await page.locator('.ec-ta-step[data-state="COMPLETE"]').count()).toBe(3);

  await page.getByRole("button", { name: /RUN CLASH/ }).click();
  // The score leads the stage head; the result hero follows, Story open first.
  await expect(page.locator(".ec-ta-score[data-winner]")).toBeVisible({ timeout: 45_000 });
  const hero = page.locator(".ec-ta-result-hero");
  await expect(hero.getByRole("tab", { name: "Game Story" })).toHaveAttribute("aria-selected", "true");
  await expect(hero.locator("#ec-dock-panel")).toBeVisible();
  for (const t of ["Box Score", "Coaching", "Analysis"]) await expect(hero.getByRole("tab", { name: t })).toHaveAttribute("aria-selected", "false");
  // No contextual rail competes with the result; no primary CTA; the matchup stays.
  await expect(page.locator(".ec-ta-rail")).toHaveCount(0);
  await expect(ctas).toHaveCount(0);
  await expect(page.getByText("THE MATCHUP YOU BUILT").first()).toBeVisible();
  await snap("complete");
  artifact("progressive-disclosure-runtime.json", { artifact: "progressive-disclosure-runtime", phase: "9A", states: record });
});

test("Dream Matchup: a player is chosen first, the legal positions light up, one legal slot auto-places, swaps and undo work, all by keyboard too", async ({ page }) => {
  test.slow();
  await withAccount(page);
  await page.goto("/play/dream");
  await expect(page.getByRole("tab", { name: /Manual Draft/ }).first()).toBeVisible();
  const announcements = page.locator('[role="status"][aria-live="polite"]');

  // Kevin Durant (2010s): SF · PF · SG. Three legal, two not.
  await page.getByRole("button", { name: /Add a player to Team Gold/ }).click();
  const picker = page.getByRole("dialog", { name: "Choose a player" });
  await expect(picker).toBeVisible();
  await picker.getByLabel("Search players").fill("Durant");
  const row = picker.locator('button[data-player="durant-10s"]');
  await expect(row).toContainText("SF · PF · SG");
  await row.click();
  await expect(page.locator(".ec-place-bar")).toContainText(/Placing Kevin Durant — eligible: SF · PF · SG/);
  await expect(announcements.first()).toContainText("Kevin Durant selected. Eligible positions: small forward, power forward and shooting guard. Three legal positions available.");
  const gold = page.locator('.roster-grid[aria-label="Team Gold lineup"]');
  await expect(gold).toHaveAttribute("data-placing", "true");
  const states = await gold.locator("[data-slot]").evaluateAll((els) => Object.fromEntries(els.map((e) => [e.dataset.slot, e.dataset.placeState])));
  expect(states).toEqual({ PG: "INELIGIBLE", SG: "ELIGIBLE", SF: "ELIGIBLE", PF: "ELIGIBLE", C: "INELIGIBLE" });
  // Ineligible slots are not controls and say why.
  await expect(gold.locator('[data-slot="C"] button')).toHaveCount(0);
  await expect(gold.locator('[data-slot="C"]')).toContainText("NOT ELIGIBLE");
  expect(await gold.locator('[data-slot="C"] .sr-only').innerText()).toMatch(/not eligible at Center/);
  // Place him at power forward — by keyboard.
  const pf = gold.getByRole("button", { name: "Place Kevin Durant at Power Forward" });
  await pf.focus();
  await page.keyboard.press("Enter");
  await expect(gold.locator('[data-slot="PF"]')).toContainText("Durant");
  await expect(gold).toHaveAttribute("data-placing", "false");
  await expect(announcements.first()).toContainText("Kevin Durant placed at power forward. Undo is available.");
  await expect(page.locator(".ec-undo-toast")).toBeVisible();

  // Wilt Chamberlain: centre only → placed automatically, announced, undoable.
  await page.getByRole("button", { name: /Add a player to Team Gold/ }).click();
  await page.getByRole("dialog", { name: "Choose a player" }).getByLabel("Search players").fill("Chamberlain");
  await page.locator('button[data-player="wilt-60s"]').click();
  await expect(gold.locator('[data-slot="C"]')).toContainText("Chamberlain");
  await expect(announcements.first()).toContainText("Wilt Chamberlain placed at center automatically. Undo is available.");
  await page.getByRole("button", { name: "Undo the last placement" }).click();
  await expect(gold.locator('[data-slot="C"]')).not.toContainText("Chamberlain");
  await expect(announcements.first()).toContainText("Placement undone.");

  // A second Kevin Durant (another decade) is refused as the same person.
  await page.getByRole("button", { name: /Add a player to Team Gold/ }).click();
  await page.getByRole("dialog", { name: "Choose a player" }).getByLabel("Search players").fill("Durant");
  // The picker already hides every decade-card of a placed person.
  await expect(page.locator('button[data-player^="durant-"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Close picker" }).click().catch(() => {});

  // A swap: Bob Pettit (PF/C) with PF taken — PF is a SWAP, C is open → the
  // plan offers both; choosing the swap relocates Durant nowhere (SF and SG are
  // open, so he leaves rather than being moved silently) and Undo restores him.
  await page.getByRole("button", { name: /Add a player to Team Gold/ }).click();
  await page.getByRole("dialog", { name: "Choose a player" }).getByLabel("Search players").fill("Pettit");
  await page.locator('button[data-player="bob-60s"]').click();
  await expect(gold.locator('[data-slot="PF"]')).toHaveAttribute("data-place-state", "OCCUPIED");
  await expect(gold.locator('[data-slot="C"]')).toHaveAttribute("data-place-state", "ELIGIBLE");
  await gold.getByRole("button", { name: "Swap Kevin Durant for Bob Pettit at Power Forward" }).click();
  await expect(gold.locator('[data-slot="PF"]')).toContainText("Pettit");
  await expect(announcements.first()).toContainText("Kevin Durant left the lineup");
  await page.getByRole("button", { name: "Undo the last placement" }).click();
  await expect(gold.locator('[data-slot="PF"]')).toContainText("Durant");

  // Escape cancels a pending placement.
  await page.getByRole("button", { name: /Add a player to Team Gold/ }).click();
  await page.getByRole("dialog", { name: "Choose a player" }).getByLabel("Search players").fill("Curry");
  await page.locator('button[data-player="curry-10s"]').click();
  await expect(gold).toHaveAttribute("data-placing", "true");
  await page.keyboard.press("Escape");
  await expect(gold).toHaveAttribute("data-placing", "false");

  artifact("multi-position-runtime.json", {
    artifact: "multi-position-runtime", phase: "9A",
    durantStates: states, autoPlaced: "wilt-60s → C", undo: true, swapOffered: true, duplicateHidden: true, keyboard: true,
  });
});

test("the lobby holds on a phone and a tablet with no page overflow and 44px targets", async ({ page }) => {
  await withAccount(page);
  const rows = [];
  for (const [w, h] of [[390, 844], [430, 932], [768, 1024], [1280, 800], [1536, 1024]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/play");
    await expect(page.locator(".ec-lobby")).toBeVisible();
    const m = await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".ec-lobby-primary .ec-mode-card")];
      const xs = new Set(cards.map((c) => Math.round(c.getBoundingClientRect().x)));
      const targets = [...document.querySelectorAll(".ec-mode-action, .ec-continue-cta, .ec-continue-quiet")].map((b) => Math.round(b.getBoundingClientRect().height));
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        primaryColumns: xs.size,
        minTarget: Math.min(...targets),
        docHeight: document.documentElement.scrollHeight,
        firstIsChaos: cards[0]?.dataset.mode,
      };
    });
    rows.push({ viewport: `${w}x${h}`, ...m });
    expect(m.overflow, `${w}x${h}`).toBeLessThanOrEqual(0);
    expect(m.minTarget, `${w}x${h}`).toBeGreaterThanOrEqual(44);
    expect(m.firstIsChaos).toBe("chaos");
    if (w <= 640) expect(m.primaryColumns).toBe(1);
    else if (w <= 1024) expect(m.primaryColumns).toBe(2);
    else expect(m.primaryColumns).toBe(3);
  }
  // One desktop viewport when practical.
  const desktop = rows.find((r) => r.viewport === "1536x1024");
  expect(desktop.docHeight).toBeLessThanOrEqual(1024);
  artifact("responsive-lobby-runtime.json", { artifact: "responsive-lobby-runtime", phase: "9A", rows });
});

test("the lobby is keyboard operable and announces what each card is", async ({ page }) => {
  await withAccount(page);
  await page.goto("/play");
  // Every card is a real link or button with a full accessible name.
  const names = await page.locator(".ec-mode-action").evaluateAll((els) => els.map((e) => ({ tag: e.tagName, name: e.getAttribute("aria-label"), href: e.getAttribute("href") })));
  expect(names).toHaveLength(7);
  expect(names[0].name).toMatch(/^Start Chaos Clash, recommended/);
  for (const n of names) expect(["A", "BUTTON"]).toContain(n.tag);
  // Tab reaches the recommended card's action and Enter opens it.
  const chaos = page.getByRole("link", { name: /Start Chaos Clash, recommended/ });
  await chaos.focus();
  const outline = await chaos.evaluate((e) => getComputedStyle(e).outlineStyle);
  expect(outline).not.toBe("none");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/play\/chaos$/);
  // Back returns to the lobby.
  await page.goBack();
  await expect(page.locator(".ec-lobby")).toBeVisible();
  // Refresh preserves the lobby.
  await page.reload();
  await expect(page.locator(".ec-lobby")).toBeVisible();
});
