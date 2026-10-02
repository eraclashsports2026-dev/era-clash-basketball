# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phase8c-time-arena.spec.js >> mobile stacks, leads with the result, and never overflows
- Location: e2e/phase8c-time-arena.spec.js:451:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4)
Expected: visible
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 20000ms
  - waiting for locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4)

```

```yaml
- banner:
  - button "Menu"
  - button "EraClash Basketball home"
  - button "Account menu for E2E, Free account"
- main:
  - region "Chaos Clash draft":
    - heading "CHAOS CLASH" [level=1]
    - text: ROLL 1 OF 3
    - list "Draft progress":
      - listitem "Roll 1, roll 1 — active": 1 ROLL 1
      - listitem "Roll 2, roll 2 — up next": 2 ROLL 2
      - listitem "Roll 3, final roll — up next": 3 FINAL ROLL
    - tablist "Show a team":
      - tab "TEAM GOLD YOUR FIVE" [selected]
      - tab "TEAM BLUE LEGEND RIVAL"
    - text: PG ROLL TO REVEAL SG ROLL TO REVEAL SF ROLL TO REVEAL PF ROLL TO REVEAL C ROLL TO REVEAL
    - button "ROLL"
    - alert: Too many requests — slow down a little.
  - button "HELP & SETTINGS"
  - complementary "Live intel":
    - region "How Chaos Clash works":
      - heading "HOW CHAOS WORKS" [level=2]
      - list:
        - listitem: ROLL three times. Each roll offers a new five.
        - listitem: HOLD the legends you want. Released players are gone.
        - listitem: ROLL again after each hold — three rolls set your five.
        - listitem: CHOOSE a coach once your five is set.
        - listitem: RUN the Clash and let history decide.
      - button "HOW IT WORKS"
- navigation "More basketball modes":
  - link "All modes":
    - /url: /clash/modes
  - link "Private rooms":
    - /url: /clash/rooms
  - link "Privacy":
    - /url: /privacy
  - link "Terms":
    - /url: /terms
  - link "Founding Player":
    - /url: /support
- contentinfo:
  - text: EraClash is not affiliated with, endorsed by, or sponsored by any professional basketball league or team. ·
  - button "Image credits"
  - text: · build 2550ae
