# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phase9a-play-lobby.spec.js >> abandoning from the lobby asks first, and abandoning never refunds a guest run
- Location: e2e/phase9a-play-lobby.spec.js:163:1

# Error details

```
Error: guest start 3

expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 429
```

# Page snapshot

```yaml
- generic [ref=f2e3]:
  - banner [ref=f2e4]:
    - generic [ref=f2e5]:
      - button "EraClash Basketball home" [ref=f2e6] [cursor=pointer]:
        - generic [ref=f2e7]: BASKETBALL
      - navigation "Main" [ref=f2e8]:
        - button "Play" [ref=f2e10] [cursor=pointer]:
          - text: Play
          - generic [ref=f2e11]: ▾
        - button "Fantasy" [ref=f2e13] [cursor=pointer]:
          - text: Fantasy
          - generic [ref=f2e14]: ▾
        - button "Daily" [ref=f2e15] [cursor=pointer]
        - button "Challenges" [ref=f2e16] [cursor=pointer]
        - button "Leaderboard" [ref=f2e17] [cursor=pointer]
        - button "My EraClash" [ref=f2e18] [cursor=pointer]
      - button "Account menu for E2E, Free account" [ref=f2e21] [cursor=pointer]:
        - generic [ref=f2e22]: E
        - generic [ref=f2e23]:
          - generic [ref=f2e24]: E2E
          - generic [ref=f2e25]: Free account
  - main [ref=f2e27]:
    - generic [ref=f2e28]:
      - img "EraClash Basketball" [ref=f2e29]
      - heading "Play EraClash Basketball" [level=1] [ref=f2e30]
      - paragraph [ref=f2e31]: Welcome back. Choose how you want to play.
    - generic [ref=f2e32]:
      - region "Game modes" [ref=f2e33]:
        - article [ref=f2e34]:
          - generic [ref=f2e35]: RECOMMENDED
          - heading "Chaos Clash" [level=2] [ref=f2e43]
          - paragraph [ref=f2e44]: Three rolls. Hold your legends. History picks the era.
          - link "Start Chaos Clash, recommended mode" [ref=f2e45] [cursor=pointer]:
            - /url: /play/chaos
            - text: Start Chaos Clash
        - article [ref=f2e46]:
          - heading "Dream Matchup" [level=2] [ref=f2e53]
          - paragraph [ref=f2e54]: Build any historical matchup.
          - link "Build Dream Matchup" [ref=f2e55] [cursor=pointer]:
            - /url: /play/dream
            - text: Build Matchup →
        - article [ref=f2e56]:
          - heading "Daily Clash" [level=2] [ref=f2e63]
          - paragraph [ref=f2e64]: One shared challenge for everyone.
          - link "Play Daily Clash" [ref=f2e65] [cursor=pointer]:
            - /url: /play/daily
            - text: Play Today’s Clash →
      - region "More ways to play" [ref=f2e66]:
        - heading "MORE WAYS TO PLAY" [level=2] [ref=f2e67]
        - generic [ref=f2e68]:
          - article [ref=f2e69]:
            - heading "Best of 7" [level=2] [ref=f2e81]
            - paragraph [ref=f2e82]: Settle it over a series.
            - link "Start Best of 7" [ref=f2e83] [cursor=pointer]:
              - /url: /play/best-of-7
              - text: Start Series →
          - article [ref=f2e84]:
            - heading "Win 82" [level=2] [ref=f2e91]
            - paragraph [ref=f2e92]: Survive a full season.
            - link "Start Win 82" [ref=f2e93] [cursor=pointer]:
              - /url: /play/win-82
              - text: Start Season →
          - article [ref=f2e94]:
            - heading "Tournament" [level=2] [ref=f2e100]
            - paragraph [ref=f2e101]: Four rounds to a title.
            - link "Enter Tournament" [ref=f2e102] [cursor=pointer]:
              - /url: /play/tournament
              - text: Enter Tournament →
          - article [ref=f2e103]:
            - generic [ref=f2e104]: Coming soon
            - heading "Era Gauntlet" [level=2] [ref=f2e110]
            - paragraph [ref=f2e111]: Conquer the eras.
            - link "Learn more about Era Gauntlet, coming soon" [ref=f2e112] [cursor=pointer]:
              - /url: /modes/era-gauntlet
              - text: Learn More
  - navigation "More basketball modes" [ref=f2e113]:
    - link "All modes" [ref=f2e114] [cursor=pointer]:
      - /url: /clash/modes
    - link "Private rooms" [ref=f2e115] [cursor=pointer]:
      - /url: /clash/rooms
    - link "Privacy" [ref=f2e116] [cursor=pointer]:
      - /url: /privacy
    - link "Terms" [ref=f2e117] [cursor=pointer]:
      - /url: /terms
    - link "Founding Player" [ref=f2e118] [cursor=pointer]:
      - /url: /support
  - contentinfo [ref=f2e119]:
    - text: EraClash is not affiliated with, endorsed by, or sponsored by any professional basketball league or team. ·
    - button "Image credits" [ref=f2e120] [cursor=pointer]
    - text: ·
    - generic "Which build you are running — quote this if you report something" [ref=f2e121]: build 2550ae
```

