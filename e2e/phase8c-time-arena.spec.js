// ── Phase 8C: the Time Arena ─────────────────────────────────────────────────
// Browser-level proof of the canonical Play surface: one workspace, ten cards
// whose colour comes from their TEAM, players and coaches moving through one
// three-roll sequence, Draft Pressure stated once, an era that is random and
// locked, and a Result Dock that never leaves the page — including the state
// where it shows the PREVIOUS clash while a new draft is on the board.
import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const ART = "data/validation/8c-time-arena";
const artifact = (name, body) => {
  mkdirSync(ART, { recursive: true });
  writeFileSync(`${ART}/${name}`, JSON.stringify(body, null, 2) + "\n");
};

const withAccount = async (page) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("ec_account", "1"); localStorage.setItem("ec_name", "E2E");
      // Each test starts from a clean board EXCEPT when a test is deliberately
      // exercising resume-after-reload, which marks that in sessionStorage.
      if (!sessionStorage.getItem("e2e_keep_run")) localStorage.removeItem("ec_chaos_run");
    } catch (e) {}
  });
};
const asGuest = async (page) => {
  await page.addInitScript(() => {
    try { localStorage.removeItem("ec_account"); localStorage.removeItem("ec_chaos_run"); } catch (e) {}
  });
};

/** One roll decision through the UI. */
const roll = async (page, label) => { await page.getByRole("button", { name: label }).click(); };

/** Continue from a board that already has Roll 1 on it, and stop at READY. */
const toReadyFromRoll1 = async (page) => {
  await roll(page, /LOCK & ROLL 2/);
  await expect(page.getByText(/ROLL 2 OF 3/).first()).toBeVisible({ timeout: 20_000 });
  await roll(page, /FINAL ROLL/);
  await expect(page.getByText("CHOOSE YOUR STAFF").first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /^Select / }).first().click();
  await page.getByRole("button", { name: /HIRE THIS STAFF/ }).click();
  await expect(page.getByRole("button", { name: /RUN SIM/ })).toBeVisible({ timeout: 20_000 });
};

/** Deal, roll twice, hire, and stop at READY. */
const toReady = async (page) => {
  await page.getByRole("button", { name: /^ROLL 1/ }).click();
  await expect(page.getByText(/ROLL 1 OF 3/).first()).toBeVisible({ timeout: 20_000 });
  await toReadyFromRoll1(page);
};