```

# Test source

```ts
  369 | 
  370 |   // The full report expands over the same page and reads on its light surface.
  371 |   await page.getByRole("button", { name: /VIEW FULL REPORT/ }).click();
  372 |   const report = page.getByRole("dialog", { name: "Full postgame report" });
  373 |   await expect(report).toBeVisible();
  374 |   await report.getByRole("tab", { name: "Box Score" }).click();
  375 |   const ink = await page.evaluate(() => {
  376 |     const lum = (c) => { const [r, g, b] = String(c).match(/[\d.]+/g).map(Number); return (r * 0.299 + g * 0.587 + b * 0.114) / 255; };
  377 |     return [...document.querySelectorAll(".ec-report-overlay td.box-player")]
  378 |       .filter((c) => c.textContent.trim() && c.textContent.trim() !== "TOTAL")
  379 |       .slice(0, 4)
  380 |       .map((c) => ({ text: c.textContent.trim(), ink: lum(getComputedStyle(c).color), paper: lum(getComputedStyle(c).backgroundColor) }));
  381 |   });
  382 |   expect(ink.length).toBeGreaterThan(0);
  383 |   for (const n of ink) {
  384 |     expect(n.ink, `name "${n.text}"`).toBeLessThan(0.4);
  385 |     expect(n.paper - n.ink).toBeGreaterThan(0.35);
  386 |   }
  387 |   await page.getByRole("button", { name: /Back to the arena/ }).click();
  388 |   await expect(report).toHaveCount(0);
  389 | 
  390 |   // A new Clash keeps the finished one — labelled, and never as the live draft.
  391 |   await page.getByRole("button", { name: "New Chaos Clash" }).click();
  392 |   await expect(page.getByText(/ROLL 1 OF 3/).first()).toBeVisible();
  393 |   await expect(page.locator(".ec-pc-empty")).toHaveCount(10);
  394 |   await expect(page.getByRole("button", { name: /RUN CLASH/ })).toHaveCount(0);
  395 |   await expect(page.getByRole("button", { name: /^ROLL$/ })).toBeVisible();
  396 |   await expect(page.locator(".ec-intel-era-id")).toHaveCount(0);
  397 |   // The empty frame says nothing about an era at all (spec 9B.3 §9).
  398 |   await expect(page.locator(".ec-ta-utility")).not.toContainText(/ERA:/);
  399 |   // The finished game is one tap away, compact, and never a dock beside the
  400 |   // new draft; the sheet it opens labels it as the LAST clash, twice over.
  401 |   const last = page.locator(".ec-ta-lastclash");
  402 |   await expect(last).toBeVisible();
  403 |   await expect(page.locator(".ec-dock")).toHaveCount(0);
  404 |   await last.click();
  405 |   const sheet = page.getByRole("dialog", { name: "Your last Clash" });
  406 |   await expect(sheet.getByText("LAST CLASH · NOT THE DRAFT ON SCREEN").first()).toBeVisible();
  407 |   await page.keyboard.press("Escape");
  408 |   await expect(sheet).toHaveCount(0);
  409 | });
  410 | 
  411 | test("a run resumed after a reload still runs", async ({ page }) => {
  412 |   test.slow();
  413 |   await withAccount(page);
  414 |   await page.goto("/play/chaos");
  415 |   await toReady(page);
  416 |   await page.evaluate(() => sessionStorage.setItem("e2e_keep_run", "1"));
  417 |   await page.reload();
  418 |   await expect(page.getByRole("button", { name: /RUN CLASH/ })).toBeVisible({ timeout: 20_000 });
  419 |   await page.getByRole("button", { name: /RUN CLASH/ }).click();
  420 |   await expect(page.locator(".ec-ta-score")).toBeVisible({ timeout: 45_000 });
  421 | });
  422 | 
  423 | test("Run it back replays the SAME matchup and actually completes", async ({ page }) => {
  424 |   test.slow();
  425 |   await withAccount(page);
  426 |   await page.goto("/play/chaos");
  427 |   await toReady(page);
  428 |   await page.getByRole("button", { name: /RUN CLASH/ }).click();
  429 |   await expect(page.locator(".ec-ta-score")).toBeVisible({ timeout: 45_000 });
  430 | 
  431 |   // The rematch must send a mode the server accepts, with the stored coaches
  432 |   // and era — an earlier build sent mode "chaos" and every rematch failed.
  433 |   let body = null;
  434 |   page.on("request", (req) => {
  435 |     if (req.url().includes("/api/game") && req.method() === "POST") {
  436 |       try {
  437 |         const b = JSON.parse(req.postData() || "{}");
  438 |         if (b.goldIds && b.simulationId) body = b;
  439 |       } catch { /* not this request */ }
  440 |     }
  441 |   });
  442 |   await page.getByRole("button", { name: "Run it back" }).click();
  443 |   await expect(page.locator(".ec-ta-score")).toBeVisible({ timeout: 45_000 });
  444 |   expect(body).toBeTruthy();
  445 |   expect(body.mode).toBe("single");
  446 |   expect(body.coachGoldId).toBeTruthy();
  447 |   expect(body.coachBlueId).toBeTruthy();
  448 |   expect(body.eraStyleId).toMatch(/^\d{4}s$/);
  449 | });
  450 | 
  451 | test("mobile stacks, leads with the result, and never overflows", async ({ page }) => {
  452 |   test.slow();
  453 |   await withAccount(page);
  454 |   await page.setViewportSize({ width: 375, height: 812 });
  455 |   await page.goto("/play/chaos");
  456 |   await expect(page.locator(".ec-ta")).toBeVisible();
  457 | 
  458 |   const draft = await page.evaluate(() => ({
  459 |     columns: getComputedStyle(document.querySelector(".ec-ta")).gridTemplateColumns.split(" ").length,
  460 |     overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  461 |     utility: document.querySelector(".ec-ta-utility").innerText.replace(/\n/g, " "),
  462 |   }));
  463 |   expect(draft.columns).toBe(1);
  464 |   expect(draft.overflow).toBe(0);
  465 |   expect(draft.utility).toMatch(/HELP & SETTINGS/);
  466 | 
  467 |   await page.getByRole("button", { name: /^ROLL$/ }).click();
  468 |   // Phase 9B.3: a phone shows one team at a time (Gold first, Blue one tap away).
> 469 |   await expect(page.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4)).toBeVisible({ timeout: 20_000 });
      |                                                                             ^ Error: expect(locator).toBeVisible() failed
  470 |   await expect(page.getByRole("tab", { name: "TEAM BLUE" })).toBeVisible();
  471 |   const cards = await page.evaluate(() => {
  472 |     const vw = document.documentElement.clientWidth;
  473 |     // Content past the edge is only acceptable inside something that scrolls.
  474 |     const unreachable = [...document.querySelectorAll(".ec-ta *")].filter((e) => {
  475 |       if (e.getBoundingClientRect().right <= vw + 1) return false;
  476 |       let p = e;
  477 |       while (p && p !== document.body) {
  478 |         if (["auto", "scroll", "hidden"].includes(getComputedStyle(p).overflowX)) return false;
  479 |         p = p.parentElement;
  480 |       }
  481 |       return true;
  482 |     }).length;
  483 |     return {
  484 |       unreachable,
  485 |       taps: [...document.querySelectorAll(".ec-pc-action")].map((b) => Math.round(b.getBoundingClientRect().height)),
  486 |       cardWidth: Math.round(document.querySelector(".ec-pc").getBoundingClientRect().width),
  487 |       clippedTags: [...document.querySelectorAll(".ec-pc-name")].filter((n) => n.scrollHeight > n.clientHeight + 1).length,
  488 |     };
  489 |   });
  490 |   expect(cards.unreachable).toBe(0);
  491 |   expect(Math.min(...cards.taps)).toBeGreaterThanOrEqual(44);
  492 |   // These two were measured and then never asserted, so the name-clipping
  493 |   // regression this test exists to catch would have passed in silence.
  494 |   expect(cards.clippedTags, "a player name must not be clipped on a phone").toBe(0);
  495 |   expect(cards.cardWidth, "a phone card must stay a readable width").toBeGreaterThanOrEqual(120);
  496 | 
  497 |   await toReadyFromRoll1(page);
  498 |   await page.getByRole("button", { name: /RUN CLASH/ }).click();
  499 |   await expect(page.locator(".ec-ta-score")).toBeVisible({ timeout: 45_000 });
  500 |   // Phase 9B.3: in the Result state the contextual rail is gone and THIS game
  501 |   // is the hero of the main column, above the matchup that produced it.
  502 |   const finished = await page.evaluate(() => {
  503 |     const hero = document.querySelector(".ec-ta-result-hero");
  504 |     const stage = document.querySelector(".ec-ta-stage");
  505 |     const score = document.querySelector(".ec-ta-score");
  506 |     return {
  507 |       heroPresent: !!hero,
  508 |       // The score leads: it sits in the stage head, above the tabs and actions.
  509 |       scoreAboveHero: !!hero && !!score && score.getBoundingClientRect().top < hero.getBoundingClientRect().top,
  510 |       scoreTop: score ? Math.round(score.getBoundingClientRect().top + window.scrollY) : null,
  511 |       railPresent: !!document.querySelector(".ec-ta-rail"),
  512 |       overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  513 |     };
  514 |   });
  515 |   expect(finished.heroPresent).toBe(true);
  516 |   expect(finished.scoreAboveHero).toBe(true);
  517 |   expect(finished.railPresent).toBe(false);
  518 |   expect(finished.overflow).toBe(0);
  519 | 
  520 |   artifact("phase8c-responsive-qa.json", {
  521 |     artifact: "phase8c-responsive-qa", phase: "8C — Time Arena",
  522 |     viewport: "375x812", draft, cards, finished,
  523 |     note: "Desktop geometry (two columns, a rail that scrolls with the page, ten cards) is asserted by the workspace and board tests.",
  524 |   });
  525 | });
  526 | 
  527 | test("a Wave 1 scenario link lands a GUEST in the preloaded builder", async ({ page }) => {
  528 |   await asGuest(page);
  529 |   await page.goto("/?scenario=w1-s1");
  530 |   await expect(page.getByText(/GUIDED SCENARIO/i).first()).toBeVisible({ timeout: 20_000 });
  531 |   await expect(page.locator("body")).not.toContainText("Create a free account to unlock every mode");
  532 | });
  533 | 
  534 | test("the guide opens, moves between sections, and closes on Escape", async ({ page }) => {
  535 |   await withAccount(page);
  536 |   await page.goto("/play/chaos");
  537 |   await page.getByRole("button", { name: /HOW TO PLAY/ }).click();
  538 |   const dialog = page.getByRole("dialog", { name: "Arena guide" });
  539 |   await expect(dialog).toBeVisible();
  540 |   await expect(dialog.getByText(/Three rolls, one board/)).toBeVisible();
  541 |   await dialog.getByRole("tab", { name: "Glossary" }).click();
  542 |   await expect(dialog.getByText(/never impossible/)).toBeVisible();
  543 |   await page.keyboard.press("Escape");
  544 |   await expect(dialog).toHaveCount(0);
  545 | 
  546 |   const a11y = await page.evaluate(() => ({
  547 |     liveRegions: document.querySelectorAll("[aria-live]").length,
  548 |     pressed: document.querySelectorAll("[aria-pressed]").length,
  549 |     landmarks: [...document.querySelectorAll("main,aside,nav,section[aria-label]")].map((e) => e.tagName.toLowerCase()),
  550 |     reducedMotion: [...document.styleSheets].some((s) => {
  551 |       try { return [...s.cssRules].some((r) => String(r.cssText).includes("prefers-reduced-motion")); } catch { return false; }
  552 |     }),
  553 |   }));
  554 |   expect(a11y.liveRegions).toBeGreaterThan(0);
  555 |   expect(a11y.landmarks).toContain("aside");
  556 |   expect(a11y.reducedMotion).toBe(true);
  557 | 
  558 |   artifact("phase8c-accessibility-qa.json", {
  559 |     artifact: "phase8c-accessibility-qa", phase: "8C — Time Arena",
  560 |     // playFantasyMenusKeyboardOperable lived here but is proven by a DIFFERENT
  561 |     // test, whose failure would not stop this artifact being written. Only what
  562 |     // the assertions above actually establish belongs in this file.
  563 |     escapeClosesGuide: true, ...a11y,
  564 |   });
  565 | });
  566 | 
  567 | test("Play and Fantasy menus are keyboard accessible and registry driven", async ({ page }) => {
  568 |   await withAccount(page);
  569 |   await page.goto("/play/chaos");
```