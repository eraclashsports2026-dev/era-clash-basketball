// Independent reusable Run2/Run3 verifier. Local companion ONLY: actual game
// handlers and actual fake-cloud inserts, injected existing browser provider.
// This is PARTIAL EMULATED account evidence, never real OAuth/SMTP/RLS/Preview.
// Start tests/loop-stateful-harness.mjs with a fresh in-memory store for each run.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { BY_ID, MODE_TAGS } from '../src/loop/draft/model.js';
import { LOOP_CAREER_MODES } from '../src/loop/careerMode.js';
import { LOOP_EVENTS } from '../src/loop/events.js';
import { statefulUsers, identitySalt } from './loop-stateful-identities.mjs';
const base = process.env.LOOP_STATEFUL_URL || 'http://localhost:4321';
const run = process.env.LOOP_STATEFUL_RUN || 'run-2';
const only = (process.env.LOOP_STATEFUL_ONLY || '').split(',').filter(Boolean);
const smoke = process.env.LOOP_STATEFUL_SMOKE === '1';
const expectedCore = '55bb26a20e7d9176b25f102eea553820a7ea94cf935953f87cb3c9cc18656fff';
const sourceSHA = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const builtHTML = readFileSync('dist/index.html', 'utf8');
const productionBuildStamp = /<meta\s+name="eraclash-build"\s+content="([^"]+)"/.exec(builtHTML)?.[1] || null;
const U1 = statefulUsers[0].userId, U2 = statefulUsers[1].userId;
const report = { run, target: base, startedAt: new Date().toISOString(), identityNamespace: identitySalt, sourceSHA, runtimeSourceSHA: process.env.LOOP_RUNTIME_SOURCE_SHA || 'a826333eb68ff2b995933541bb4be44ca9acda7b', productionBuildStamp, companionMethod: 'Vite source modules + test-only main import/provider transform; source client has no production build stamp. Actual API handler process with in-memory fake cloud writes rows; read-only bridge scopes rows by fake token. Not production-dist/auth/RLS evidence.', scope: 'PARTIAL EMULATED: localhost actual handlers + Candidate4 + existing fakeCloud/test provider. No real Preview OAuth, SMTP, RLS, provider durability, physical device or deployment proof.', localBudgetOverrides: { RL_SIM_PER_MIN_SESSION: 500, RL_SIM_PER_MIN_IP: 500, purpose: 'Local verification only; shared 120 actions/min and public 20 recaps/min remain enforced' }, checks: [], failures: [], consoleErrors: [], results: [], eventBatches: [], beacons: [], governedChallenges: [] };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
const contexts = [];
const assert = (v, m) => { if (!v) throw new Error(m); };
const equal = (a, b, m) => assert(JSON.stringify(a) === JSON.stringify(b), m);
const check = async (name, fn) => { try { const details = await fn(); report.checks.push({ name, status: 'PASS', ...(details ? { details } : {}) }); console.log(`PASS ${name}`); } catch (e) { report.checks.push({ name, status: 'FAIL', error: e.message }); report.failures.push({ name, error: e.stack }); console.log(`FAIL ${name}: ${e.message}`); } };
const eventView = event => Object.fromEntries(Object.entries(event).filter(([key]) => ['event', 'ts', 'uid', 'session_id', 'app_version', 'build', 'mode', 'channel', 'source'].includes(key)));
const newPage = async (label, userId = null, width = 1280) => {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, permissions: ['clipboard-read', 'clipboard-write'], baseURL: base }); contexts.push(ctx);
  const page = await ctx.newPage(); page.setDefaultTimeout(15000);
  await page.exposeFunction('__loopQARecordBeacon', data => report.beacons.push({ label, ...data, events: data.events.map(eventView) }));
  await page.addInitScript(({ id }) => {
    if (id) localStorage.setItem('loop_qa_account', id);
    localStorage.setItem('ec_seen', '1');
    const realBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function(url, data) {
      const accepted = realBeacon(url, data);
      if (String(url).endsWith('/api/events')) Promise.resolve(data instanceof Blob ? data.text() : String(data)).then(text => { try { window.__loopQARecordBeacon({ url: String(url), accepted, events: JSON.parse(text).events || [] }); } catch {} });
      return accepted;
    };
  }, { id: userId });
  page.on('pageerror', e => report.consoleErrors.push({ label, error: e.message }));
  page.on('response', async r => {
    if (!r.url().endsWith('/api/events')) return;
    let events = []; try { events = r.request().postDataJSON()?.events || []; } catch {}
    report.eventBatches.push({ label, status: r.status(), events: events.map(eventView) });
  });
  return page;
};
const navigate = (p, path) => p.goto(`${base}${path}`, { waitUntil: 'networkidle' });
const post = async (p, path, body, { userId, expected = 200 } = {}) => {
  const response = await p.request.post(`${base}${path}`, { headers: { Origin: base, 'Content-Type': 'application/json', ...(userId ? { Authorization: `Bearer test-token.${userId}` } : {}) }, data: body });
  const data = await response.json(); assert(response.status() === expected, `${path} ${body.op || body.action || body.chaosAction}: expected ${expected}, got ${response.status()} ${JSON.stringify(data)}`); return data;
};
const loop = (p, body, options) => post(p, '/api/game', { action: 'loop', simulationId: randomUUID(), ...body }, options);
let lastGameAt = 0;
const pace = async p => { const wait = 3600 - (Date.now() - lastGameAt); if (wait > 0) await p.waitForTimeout(wait); lastGameAt = Date.now(); };
const chooseFive = async (p, queries = ['Magic', 'Kobe', 'Bird', 'KG', 'Kareem']) => { for (let i = 0; i < queries.length; i++) { await p.getByTestId(`loop-player-${i}`).fill(queries[i]); await p.locator('.loop-options button').first().click(); } };
const realPlay = async (p, buttonName, op = 'play', mode) => {
  await pace(p);
  const response = await Promise.all([p.waitForResponse(r => r.url().endsWith('/api/game') && r.request().method() === 'POST' && r.request().postDataJSON()?.op === op), p.getByRole('button', { name: buttonName, exact: true }).click()]).then(([r]) => r);
  const data = await response.json(); assert(response.ok(), `${op} ${response.status()} ${JSON.stringify(data)}`);
  assert(data.resultId && data.result?.core?.finalScore, 'Missing server result/score');
  if (mode) assert(data.result.loop.mode === mode, 'Wrong authoritative mode');
  assert(data.result.candidate?.candidateId === 'Candidate 4', `Expected accepted Candidate4, got ${data.result.candidate?.candidateId}`);
  assert(data.result.candidate?.possessionCalibrationVersion === '1.4.0', 'Calibration drift'); assert(data.result.candidate?.coreHash === expectedCore, 'Protected candidate core drift');
  report.results.push({ resultId: data.resultId, mode: data.result.loop.mode, score: data.result.core.finalScore, goldIds: data.result.goldIds, blueIds: data.result.blueIds, eraId: data.result.eraId, coachIds: data.result.coachIds, candidate: data.result.candidate?.candidateId, calibration: data.result.candidate?.possessionCalibrationVersion, coreHash: data.result.candidate?.coreHash });
  await p.getByRole('region', { name: 'Completed Clash', exact: true }).waitFor(); return data;
};
const playMode = async (p, mode) => {
  await navigate(p, `/clash/${mode === 'tonight' ? 'franchise' : mode}`);
  if (['any-five', 'one-franchise', 'one-per-era', 'no-mvps', 'lab'].includes(mode)) {
    await p.getByRole('button', { name: 'Fill a playable example', exact: true }).click();
    await p.locator('.loop-form details summary').click(); await p.getByLabel('Your coach', { exact: true }).selectOption('red-auerbach');
    if (mode === 'lab') { await p.getByLabel('Rules environment', { exact: true }).selectOption('1970s'); await p.getByLabel('Imagined team label', { exact: true }).fill('Local test scenario'); }
    return realPlay(p, 'Run this five', 'play', mode);
  }
  if (mode === 'spin') {
    await p.getByRole('button', { name: 'Spin the draft', exact: true }).click(); await p.getByRole('button', { name: 'Fill a playable example', exact: true }).waitFor(); await p.getByRole('button', { name: 'Fill a playable example', exact: true }).click(); return realPlay(p, 'Run the Spin five', 'play', mode);
  }
  if (mode === 'daily') {
    await p.getByRole('button', { name: 'Open today’s draft', exact: true }).click();
    await p.getByRole('button', { name: 'Roll 2 · keep held picks', exact: true }).click(); await p.getByRole('button', { name: 'Roll 3 · keep held picks', exact: true }).click(); await p.locator('.loop-coach .loop-primary').last().click(); return realPlay(p, 'Play today’s Daily', 'daily-play', mode);
  }
  if (mode === 'gauntlet') {
    await chooseFive(p); await p.getByRole('button', { name: 'Start the Gauntlet', exact: true }).click(); await p.getByRole('button', { name: 'Play this era', exact: true }).waitFor();
    let final, fixed; for (let stage = 0; stage < 7; stage++) { final = await realPlay(p, stage ? 'Continue to the next era' : 'Play this era', 'gauntlet-play', mode); fixed ||= final.result.goldIds; equal(final.result.goldIds, fixed, 'Gauntlet five changed'); if (final.gauntlet.done) break; }
    assert(final.gauntlet.done, 'Gauntlet did not finish'); assert(final.result.loop.gauntlet?.finished, 'Completed-run metadata missing'); return final;
  }
  if (mode === 'tonight') { await p.getByLabel('Schedule date', { exact: true }).fill('2026-10-20'); await p.getByRole('button', { name: 'Load this pairing', exact: true }).last().click(); }
  else { await p.getByLabel('Gold franchise', { exact: true }).selectOption('chicago'); await p.getByLabel('Blue franchise', { exact: true }).selectOption('san-antonio'); }
  return realPlay(p, 'Watch this matchup', 'play', mode);
};
const savedView = async (p, id) => p.evaluate(async id => { const { provider } = await import('/src/accounts/provider.js'); const row = await provider().getSavedClash(id); if (!row) return null; const s = row.result_snapshot; return { resultId: row.result_id, mode: row.mode, candidateId: row.candidate_id, calibration: row.calibration_version, coreHash: row.candidate_core_hash, goldIds: row.gold_roster.map(p => p.id), blueIds: row.blue_roster.map(p => p.id), eraId: row.era_id, coachIds: { gold: row.gold_coach?.id || 'neutral', blue: row.blue_coach?.id || 'neutral' }, score: { gold: row.gold_score, blue: row.blue_score }, snapshot: { mode: s?.loop?.mode, score: s?.core?.finalScore, goldIds: s?.goldIds, blueIds: s?.blueIds, candidate: s?.candidate?.candidateId, calibration: s?.candidate?.possessionCalibrationVersion, coreHash: s?.candidate?.coreHash }, userId: row.user_id }; }, id);
const saveHistoryRematch = async (p, data, mode) => {
  const region = p.getByRole('region', { name: 'Completed Clash', exact: true });
  const saved = await Promise.all([p.waitForResponse(r => r.url().endsWith('/api/profile') && r.request().postDataJSON()?.action === 'cloud-save' && r.request().postDataJSON()?.resultId === data.resultId), region.getByRole('button', { name: 'Save to My EraClash', exact: true }).click()]).then(([r]) => r);
  const status = await saved.json(); assert(saved.ok() && ['saved', 'already_saved'].includes(status.status), `Save failed: ${saved.status()} ${JSON.stringify(status)}`);
  const row = await savedView(p, data.resultId); assert(row && row.mode === LOOP_CAREER_MODES[mode], 'Saved source mode lost'); assert(row.snapshot.mode === mode, 'Snapshot source mode lost'); assert(row.candidateId === 'Candidate 4' && row.snapshot.candidate === 'Candidate 4', 'Saved row/snapshot candidate drift'); assert(row.calibration === '1.4.0' && row.snapshot.calibration === '1.4.0', 'Saved row/snapshot calibration drift'); assert(row.coreHash === expectedCore && row.snapshot.coreHash === expectedCore, 'Saved row/snapshot protected core drift');
  equal(row.goldIds, data.result.goldIds, 'Saved Gold IDs changed'); equal(row.blueIds, data.result.blueIds, 'Saved Blue IDs changed'); equal(row.snapshot.score, data.result.core.finalScore, 'Saved score changed'); equal(row.coachIds, data.result.coachIds, 'Saved coaches changed'); assert(row.eraId === data.result.eraId, 'Saved era changed');
  await navigate(p, '/my-eraclash?tab=history'); const section = p.locator(`section[data-clash="${data.resultId}"]`); await section.waitFor(); await section.locator('button[aria-expanded]').click();
  assert(await section.getByRole('button', { name: 'FRESH CASUAL REMATCH', exact: true }).isVisible(), 'Fresh-casual action missing');
  await section.getByRole('button', { name: 'VIEW FULL REPORT', exact: true }).click(); const dialog = p.getByRole('dialog', { name: 'Saved postgame report', exact: true }); await dialog.waitFor(); await dialog.locator('.ec-bd').waitFor();
  const text = await dialog.innerText(); for (const id of [...data.result.goldIds, ...data.result.blueIds]) assert(text.includes(BY_ID.get(id).name), `Report omitted ${BY_ID.get(id).name}`);
  await dialog.getByRole('button', { name: 'OPEN BREAKDOWN', exact: true }).click(); await dialog.getByRole('button', { name: 'TEAM COMPARISON', exact: true }).click(); assert(await dialog.getByRole('button', { name: 'HIDE TEAM COMPARISON', exact: true }).isVisible(), 'Report Breakdown unavailable'); await dialog.getByRole('button', { name: 'CLOSE', exact: true }).first().click();
  await pace(p); const replay = await Promise.all([p.waitForResponse(r => r.url().endsWith('/api/game') && r.request().postDataJSON()?.op === 'play'), section.getByRole('button', { name: 'FRESH CASUAL REMATCH', exact: true }).click()]).then(([r]) => r);
  const next = await replay.json(); assert(replay.ok(), `Rematch failed: ${JSON.stringify(next)}`); assert(next.resultId !== data.resultId, 'Rematch reused result'); assert(next.result.candidate?.candidateId === 'Candidate 4' && next.result.candidate?.possessionCalibrationVersion === '1.4.0' && next.result.candidate?.coreHash === expectedCore, 'Fresh casual rematch candidate/calibration/core drift'); assert(next.result.loop.mode === 'any-five' && next.result.loop.tag === 'ANY_FIVE', 'Rematch made a governed source claim'); equal(next.result.goldIds, data.result.goldIds, 'Rematch Gold IDs changed'); equal(next.result.blueIds, data.result.blueIds, 'Rematch Blue IDs changed'); equal(next.result.coachIds, data.result.coachIds, 'Rematch coaches changed'); assert(next.result.eraId === data.result.eraId, 'Rematch era changed');
  await p.getByText('Fresh casual rematch · Any Five.', { exact: false }).waitFor();
  report.results.push({ resultId: next.resultId, mode: 'any-five', freshCasualFrom: mode, originalResultId: data.resultId, score: next.result.core.finalScore, goldIds: next.result.goldIds, blueIds: next.result.blueIds, eraId: next.result.eraId, coachIds: next.result.coachIds });
  return { savedResultId: data.resultId, savedMode: row.mode, rematchResultId: next.resultId, coaches: row.coachIds, eraId: row.eraId, candidateId: row.candidateId, calibration: row.calibration, coreHash: row.coreHash, snapshotIdentityVerified: true, freshRematchIdentityVerified: true, identity: 'All ten IDs preserved across original result, actual saved row, History report and fresh casual rematch' };
};
const authHeaders = id => ({ Authorization: `Bearer test-token.${id}` });
const modes = Object.keys(LOOP_CAREER_MODES).filter(mode => !only.length || only.includes(mode));
try {
  const guest = await newPage('guest', null, 390), owner = await newPage('Joseph', U1), other = await newPage('Bea', U2, 390), sameAccount = await newPage('Joseph second device', U1, 390);
  if (!smoke) for (const mode of modes) await check(`${mode} actual guest result and tagged board`, async () => { const data = await playMode(guest, mode); if (mode === 'daily') { const button = guest.getByRole('button', { name: 'Copy Daily grid', exact: true }); await button.waitFor(); await button.evaluate(async el => { while (el.disabled) await new Promise(resolve => setTimeout(resolve, 25)); }); await button.click(); } const board = await loop(guest, { op: 'leaderboard', tag: MODE_TAGS[mode] || mode.toUpperCase() }, { expected: mode === 'lab' ? 400 : 200 }); if (mode !== 'lab') assert(board.rows.some(r => r.resultId === data.resultId), 'Actual completed result absent from its mode board'); else assert(board.code === 'INVALID_TAG', 'Lab was not excluded'); return { resultId: data.resultId, mode, score: data.result.core.finalScore, boardTag: MODE_TAGS[mode] }; });
  const ownerResults = new Map();
  for (const mode of modes) await check(`${mode} account save → History → full report → Breakdown → fresh casual rematch`, async () => { const data = await playMode(owner, mode); ownerResults.set(mode, data); return saveHistoryRematch(owner, data, mode); });
  if (!smoke) {
    await check('Saved History survives a fresh browser context under the same account', async () => { await navigate(sameAccount, '/my-eraclash?tab=history'); for (const data of ownerResults.values()) await sameAccount.locator(`section[data-clash="${data.resultId}"]`).waitFor(); return { originalRows: ownerResults.size }; });
    await check('Another account cannot read the original owner’s saved row', async () => { await navigate(other, '/my-eraclash?tab=history'); const id = ownerResults.get('any-five')?.resultId || [...ownerResults.values()][0].resultId; assert(await savedView(other, id) === null, 'Other account received private saved row'); assert(await other.locator(`section[data-clash="${id}"]`).count() === 0, 'Owner row rendered to other account'); const req = await other.request.get(`${base}/__loop-qa/read?table=saved_clashes`, { headers: authHeaders(U2) }); const rows = await req.json(); assert(rows.every(r => r.user_id === U2), 'Bridge crossed account ownership'); return { forbiddenResultId: id, rowsVisibleToOther: rows.length }; });
    await check('Daily completed account cannot restart on a different device', async () => { if (!ownerResults.has('daily')) return { skipped: 'daily not selected' }; await navigate(sameAccount, '/clash/daily'); await loop(sameAccount, { op: 'daily-start' }, { userId: U1, expected: 409 }); return { status: 'Second-device same-account attempt refused by server' }; });
    let roomId;
    await check('Two accounts join one private room and own-result checks work across devices', async () => {
      await navigate(owner, '/clash/rooms'); const created = await Promise.all([owner.waitForResponse(r => r.url().endsWith('/api/game') && r.request().postDataJSON()?.op === 'room-create'), owner.getByRole('button', { name: 'Create a room', exact: true }).click()]).then(([r]) => r.json()); roomId = created.roomId; assert(roomId, 'Room missing');
      await navigate(other, `/clash/rooms?invite=${roomId}`); await other.getByRole('button', { name: 'Join invitation', exact: true }).click(); await other.getByRole('heading', { name: 'Your room · 2 members', exact: true }).waitFor();
      const id = ownerResults.get('any-five')?.resultId || [...ownerResults.values()][0].resultId;
      const same = await loop(sameAccount, { op: 'room-challenge', roomId, resultId: id }, { userId: U1 }); assert(same.room.entries.some(e => e.resultId === id), 'Same account on new device could not post owned result');
      await loop(other, { op: 'room-challenge', roomId, resultId: id }, { userId: U2, expected: 403 });
      await loop(guest, { op: 'room-read', roomId }, { expected: 403 });
      const second = await playMode(other, 'any-five'); await loop(other, { op: 'room-challenge', roomId, resultId: second.resultId }, { userId: U2 });
      const room = await loop(owner, { op: 'room-read', roomId }, { userId: U1 }); assert(room.room.memberCount === 2 && room.room.entries.length === 2, 'Room membership/results wrong'); assert(!JSON.stringify(room).includes('seed'), 'Private game seed leaked to room'); return { roomId, members: room.room.memberCount, ownResults: room.room.entries.map(e => e.resultId) };
    });
    await check('Room feed shares an actual governed Challenge created from a completed Chaos draft', async () => {
      assert(roomId, 'Room prerequisite failed');
      let data = await post(owner, '/api/game', { chaosAction: 'start', tier: 'FREE' }, { userId: U1 }); const chaosRunId = data.chaos?.chaosRunId; assert(chaosRunId, 'Real Chaos run missing');
      for (let roll = 0; roll < 2; roll++) data = await post(owner, '/api/game', { chaosAction: 'decide', chaosRunId, holdSlots: [], holdRoles: [] }, { userId: U1 });
      const coachId = data.chaos?.coachDraft?.offers?.[0]?.coachId; assert(coachId, 'Real coach offer missing'); await post(owner, '/api/game', { chaosAction: 'coach', chaosRunId, coachId }, { userId: U1 }); const simulated = await post(owner, '/api/game', { chaosAction: 'simulate', chaosRunId, simulationId: randomUUID().replaceAll('-', '').slice(0,20) }, { userId: U1 }); assert(simulated.resultId && simulated.result?.core?.finalScore, 'Actual governed Chaos result missing'); report.governedChallenges.push({ chaosResultId: simulated.resultId, score: simulated.result.core.finalScore });
      const created = await post(owner, '/api/profile', { action: 'challenge-create', chaosRunId }, { userId: U1 }); assert(created.code?.startsWith('EC-'), 'Actual governed Challenge missing');
      await navigate(owner, `/clash/rooms?invite=${roomId}`); await owner.getByRole('button', { name: 'Join invitation', exact: true }).click(); await owner.getByLabel('Governed Challenge code', { exact: true }).fill(created.code); await owner.getByRole('button', { name: 'Share my Challenge', exact: true }).click(); await owner.getByRole('link', { name: 'Play this governed Challenge', exact: true }).waitFor();
      await loop(other, { op: 'room-share-challenge', roomId, challengeCode: created.code }, { userId: U2, expected: 403 }); const read = await loop(other, { op: 'room-read', roomId }, { userId: U2 }); assert(read.room.feed.some(e => e.kind === 'governed-challenge' && e.path.includes(created.code)), 'Joined account cannot see governed feed'); return { code: created.code, feed: 'Actual Challenge, not fixture insertion; owned sharing enforced' };
    });
    await check('Public card → guest fresh five → new authoritative result captures sharing and rematch events', async () => {
      const original = ownerResults.get('any-five') || [...ownerResults.values()][0]; await navigate(owner, '/my-eraclash?tab=history');
      const published = await post(owner, '/api/result', { resultId: original.resultId, publicRecap: true }); const path = published.path || `/card/${published.id}`; assert(path.startsWith('/card/'), 'Card path absent');
      await navigate(guest, path); const rematch = guest.getByRole('link', { name: /Run it back/i }).first(); await rematch.click(); await guest.getByText('Run it back against the shared five:', { exact: false }).waitFor(); await chooseFive(guest, ['Steph', 'MJ', 'LeBron', 'Duncan', 'Shaq']); const data = await realPlay(guest, 'Run this five', 'play', 'any-five'); equal(data.result.blueIds, original.result.goldIds, 'Shared Gold did not become rematch Blue');
      const region = guest.getByRole('region', { name: 'Completed Clash', exact: true }); await region.getByRole('button', { name: 'Copy card link', exact: true }).waitFor(); await region.getByRole('button', { name: 'Copy card link', exact: true }).click(); return { originalResultId: original.resultId, newGuestResultId: data.resultId, originalCard: path };
    });
    await check('Fake email signup dialog completes and emits signup instrumentation (SMTP unverified)', async () => {
      const signup = await newPage('emulated signup', null, 1280); await navigate(signup, '/clash/any-five'); await signup.getByRole('button', { name: 'Create free account', exact: true }).click();
      const dialog = signup.locator('[data-account-dialog]'); await dialog.waitFor(); await signup.setViewportSize({ width: 390, height: 844 }); await dialog.getByLabel('Email address', { exact: true }).fill(statefulUsers[1].email); await dialog.getByRole('button', { name: 'CONTINUE WITH EMAIL', exact: true }).click(); await dialog.getByLabel('Sign-in code', { exact: true }).fill('123456'); await dialog.getByRole('button', { name: 'SIGN IN', exact: true }).click(); await dialog.waitFor({ state: 'hidden' }); assert(await signup.evaluate(async () => (await import('/src/accounts/accountState.js')).accountState().session?.userId) === U2, 'Fake signup did not adopt account'); return { status: 'PARTIAL EMULATED dialog and instrumentation only; no SMTP or OAuth delivery proof' };
    });
  }
  await check('Actual first-party event batches have HTTP receipts and the closed Loop vocabulary', async () => {
    for (const context of contexts) for (const p of context.pages()) { if (p.url().startsWith(base) && !p.url().includes('/card/')) await p.evaluate(async () => { const { flush } = await import('/src/analytics.js'); flush(); }); }
    await owner.waitForTimeout(1000); const events = report.eventBatches.flatMap(batch => batch.events).filter(e => LOOP_EVENTS.includes(e.event)); assert(events.length, 'No Loop events captured'); assert(report.eventBatches.every(batch => batch.status >= 200 && batch.status < 300), 'Actual events sink rejected a batch'); assert(events.some(e => e.event === 'game_completed'), 'No actual completion event');
    if (!smoke) for (const name of ['mode_started', 'guest_play_started', 'daily_attempted', 'card_created', 'card_shared', 'card_opened', 'rematch_started_from_card', 'signup_completed', 'daily_shared']) assert(events.some(e => e.event === name), `Missing actual ${name}`);
    return { closedNamesCaptured: [...new Set(events.map(e => e.event))], closedEvents: events.length, batches: report.eventBatches.length, receivedStatuses: [...new Set(report.eventBatches.map(b => b.status))], beaconsObserved: report.beacons.length, limits: 'Captured local synthetic actions; no real cohort retention claim' };
  });
} finally {
  for (const context of contexts) await context.close(); await browser.close(); report.endedAt = new Date().toISOString(); report.summary = { passed: report.checks.filter(c => c.status === 'PASS').length, failed: report.failures.length, consoleErrors: report.consoleErrors.length, actualLoopGames: report.results.length, governedChaosGames: report.governedChallenges.length, eventBatches: report.eventBatches.length };
  const directory = resolve('data/validation/loop-foundation/stateful', run); await mkdir(directory, { recursive: true }); await writeFile(resolve(directory, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report.summary)); if (report.failures.length || report.consoleErrors.length) process.exitCode = 1;
}