test("the Time Arena is one workspace with a persistent rail", async ({ page }) => {
  await withAccount(page);
  await page.goto("/");
  await expect(page.locator(".ec-ta")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Live intel and result" })).toBeVisible();

  const layout = await page.evaluate(() => {
    const ta = document.querySelector(".ec-ta");
    const r = document.querySelector(".ec-ta-rail");
    // The PAGE is the only vertical scroller in the arena. A pane with its own
    // max-height and overflow-y hid up to 504px of the result behind an inner
    // scrollbar and stopped the page scrolling under the pointer.
    const verticalScrollers = [...document.querySelectorAll(".ec-ta, .ec-ta *")]
      .filter((e) => ["auto", "scroll"].includes(getComputedStyle(e).overflowY))
      .map((e) => String(e.className).trim().split(/\s+/)[0]);
    return {
      columns: getComputedStyle(ta).gridTemplateColumns.split(" ").length,
      railPosition: getComputedStyle(r).position,
      railOverflowY: getComputedStyle(r).overflowY,
      verticalScrollers,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(layout.columns).toBe(2);
  expect(layout.railPosition).toBe("static");
  expect(layout.railOverflowY).toBe("visible");
  expect(layout.verticalScrollers, "the page is the arena's only vertical scroller").toEqual([]);
  expect(layout.overflow).toBe(0);

  // Nothing is claimed before anything has happened.
  await expect(page.getByText("YOUR RESULT WILL APPEAR HERE")).toBeVisible();
  await expect(page.getByText("THREE ROLLS AVAILABLE").first()).toBeVisible();
  await expect(page.getByText("FINAL SCORE", { exact: true }).first()).toHaveCount(0);
  await expect(page.locator(".ec-pc-empty")).toHaveCount(10);
});

test("ten cards, five a side, and the TEAM owns the colour", async ({ page }) => {
  await withAccount(page);
  // The reference layout puts both benches side by side, which needs the width
  // where ten cards stay readable.
  await page.setViewportSize({ width: 1536, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: /^ROLL 1/ }).click();
  await expect(page.getByText(/ROLL 1 OF 3/).first()).toBeVisible({ timeout: 20_000 });

  const board = await page.evaluate(() => {
    const read = (team) => [...document.querySelectorAll(`.ec-ta-team[data-team="${team}"] .ec-pc`)].map((c) => ({
      slot: c.dataset.slot,
      accent: getComputedStyle(c).getPropertyValue("--pc-accent").trim(),
      height: Math.round(c.getBoundingClientRect().height),
      top: Math.round(c.getBoundingClientRect().top),
    }));
    const shell = document.querySelector(".ec-arena-shell") || document.body;
    const cssVar = (n) => getComputedStyle(shell).getPropertyValue(n).trim();
    return { gold: read("gold"), blue: read("blue"), goldToken: cssVar("--ec-a-gold"), blueToken: cssVar("--ec-a-blue") };
  });

  expect(board.gold.map((c) => c.slot)).toEqual(["PG", "SG", "SF", "PF", "C"]);
  expect(board.blue.map((c) => c.slot)).toEqual(["PG", "SG", "SF", "PF", "C"]);
  // Every Gold card is gold — the power forward and the centre included, which
  // is the exact defect this contract exists for.
  for (const c of board.gold) expect(c.accent, `gold ${c.slot}`).toBe(board.goldToken);
  for (const c of board.blue) expect(c.accent, `blue ${c.slot}`).toBe(board.blueToken);
  // One card height everywhere — a 44px control on one bench against a 32px
  // status pill on the other made Gold's cards taller than Blue's once.
  const heights = [...board.gold, ...board.blue].map((c) => c.height);
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
  // Each bench's five sit on one line, and at this width the two benches share
  // that line: ten cards, five a side, exactly as the reference shows.
  expect(new Set(board.gold.map((c) => c.top)).size).toBe(1);
  expect(new Set(board.blue.map((c) => c.top)).size).toBe(1);
  expect(board.gold[0].top).toBe(board.blue[0].top);

  // Holding a card cannot change its team.
  const pf = page.locator('.ec-ta-team[data-team="gold"] .ec-pc[data-slot="PF"]');
  await pf.getByRole("button", { name: /^Hold/ }).click();
  await expect(pf.getByRole("button", { name: /^Release/ })).toBeVisible();
  const heldAccent = await pf.evaluate((el) => getComputedStyle(el).getPropertyValue("--pc-accent").trim());
  expect(heldAccent).toBe(board.goldToken);

  artifact("player-card-theme-runtime.json", {
    artifact: "player-card-theme-runtime", phase: "8C — Time Arena",
    goldToken: board.goldToken, blueToken: board.blueToken,
    gold: board.gold, blue: board.blue, accentAfterHold: heldAccent,
  });
});

test("players and coaches move through ONE three-roll sequence", async ({ page }) => {
  test.slow();
  await withAccount(page);
  await page.goto("/");
  await page.getByRole("button", { name: /^ROLL 1/ }).click();
  await expect(page.getByText(/ROLL 1 OF 3/).first()).toBeVisible({ timeout: 20_000 });

  // Roll 1 deals BOTH boards, and the era is not out yet.
  await expect(page.locator(".ec-coach-card")).toHaveCount(3);
  await expect(page.getByText(/ERA HIDDEN/).first()).toBeVisible();

  // Hold two players and one staff.
  const gold = page.locator('.ec-ta-team[data-team="gold"]');
  for (const slot of ["PG", "C"]) {
    await gold.locator(`.ec-pc[data-slot="${slot}"]`).getByRole("button", { name: /^Hold/ }).click();
  }
  const keptCoach = (await page.locator(".ec-coach-card").first().innerText()).split("\n")[1];
  await page.locator(".ec-coach-card").first().getByRole("button", { name: /^Hold/ }).click();
  // The counts share the CTA's single sub-line now — the reference carries one
  // line there, and three stacked lines were part of the density overrun.
  await expect(page.locator(".ec-ta-cta-wrap")).toContainText(/holding 2\/5/);
  await expect(page.locator(".ec-ta-cta-wrap")).toContainText(/1\/3 staffs/);

  await roll(page, /LOCK & ROLL 2/);
  await expect(page.getByText(/ROLL 2 OF 3/).first()).toBeVisible({ timeout: 20_000 });

  // The era arrives with Roll 2, and what was held survived on both boards.
  await expect(page.locator(".ec-intel-era-id")).toHaveText(/^\d{4}s$/);
  await expect(page.locator(".ec-ta-utility").getByText(/^ERA: \d{4}s/)).toBeVisible();
  for (const slot of ["PG", "C"]) {
    await expect(gold.locator(`.ec-pc[data-slot="${slot}"]`)).toContainText("KEPT");
  }
  expect(await page.locator(".ec-coach-card").first().innerText()).toContain(keptCoach);

  await roll(page, /FINAL ROLL/);
  await expect(page.getByText("CHOOSE YOUR STAFF").first()).toBeVisible({ timeout: 20_000 });

  // Roll 3 locks both boards: no HOLD anywhere, no fourth roll, and the coach
  // controls became a hire.
  await expect(page.getByRole("button", { name: /^Hold/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /FINAL ROLL/ })).toHaveCount(0);
  await expect(page.locator(".ec-pc-static").first()).toContainText("FINAL ROSTER");
  await expect(page.getByRole("button", { name: /^Select / })).toHaveCount(3);

  // The hire is one of the three; the other two stay visible as what they were.
  await page.getByRole("button", { name: /^Select / }).first().click();
  await page.getByRole("button", { name: /HIRE THIS STAFF/ }).click();
  await expect(page.getByRole("button", { name: /RUN SIM/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("YOUR STAFF")).toHaveCount(1);
  await expect(page.getByText("NOT HIRED")).toHaveCount(2);

  artifact("synchronized-chaos-runtime.json", {
    artifact: "synchronized-chaos-runtime", phase: "8C — Time Arena",
    keptCoach, eraRevealedAtRoll: 2, rolls: 3, fourthRollOffered: false, hires: 1,
  });
});

test("Draft Pressure is stated once, in the rail", async ({ page }) => {
  await withAccount(page);
  await page.goto("/");
  await page.getByRole("button", { name: /^ROLL 1/ }).click();
  await expect(page.getByText(/ROLL 1 OF 3/).first()).toBeVisible({ timeout: 20_000 });

  const where = await page.evaluate(() => [...document.querySelectorAll("*")]
    .filter((e) => e.children.length === 0 && /DRAFT PRESSURE/i.test(e.textContent || ""))
    .map((e) => ({ inRail: !!e.closest(".ec-ta-rail"), inStage: !!e.closest(".ec-ta-stage") })));
  expect(where).toHaveLength(1);
  expect(where[0].inRail).toBe(true);
  expect(where[0].inStage).toBe(false);
  await expect(page.locator(".ec-ta-rail")).toContainText(/LOW|RISING|HIGH/);
});

test("the era is locked for a free account and routes to membership", async ({ page }) => {
  await withAccount(page);
  await page.goto("/");
  await page.getByRole("button", { name: /^ROLL 1/ }).click();
  await expect(page.getByText(/ROLL 1 OF 3/).first()).toBeVisible({ timeout: 20_000 });
  await roll(page, /LOCK & ROLL 2/);
  await expect(page.getByText(/ROLL 2 OF 3/).first()).toBeVisible({ timeout: 20_000 });

  const rail = page.locator(".ec-ta-rail");
  await expect(rail.getByText("CURRENT ERA").first()).toBeVisible();
  await expect(rail.getByRole("button", { name: /CHANGE ERA/ })).toHaveCount(0);
  await rail.getByRole("button", { name: /Change eras with membership/ }).click();
  await expect(page).toHaveURL(/\/membership\?feature=custom-era/);
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/\$\d|card number|checkout/i);
});

test("an entitled run offers the era selector the server allows", async ({ page }) => {
  await withAccount(page);
  // The product cannot mint a PLUS account during the preview, so the SERVER's
  // answer is substituted here: this asserts the UI obeys the entitlement
  // decision, never that a client may grant itself one.
  await page.route("**/api/game", async (route) => {
    const res = await route.fetch();
    let json = null;
    try { json = await res.json(); } catch { await route.fulfill({ response: res }); return; }
    if (json?.chaos?.eraState?.revealed) {
      json.chaos.eraState.change = {
        allowed: true, reason: null,
        eras: ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"],
      };
    }
    await route.fulfill({ response: res, json });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /^ROLL 1/ }).click();
  await expect(page.getByText(/ROLL 1 OF 3/).first()).toBeVisible({ timeout: 20_000 });
  await roll(page, /LOCK & ROLL 2/);
  await expect(page.getByText(/ROLL 2 OF 3/).first()).toBeVisible({ timeout: 20_000 });

  const rail = page.locator(".ec-ta-rail");
  await rail.getByRole("button", { name: /CHANGE ERA/ }).click();
  await expect(rail.getByRole("button", { name: "1990s" })).toBeVisible();
  await expect(rail.getByText(/Unranked solo play only/)).toBeVisible();
  await expect(rail.getByText(/same rules for everyone/)).toBeVisible();
});

test("starting over is on the BOARD, and it asks first", async ({ page }) => {
  test.slow();
  await withAccount(page);
  await page.goto("/");
  await toReady(page);

  const stage = page.locator(".ec-ta-stage");
  const actions = stage.locator(".ec-ta-stage-actions");
  await expect(actions.getByRole("button", { name: /CHALLENGE THIS CHAOS/ })).toBeVisible();
  const resetBtn = actions.getByRole("button", { name: /Reset this Clash/ });
  await expect(resetBtn).toBeVisible();
  // A reset is a real touch target, like every other control on the board.
  expect((await resetBtn.boundingBox()).height).toBeGreaterThanOrEqual(44);

  // NO leaves the board exactly as it was.
  await resetBtn.click();
  const dialog = page.getByRole("dialog", { name: /Reset this Clash/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/cannot be undone/)).toBeVisible();
  await dialog.getByRole("button", { name: /No, keep drafting/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".ec-ta-roster .ec-pc")).toHaveCount(10);
  await expect(page.getByRole("button", { name: /RUN SIM/ })).toBeVisible();

  // Escape is also No: the safe answer, and it is what has focus.
  await resetBtn.click();
  await expect(page.getByRole("dialog", { name: /Reset this Clash/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /Reset this Clash/ })).toHaveCount(0);
  await expect(page.locator(".ec-ta-roster .ec-pc")).toHaveCount(10);

  // YES deals a fresh board: ten backs and Roll 1 again.
  await resetBtn.click();
  await page.getByRole("dialog", { name: /Reset this Clash/ })
    .getByRole("button", { name: /Yes, reset this Clash/ }).click();
  await expect(page.locator(".ec-pc-empty")).toHaveCount(10, { timeout: 20_000 });
  await expect(page.getByRole("button", { name: /^ROLL 1/ })).toBeVisible();
  await expect(page.getByText("THREE ROLLS AVAILABLE").first()).toBeVisible();
});

test("a finished game offers a new clash on the board, not only in the result", async ({ page }) => {
  test.slow();
  await withAccount(page);
  await page.goto("/");
  await toReady(page);
  await page.getByRole("button", { name: /RUN SIM/ }).click();
  await expect(page.locator(".ec-ta-rail").getByText("FINAL SCORE", { exact: true }).first())
    .toBeVisible({ timeout: 45_000 });

  const onBoard = page.locator(".ec-ta-stage .ec-ta-stage-actions")
    .getByRole("button", { name: /Start a new Clash/ });
  await expect(onBoard).toBeVisible();
  await onBoard.click();
  const dialog = page.getByRole("dialog", { name: /Start a new Clash/ });
  await expect(dialog.getByText(/stays in the Result Dock/)).toBeVisible();
  await dialog.getByRole("button", { name: /No, stay on this result/ }).click();
  await expect(page.locator(".ec-ta-rail").getByText("FINAL SCORE", { exact: true }).first()).toBeVisible();

  await onBoard.click();
  await page.getByRole("dialog", { name: /Start a new Clash/ })
    .getByRole("button", { name: /Yes, start a new Clash/ }).click();
  await expect(page.locator(".ec-pc-empty")).toHaveCount(10, { timeout: 20_000 });
  // The game just played is not lost — it is the dock's PREVIOUS clash.
  await expect(page.locator(".ec-ta-rail").getByText(/LAST CLASH/).first()).toBeVisible();
});

test("the result lands in the dock, the report opens over the page, and a new clash keeps the last one", async ({ page }) => {
  test.slow();
  await withAccount(page);
  await page.goto("/");
  await toReady(page);
  await page.getByRole("button", { name: /RUN SIM/ }).click();

  const rail = page.locator(".ec-ta-rail");
  await expect(rail.getByText("FINAL SCORE", { exact: true }).first()).toBeVisible({ timeout: 45_000 });
  await expect(rail.getByText("THIS CLASH").first()).toBeVisible();
  for (const t of ["Game Story", "Box Score", "Coaching", "Analysis"]) {
    await expect(page.getByRole("tab", { name: t }).first()).toBeVisible();
  }
  // The MVP's line is a formatted stat line, not an object.
  await expect(rail.getByText(/\d+ PTS/).first()).toBeVisible();
  // The matchup they built is still on screen.
  await expect(page.getByText("THE MATCHUP YOU BUILT").first()).toBeVisible();

  // Every counting stat in the dock's box score.
  await rail.getByRole("tab", { name: "Box Score" }).click();
  for (const h of ["PTS", "FG", "REB", "AST", "STL", "BLK", "TO"]) {
    await expect(rail.getByText(h, { exact: true }).first()).toBeVisible();
  }

  // The full report expands over the same page and reads on its light surface.
  await page.getByRole("button", { name: /VIEW FULL REPORT/ }).click();
  const report = page.getByRole("dialog", { name: "Full postgame report" });
  await expect(report).toBeVisible();
  await report.getByRole("tab", { name: "Box Score" }).click();
  const ink = await page.evaluate(() => {
    const lum = (c) => { const [r, g, b] = String(c).match(/[\d.]+/g).map(Number); return (r * 0.299 + g * 0.587 + b * 0.114) / 255; };
    return [...document.querySelectorAll(".ec-report-overlay td.box-player")]
      .filter((c) => c.textContent.trim() && c.textContent.trim() !== "TOTAL")
      .slice(0, 4)
      .map((c) => ({ text: c.textContent.trim(), ink: lum(getComputedStyle(c).color), paper: lum(getComputedStyle(c).backgroundColor) }));
  });
  expect(ink.length).toBeGreaterThan(0);
  for (const n of ink) {
    expect(n.ink, `name "${n.text}"`).toBeLessThan(0.4);
    expect(n.paper - n.ink).toBeGreaterThan(0.35);
  }
  await page.getByRole("button", { name: /Back to the arena/ }).click();
  await expect(report).toHaveCount(0);

  // A new Clash keeps the finished one — labelled, and never as the live draft.
  await page.getByRole("button", { name: "New Chaos Clash" }).click();
  await expect(rail.getByText("LAST CLASH · NOT THE DRAFT ON SCREEN").first()).toBeVisible();
  await expect(page.getByText("THREE ROLLS AVAILABLE").first()).toBeVisible();
  await expect(page.locator(".ec-pc-empty")).toHaveCount(10);
  await expect(page.getByRole("button", { name: /RUN SIM/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^ROLL 1/ })).toBeVisible();
  await expect(page.locator(".ec-intel-era-id")).toHaveCount(0);
  await expect(page.locator(".ec-ta-utility").getByText(/HIDDEN UNTIL ROLL 2/)).toBeVisible();
});

test("a run resumed after a reload still runs", async ({ page }) => {
  test.slow();
  await withAccount(page);
  await page.goto("/");
  await toReady(page);
  await page.evaluate(() => sessionStorage.setItem("e2e_keep_run", "1"));
  await page.reload();
  await expect(page.getByRole("button", { name: /RUN SIM/ })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /RUN SIM/ }).click();
  await expect(page.getByText("FINAL SCORE", { exact: true }).first()).toBeVisible({ timeout: 45_000 });
});

test("Run it back replays the SAME matchup and actually completes", async ({ page }) => {
  test.slow();
  await withAccount(page);
  await page.goto("/");
  await toReady(page);
  await page.getByRole("button", { name: /RUN SIM/ }).click();
  await expect(page.getByText("FINAL SCORE", { exact: true }).first()).toBeVisible({ timeout: 45_000 });

  // The rematch must send a mode the server accepts, with the stored coaches
  // and era — an earlier build sent mode "chaos" and every rematch failed.
  let body = null;
  page.on("request", (req) => {
    if (req.url().includes("/api/game") && req.method() === "POST") {
      try {
        const b = JSON.parse(req.postData() || "{}");
        if (b.goldIds && b.simulationId) body = b;
      } catch { /* not this request */ }
    }
  });
  await page.getByRole("button", { name: "Run it back" }).click();
  await expect(page.getByText("FINAL SCORE", { exact: true }).first()).toBeVisible({ timeout: 45_000 });
  expect(body).toBeTruthy();
  expect(body.mode).toBe("single");
  expect(body.coachGoldId).toBeTruthy();
  expect(body.coachBlueId).toBeTruthy();
  expect(body.eraStyleId).toMatch(/^\d{4}s$/);
});

test("mobile stacks, leads with the result, and never overflows", async ({ page }) => {
  test.slow();
  await withAccount(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  const draft = await page.evaluate(() => ({
    columns: getComputedStyle(document.querySelector(".ec-ta")).gridTemplateColumns.split(" ").length,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    utility: document.querySelector(".ec-ta-utility").innerText.replace(/\n/g, " "),
  }));
  expect(draft.columns).toBe(1);
  expect(draft.overflow).toBe(0);
  expect(draft.utility).toMatch(/HELP & SETTINGS/);

  await page.getByRole("button", { name: /^ROLL 1/ }).click();
  await expect(page.getByText(/ROLL 1 OF 3/).first()).toBeVisible({ timeout: 20_000 });
  const cards = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    // Content past the edge is only acceptable inside something that scrolls.
    const unreachable = [...document.querySelectorAll(".ec-ta *")].filter((e) => {
      if (e.getBoundingClientRect().right <= vw + 1) return false;
      let p = e;
      while (p && p !== document.body) {
        if (["auto", "scroll", "hidden"].includes(getComputedStyle(p).overflowX)) return false;
        p = p.parentElement;
      }
      return true;
    }).length;
    return {
      unreachable,
      taps: [...document.querySelectorAll(".ec-pc-action")].map((b) => Math.round(b.getBoundingClientRect().height)),
      cardWidth: Math.round(document.querySelector(".ec-pc").getBoundingClientRect().width),
      clippedTags: [...document.querySelectorAll(".ec-pc-name")].filter((n) => n.scrollHeight > n.clientHeight + 1).length,
    };
  });
  expect(cards.unreachable).toBe(0);
  expect(Math.min(...cards.taps)).toBeGreaterThanOrEqual(44);
  // These two were measured and then never asserted, so the name-clipping
  // regression this test exists to catch would have passed in silence.
  expect(cards.clippedTags, "a player name must not be clipped on a phone").toBe(0);
  expect(cards.cardWidth, "a phone card must stay a readable width").toBeGreaterThanOrEqual(120);

  await toReadyFromRoll1(page);
  await page.getByRole("button", { name: /RUN SIM/ }).click();
  await expect(page.getByText("FINAL SCORE", { exact: true }).first()).toBeVisible({ timeout: 45_000 });
  const finished = await page.evaluate(() => {
    const rail = document.querySelector(".ec-ta-rail");
    const stage = document.querySelector(".ec-ta-stage");
    return {
      railOrder: getComputedStyle(rail).order,
      railAboveStage: rail.getBoundingClientRect().top < stage.getBoundingClientRect().top,
      railTop: Math.round(rail.getBoundingClientRect().top + window.scrollY),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(finished.railOrder).toBe("-1");
  expect(finished.railAboveStage).toBe(true);
  expect(finished.overflow).toBe(0);

  artifact("phase8c-responsive-qa.json", {
    artifact: "phase8c-responsive-qa", phase: "8C — Time Arena",
    viewport: "375x812", draft, cards, finished,
    note: "Desktop geometry (two columns, a rail that scrolls with the page, ten cards) is asserted by the workspace and board tests.",
  });
});

test("a Wave 1 scenario link lands a GUEST in the preloaded builder", async ({ page }) => {
  await asGuest(page);
  await page.goto("/?scenario=w1-s1");
  await expect(page.getByText(/GUIDED SCENARIO/i).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("body")).not.toContainText("Create a free account to unlock every mode");
});

test("the guide opens, moves between sections, and closes on Escape", async ({ page }) => {
  await withAccount(page);
  await page.goto("/");
  await page.getByRole("button", { name: /HOW TO PLAY/ }).click();
  const dialog = page.getByRole("dialog", { name: "Arena guide" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Three rolls, one board/)).toBeVisible();
  await dialog.getByRole("tab", { name: "Glossary" }).click();
  await expect(dialog.getByText(/never impossible/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  const a11y = await page.evaluate(() => ({
    liveRegions: document.querySelectorAll("[aria-live]").length,
    pressed: document.querySelectorAll("[aria-pressed]").length,
    landmarks: [...document.querySelectorAll("main,aside,nav,section[aria-label]")].map((e) => e.tagName.toLowerCase()),
    reducedMotion: [...document.styleSheets].some((s) => {
      try { return [...s.cssRules].some((r) => String(r.cssText).includes("prefers-reduced-motion")); } catch { return false; }
    }),
  }));
  expect(a11y.liveRegions).toBeGreaterThan(0);
  expect(a11y.landmarks).toContain("aside");
  expect(a11y.reducedMotion).toBe(true);

  artifact("phase8c-accessibility-qa.json", {
    artifact: "phase8c-accessibility-qa", phase: "8C — Time Arena",
    // playFantasyMenusKeyboardOperable lived here but is proven by a DIFFERENT
    // test, whose failure would not stop this artifact being written. Only what
    // the assertions above actually establish belongs in this file.
    escapeClosesGuide: true, ...a11y,
  });
});

test("Play and Fantasy menus are keyboard accessible and registry driven", async ({ page }) => {
  await withAccount(page);
  await page.goto("/");

  const play = page.getByRole("button", { name: /^Play/ });
  await play.click();
  const playMenu = page.getByRole("menu", { name: "Play" });
  await expect(playMenu).toBeVisible();
  for (const m of ["Chaos Clash", "Dream Matchup", "Daily Clash", "Best of 7", "Win 82", "Tournament", "Era Gauntlet"]) {
    await expect(playMenu.getByText(m, { exact: true })).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(playMenu).toHaveCount(0);
  await expect(play).toBeFocused();

  const fantasy = page.getByRole("button", { name: /^Fantasy/ });
  await fantasy.click();
  const fantasyMenu = page.getByRole("menu", { name: "Fantasy" });
  await expect(fantasyMenu.getByText("EraClash Fantasy", { exact: true })).toBeVisible();
  await expect(fantasyMenu.getByText("EraClash Live", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(fantasyMenu).toHaveCount(0);
});

test("a subscription-gated mode routes to one membership destination with no checkout", async ({ page }) => {
  await asGuest(page);
  await page.goto("/");
  await page.getByRole("button", { name: /^Play/ }).click();
  await page.getByRole("menuitem", { name: /Win 82/ }).click();
  await expect(page).toHaveURL(/\/membership\?/);
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/\$\d|card number|checkout|start free trial/i);
  expect(body).toMatch(/not active during the private preview|membership/i);
});

test("a coming-soon mode explains itself instead of asking for money", async ({ page }) => {
  await withAccount(page);
  await page.goto("/");
  await page.getByRole("button", { name: /^Play/ }).click();
  await page.getByRole("menuitem", { name: /Era Gauntlet/ }).click();
  await expect(page).toHaveURL(/\/modes\/era-gauntlet/);
  const body = await page.locator("body").innerText();
  expect(body).toMatch(/in development|coming soon/i);
  expect(body).not.toMatch(/\$\d|checkout/i);
});

test("both fantasy pages are truthful about not being live", async ({ page }) => {
  await withAccount(page);
  for (const [path, heading] of [["/fantasy/eraclash", "EraClash Fantasy"], ["/fantasy/live", "EraClash Live"]]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).toMatch(/not live/i);
    expect(body).not.toMatch(/join now|enter now|\$\d|entry fee\b(?!s)/i);
  }
});
