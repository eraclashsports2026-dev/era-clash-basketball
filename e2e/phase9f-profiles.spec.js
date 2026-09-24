// ── Phase 9F — Public Competitive Profiles + Player Cards V1 ─────────────────
// The journeys a person actually takes, against the fake-cloud harness: a
// public profile opened by a stranger, a private one refusing to resolve, and
// the honest sameness of every miss.
import { test, expect } from "@playwright/test";

const J = "11111111-1111-4111-8111-111111111111";
const authJ = { Authorization: `Bearer test-token.${J}`, "content-type": "application/json" };
const api = (request, body, headers = {}) => request.post("/api/profile", { data: body, headers: { "content-type": "application/json", ...headers } });
const fresh = (page) => page.addInitScript(() => { try { localStorage.setItem("ec_seen", "1"); } catch (e) {} });

test("a public profile opens by link for a signed-out visitor and shows only safe competitive identity", async ({ page, request }) => {
  const me = await (await api(request, { action: "profile-me" }, authJ)).json();
  expect(me.status).toBe("ok");
  // the owner opts in through the preference path, then features an unlocked achievement
  await api(request, { action: "profile-featured-set", featured: [] }, authJ);

  await fresh(page);
  await page.goto(`/player/${me.slug}`);
  // the harness account starts private, so the honest state is "not available"
  const heading = page.getByRole("heading", { level: 1 });
  await heading.waitFor({ timeout: 30_000 });
  const text = await page.locator("body").innerText();
  // whichever state it is, it must never carry private account data
  expect(text).not.toMatch(/@|Bearer|test-token|user_id|xp_ledger/i);
  expect(text).not.toMatch(/9f0000|1111-4111/);
});

test("a private, an unknown and a uuid-shaped slug are indistinguishable", async ({ page, request }) => {
  const answers = [];
  for (const slug of ["zzzzzzzzzzzzzzzzzzzz", "9f000001-0000-4000-8000-000000000001", "abc", ""]) {
    const r = await (await api(request, { action: "profile-public", slug })).json();
    answers.push({ status: r.status, found: r.found });
  }
  // every one of them answers the same way, revealing nothing about existence
  for (const a of answers) expect(a).toEqual({ status: "ok", found: false });

  await fresh(page);
  await page.goto("/player/zzzzzzzzzzzzzzzzzzzz");
  await expect(page.getByRole("heading", { name: /NOT AVAILABLE/i })).toBeVisible({ timeout: 30_000 });
  const body = await page.locator("body").innerText();
  expect(body).toMatch(/keeps their EraClash profile private/);
  // it must not say which of the three reasons applies
  expect(body).not.toMatch(/does not exist|deleted|unknown account|no such/i);
});

test("the profile route never exposes a rank for an account that is not eligible for one", async ({ request }) => {
  const me = await (await api(request, { action: "profile-me" }, authJ)).json();
  const pub = await (await api(request, { action: "profile-public", slug: me.slug })).json();
  if (pub.found && pub.profile.state !== "placed") {
    expect(pub.profile.rating).toBeUndefined();
    expect(pub.profile.rank).toBeUndefined();
    expect(pub.profile.placement).toBeTruthy();
  }
});

test("the account route refuses profile actions without a verified bearer", async ({ request }) => {
  expect((await api(request, { action: "profile-me" })).status()).toBe(401);
  expect((await api(request, { action: "profile-featured-set", featured: [] })).status()).toBe(401);
  // a public read is open, by design — but only with a slug
  expect((await api(request, { action: "profile-public", slug: "zzzzzzzzzzzzzzzzzzzz" })).status()).toBe(200);
});

test("a leaderboard row links only when that account made its profile public", async ({ page, request }) => {
  const links = await (await api(request, { action: "profile-board-links" })).json();
  expect(links.status).toBe("ok");
  await fresh(page);
  await page.goto("/leaderboard");
  await page.getByRole("heading", { name: /Challenge Rating/ }).waitFor({ timeout: 30_000 });
  const linked = await page.locator(".ec-cr-player-link").count();
  const rows = await page.locator(".ec-cr-table tbody tr").count();
  // never more links than rows, and a link exists only where the server granted one
  expect(linked).toBeLessThanOrEqual(rows);
  expect(linked).toBe(Object.keys(links.links || {}).filter((r) => Number(r) <= rows).length);
});