# Test source

```ts
  104 | });
  105 | 
  106 | test("choosing Chaos Clash opens the Time Arena; the lobby remembers the run; Continue resumes it exactly", async ({ page }) => {
  107 |   test.slow();
  108 |   await withAccount(page);
  109 |   const posts = watchGame(page);
  110 |   await page.goto("/play");
  111 |   await page.getByRole("link", { name: /Start Chaos Clash, recommended/ }).click();
  112 |   await expect(page).toHaveURL(/\/play\/chaos$/);
  113 |   await expect(page.locator(".ec-ta")).toBeVisible();
  114 |   // The arena is open and STILL nothing has been dealt.
  115 |   await expect(page.locator(".ec-pc-empty")).toHaveCount(10);
  116 |   expect(posts).toEqual([]);
  117 | 
  118 |   await rollOne(page);
  119 |   expect(posts).toEqual(["start"]);
  120 |   const runId = await page.evaluate(() => localStorage.getItem("ec_chaos_run"));
  121 |   expect(runId).toBeTruthy();
  122 |   const names = await page.locator('.ec-ta-team[data-team="gold"] .ec-pc .ec-pc-name').allInnerTexts();
  123 |   // Hold one so the resumed board can prove it is the same decision state.
  124 |   await page.locator('.ec-ta-team[data-team="gold"] .ec-pc[data-slot="PG"]').getByRole("button", { name: /^Hold/ }).click();
  125 | 
  126 |   // The logo goes to the lobby and does NOT erase the run.
  127 |   await page.getByRole("button", { name: "EraClash Basketball home" }).click();
  128 |   await expect(page).toHaveURL(/\/$/);
  129 |   const card = page.locator(".ec-continue");
  130 |   await expect(card).toBeVisible({ timeout: 15_000 });
  131 |   await expect(card).toContainText("CONTINUE YOUR CHAOS CLASH");
  132 |   await expect(card).toContainText(/Roll 1 of 3/);
  133 |   await expect(card).toContainText(/era not yet revealed/);
  134 |   await expect(card).toContainText(/last activity/);
  135 |   await expect(card).toContainText("TEAM GOLD");
  136 |   await expect(card).toContainText("Legend Rival");
  137 |   expect(await page.evaluate(() => localStorage.getItem("ec_chaos_run"))).toBe(runId);
  138 |   // Nothing unrevealed leaks: no era id, no CPU hold count.
  139 |   await expect(card.getByText(/^\d{4}s$/)).toHaveCount(0);
  140 | 
  141 |   // Picking ANOTHER mode does not delete the run either.
  142 |   await page.getByRole("link", { name: /Daily Clash/ }).click();
  143 |   expect(await page.evaluate(() => localStorage.getItem("ec_chaos_run"))).toBe(runId);
  144 |   await page.getByRole("button", { name: "EraClash Basketball home" }).click();
  145 |   await expect(page.locator(".ec-continue")).toBeVisible({ timeout: 15_000 });
  146 | 
  147 |   // Continue resumes the exact server-authoritative run.
  148 |   await page.getByRole("button", { name: /Continue your Chaos Clash/ }).click();
  149 |   await expect(page).toHaveURL(/\/play\/chaos$/);
  150 |   await expect(stageAt(page, "DRAFTING")).toBeVisible({ timeout: 20_000 });
  151 |   await expect(page.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4)).toBeVisible({ timeout: 20_000 });
  152 |   expect(await page.locator('.ec-ta-team[data-team="gold"] .ec-pc .ec-pc-name').allInnerTexts()).toEqual(names);
  153 |   expect(await page.evaluate(() => localStorage.getItem("ec_chaos_run"))).toBe(runId);
  154 |   // Resuming re-read the run; it did not start a new one.
  155 |   expect(posts.filter((a) => a === "start")).toHaveLength(1);
  156 |   expect(posts).toContain("view");
  157 |   artifact("active-run-continuation-runtime.json", {
  158 |     artifact: "active-run-continuation-runtime", phase: "9A",
  159 |     runIdPreserved: true, gamePostsWhileInLobby: posts, resumedRoster: names,
  160 |   });
  161 | });
  162 | 
  163 | test("abandoning from the lobby asks first, and abandoning never refunds a guest run", async ({ page }) => {
  164 |   test.slow();
  165 |   await withAccount(page);
  166 |   await page.goto("/play/chaos");
  167 |   await rollOne(page);
  168 |   // A full navigation: the init script clears runs unless told to keep this one.
  169 |   await page.evaluate(() => sessionStorage.setItem("e2e_keep_run", "1"));
  170 |   await page.goto("/play");
  171 |   const card = page.locator(".ec-continue");
  172 |   await expect(card).toBeVisible({ timeout: 15_000 });
  173 | 
  174 |   // NO keeps everything.
  175 |   await card.getByRole("button", { name: /Abandon this Chaos Clash/ }).click();
  176 |   const dialog = page.getByRole("dialog", { name: /Abandon this Chaos Clash/ });
  177 |   await expect(dialog).toBeVisible();
  178 |   await expect(dialog.getByText(/counts when it starts, not when it ends/)).toBeVisible();
  179 |   await dialog.getByRole("button", { name: /No, keep this Chaos Clash/ }).click();
  180 |   await expect(dialog).toHaveCount(0);
  181 |   await expect(card).toBeVisible();
  182 |   expect(await page.evaluate(() => localStorage.getItem("ec_chaos_run"))).toBeTruthy();
  183 | 
  184 |   // YES discards it, and the lobby shows no false continuation afterwards.
  185 |   await card.getByRole("button", { name: /Abandon this Chaos Clash/ }).click();
  186 |   await page.getByRole("dialog", { name: /Abandon this Chaos Clash/ }).getByRole("button", { name: /Yes, abandon/ }).click();
  187 |   await expect(page.locator(".ec-continue")).toHaveCount(0, { timeout: 15_000 });
  188 |   expect(await page.evaluate(() => localStorage.getItem("ec_chaos_run"))).toBeNull();
  189 |   await page.reload();
  190 |   await expect(page.locator(".ec-lobby")).toBeVisible();
  191 |   await expect(page.locator(".ec-continue")).toHaveCount(0);
  192 | 
  193 |   // The budget is spent when a run STARTS. A fresh guest session starts and
  194 |   // abandons three runs; the fourth start is gated — abandoning bought nothing.
  195 |   const guest = await page.context().browser().newContext();
  196 |   const api = async (body) => {
  197 |     const r = await guest.request.post("/api/game", { data: { tier: "GUEST", ...body }, headers: { "Content-Type": "application/json" } });
  198 |     return { status: r.status(), body: await r.json().catch(() => null) };
  199 |   };
  200 |   const seen = [];
  201 |   for (let i = 0; i < 3; i++) {
  202 |     const s = await api({ chaosAction: "start" });
  203 |     seen.push(s.status);
> 204 |     expect(s.status, `guest start ${i + 1}`).toBe(200);
      |                                              ^ Error: guest start 3
  205 |     const a = await api({ chaosAction: "abandon", chaosRunId: s.body.chaos.chaosRunId });
  206 |     expect(a.status, `guest abandon ${i + 1}`).toBe(200);
  207 |   }
  208 |   const fourth = await api({ chaosAction: "start" });
  209 |   expect(fourth.status).toBe(403);
  210 |   expect(fourth.body?.gated).toBe(true);
  211 |   expect(fourth.body?.guestRunsUsed).toBe(3);
  212 |   await guest.close();
  213 |   artifact("active-run-abandon-runtime.json", {
  214 |     artifact: "active-run-abandon-runtime", phase: "9A",
  215 |     confirmationRequired: true, guestStartsAfterThreeAbandons: fourth.status, guestRunsUsed: fourth.body?.guestRunsUsed,
  216 |   });
  217 | });
  218 | 
  219 | test("an expired or forgotten run gets an honest expired state, not a Continue card", async ({ page }) => {
  220 |   await withAccount(page);
  221 |   await page.addInitScript(() => { try { localStorage.setItem("ec_chaos_run", "zzzzzzzzzz"); sessionStorage.setItem("e2e_keep_run", "1"); } catch (e) {} });
  222 |   await page.goto("/play");
  223 |   const expired = page.locator(".ec-continue--expired");
  224 |   await expect(expired).toBeVisible({ timeout: 15_000 });
  225 |   await expect(expired).toContainText("EXPIRED");
  226 |   await expect(expired.getByRole("button", { name: /Continue/ })).toHaveCount(0);
  227 |   await expired.getByRole("button", { name: "DISMISS" }).click();
  228 |   await expect(page.locator(".ec-continue")).toHaveCount(0);
  229 |   expect(await page.evaluate(() => localStorage.getItem("ec_chaos_run"))).toBeNull();
  230 | });
  231 | 
  232 | test("a guest who picks Dream Matchup meets the account gate at its own address, and the way back is the lobby", async ({ page }) => {
  233 |   await asGuest(page);
  234 |   await page.goto("/play");
  235 |   const dream = page.locator('.ec-mode-card[data-mode="dream"]');
  236 |   await expect(dream).toHaveAttribute("data-status", "ACCOUNT_REQUIRED");
  237 |   await expect(dream.getByText("Free account")).toBeVisible();
  238 |   await dream.locator(".ec-mode-action").click();
  239 |   await expect(page).toHaveURL(/\/play\/dream$/);
  240 |   await expect(page.getByText("FREE ACCOUNT REQUIRED")).toBeVisible();
  241 |   await expect(page.getByRole("heading", { name: "Dream Matchup" })).toBeVisible();
  242 |   await page.getByRole("button", { name: "BACK TO THE LOBBY" }).click();
  243 |   await expect(page).toHaveURL(/\/play$/);
  244 |   await expect(page.locator(".ec-lobby")).toBeVisible();
  245 | });
  246 | 
  247 | test("one dominant action per Time Arena state, inactive systems subdued, the Story leads the result", async ({ page }) => {
  248 |   test.slow();
  249 |   await withAccount(page);
  250 |   await page.goto("/play/chaos");
  251 |   const stage = page.locator(".ec-ta-stage");
  252 |   const ctas = page.locator("button.ec-ta-cta");
  253 |   const record = [];
  254 |   const snap = async (name) => {
  255 |     // The coach section fades over 180ms; read it settled.
  256 |     await page.waitForTimeout(350);
  257 |     const m = await page.evaluate(() => {
  258 |       const s = document.querySelector(".ec-ta-stage");
  259 |       const coach = document.querySelector(".ec-ta-coach");
  260 |       return {
  261 |         focus: s?.dataset.focus || null,
  262 |         primaryCtas: document.querySelectorAll("button.ec-ta-cta").length,
  263 |         coachActive: coach?.dataset.active || null,
  264 |         coachOpacity: coach ? Number(getComputedStyle(coach).opacity) : null,
  265 |       };
  266 |     });
  267 |     record.push({ state: name, ...m });
  268 |     return m;
  269 |   };
  270 |   // 9B.3 guided flow: one primary action per state, and Coach Chaos does not
  271 |   // exist on the board until the five is set (owner decision 2026-09-09: players →
  272 |   // coaching → era → ready → result). `coachActive` is null while it is absent.
  273 |   // Empty frame: ROLL is the only primary action.
  274 |   await expect(ctas).toHaveCount(1);
  275 |   let m = await snap("empty");
  276 |   expect(m.focus).toBe("empty"); expect(m.coachActive).toBeNull();
  277 | 
  278 |   await rollOne(page);
  279 |   await expect(ctas).toHaveCount(1);
  280 |   m = await snap("drafting-roll-1");
  281 |   expect(m.focus).toBe("drafting"); expect(m.coachActive).toBeNull();
  282 | 
  283 |   await page.getByRole("button", { name: /^ROLL 2$/ }).click();
  284 |   // 2026-09-09: no era interstitial — Roll 2 lands as drafting again (era on Clash Ready)
  285 |   await expect(page.getByText(/ROLL 2 OF 3/).first()).toBeVisible({ timeout: 20_000 });
  286 |   await expect(stageAt(page, "DRAFTING")).toBeVisible({ timeout: 20_000 });
  287 |   await expect(ctas).toHaveCount(1);
  288 |   await snap("drafting-roll-2");
  289 |   await page.getByRole("button", { name: /FINAL ROLL/ }).click();
  290 |   await expect(stageAt(page, "COACH_SELECT")).toBeVisible({ timeout: 20_000 });
  291 |   await expect(page.getByText("COACH CHAOS").first()).toBeVisible();
  292 |   await expect(ctas).toHaveCount(1);
  293 |   m = await snap("coach-select");
  294 |   expect(m.focus).toBe("coach_select"); expect(m.coachActive).toBe("true"); expect(m.coachOpacity).toBe(1);
  295 |   await page.getByRole("button", { name: /^Select / }).first().click();
  296 |   await page.getByRole("button", { name: /CONTINUE WITH COACH/ }).click();
  297 |   await expect(page.getByRole("button", { name: /RUN CLASH/ })).toBeVisible({ timeout: 20_000 });
  298 |   await expect(ctas).toHaveCount(1);
  299 |   m = await snap("ready");
  300 |   expect(m.focus).toBe("ready"); expect(m.coachActive).toBeNull();
  301 |   // Completed rolls compress to ticks.
  302 |   expect(await page.locator('.ec-ta-step[data-state="COMPLETE"]').count()).toBe(3);
  303 | 
  304 |   await page.getByRole("button", { name: /RUN CLASH/ }).click();
```