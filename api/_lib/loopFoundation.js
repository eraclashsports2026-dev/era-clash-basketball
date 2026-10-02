// Loop Foundation 1.0.0: input and persistence adapters over the existing engine.
// No client score, seed, candidate identity or account id is authoritative.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getJSON, setJSON, setNX, cmd, newId, hasStore, rateLimit, clientIp } from './store.js';
import { validateTeamIds, validEraId, validSimId } from './validate.js';
import { computeResultPreview } from './previewEngine.js';
import { computeResultV3 } from './game-core-v3.js';
import { finalScoreOf, engineIdentity } from './resultContract.js';
import { buildDeterministicSummary, buildExpandedAnalysis } from './postgameStory.js';
import { verifyAccountToken } from './cloudAccounts.js';
import { getCoach } from '../../src/v3/coaches.js';
import { loadChallengeByCode } from './challenges.js';
import { publishOwnedRecap } from './loopShare.js';
import { startRun } from '../../src/chaos/runState.js';
import { hydrate, applyRollDecisions, applyCoach, simulationSetup, draftHistory, view } from './chaosRun.js';
import { dailyConfig, newYorkDay, dailySeed } from '../../src/loop/daily/calendar.js';
import { validateFive, legalFive, createSpinSlots, rerollSpinSlot, MODE_TAGS, GAUNTLET_ERAS } from '../../src/loop/draft/model.js';

export const LOOP_VERSION = '1.0.0';
const TTL = 180 * 86400;
const fail = (res, code, message, status = 400) => res.status(status).json({ code, message });
const stripPrivate = ({ session, seed, ...record }) => record;
const identityHash = owner => createHmac('sha256', 'loop-owner-namespace-v1').update(owner).digest('hex');
const key = (kind, id) => `loop:${kind}:${id}`;
const nowFor = () => process.env.ECLASH_TEST_MEMORY_STORE === '1' && process.env.LOOP_TEST_NOW ? new Date(process.env.LOOP_TEST_NOW).getTime() : Date.now();

async function signingKey() {
  if (process.env.LOOP_TOKEN_SECRET) return process.env.LOOP_TOKEN_SECRET;
  // One store-held secret shared by serverless instances, never delivered to a browser.
  const name = key('private', 'signing-key-v1');
  let secret = await getJSON(name);
  if (!secret) { await setNX(name, randomBytes(32).toString('hex'), TTL); secret = await getJSON(name); }
  if (!secret) throw new Error('Signing key unavailable');
  return secret;
}
async function tokenFor(kind, id, owner, expiresAt) {
  const payload = Buffer.from(JSON.stringify({ v: 1, kind, id, owner: identityHash(owner), expiresAt })).toString('base64url');
  return `${payload}.${createHmac('sha256', await signingKey()).update(payload).digest('base64url')}`;
}
async function readToken(token, kind, owner, now) {
  if (typeof token !== 'string' || token.length > 700) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  try {
    const expected = createHmac('sha256', await signingKey()).update(payload).digest();
    const got = Buffer.from(signature, 'base64url');
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
    const body = JSON.parse(Buffer.from(payload, 'base64url'));
    return body.v === 1 && body.kind === kind && body.owner === identityHash(owner) && body.expiresAt > now ? body : null;
  } catch { return null; }
}
const scoreboard = async tag => {
  const ids = await cmd('ZREVRANGE', key('board', tag), 0, 99);
  const rows = await Promise.all((Array.isArray(ids) ? ids : []).map(id => getJSON(key('entry', id))));
  return rows.filter(Boolean).map((r, i) => ({ ...r, rank: i + 1 }));
};
async function storeResult({ goldIds, blueIds, eraId, coachGoldId = 'neutral', coachBlueId = 'neutral', mode, tag, session, owner, accountOwned = false, seed, f, chaosDraft = null, extra = {} }) {
  const gold = validateTeamIds(goldIds), blue = validateTeamIds(blueIds);
  if (!gold || !blue || !validEraId(eraId) || (coachGoldId !== 'neutral' && !getCoach(coachGoldId)) || (coachBlueId !== 'neutral' && !getCoach(coachBlueId))) throw Object.assign(new Error('Invalid simulation inputs'), { code: 'INVALID_FIVE' });
  const options = { eraStyleId: eraId, coachGoldId, coachBlueId };
  const computed = f.previewSimEngine ? computeResultPreview('single', gold, blue, options, seed) : computeResultV3('single', gold, blue, options, seed);
  const id = `${computed.preview ? 'pv_' : ''}${newId(10)}`;
  const record = { v: 1, id, session, mode: 'single', goldIds, blueIds, ...computed, created_at: nowFor(), chaosDraft,
    loop: { version: LOOP_VERSION, mode, tag, ...extra }, core_result_status: 'complete', narrative_status: 'not_requested' };
  if (mode === 'gauntlet') {
    const score = finalScoreOf(record), won = score.gold > score.blue;
    record.loop.gauntlet = { victories: Number(extra.priorVictories || 0) + (won ? 1 : 0), totalEras: 7, stagesPlayed: extra.stage, finished: !won || extra.stage === 7 };
    delete record.loop.priorVictories;
  }
  record.story = buildDeterministicSummary({ record, quarterFlow: record.v3?.quarterFlow || [], moments: record.v3?.keyMoments || [], patterns: record.v3?.matchupPatterns || [] });
  record.expandedAnalysis = buildExpandedAnalysis({ record, quarterFlow: record.v3?.quarterFlow || [], moments: record.v3?.keyMoments || [], patterns: record.v3?.matchupPatterns || [], coaching: record.v3?.coaching, eraId });
  const persisted = await setJSON(`${computed.preview ? 'preview-result' : 'result'}:${id}`, record, TTL);
  if (persisted !== 'OK') throw Object.assign(new Error('Result storage unavailable; attempt preserved'), { code: 'KV_UNAVAILABLE' });
  if (owner) await setJSON(key('result-owner', id), { hash: identityHash(owner), account: accountOwned }, TTL);
  const score = finalScoreOf(record);
  if (tag !== 'LAB' && (tag !== 'GAUNTLET' || record.loop.gauntlet?.finished)) {
    await setJSON(key('entry', id), { resultId: id, tag, gold: score.gold, blue: score.blue, margin: score.gold - score.blue, ...(record.loop.gauntlet ? { gauntlet: record.loop.gauntlet } : {}), ...engineIdentity(record), createdAt: record.created_at }, TTL);
    await cmd('ZADD', key('board', tag), tag === 'GAUNTLET' ? record.loop.gauntlet.victories * 100000 + score.gold - score.blue : score.gold - score.blue, id);
    await cmd('EXPIRE', key('board', tag), TTL);
  }
  return { resultId: id, result: stripPrivate(record), records: { persisted: true } };
}

/** Called inside /api/game after its origin, size and session guards. */
export async function loopHandler(req, res, { session, f }) {
  if (process.env.LOOP_FOUNDATION_ENABLED === 'false') return fail(res, 'FEATURE_DISABLED', 'Loop modes are disabled.', 503);
  if (!hasStore()) return fail(res, 'KV_UNAVAILABLE', 'A persistent game store is required.', 503);
  if (!await rateLimit(key('limit', clientIp(req)), 120, 60)) return fail(res, 'RATE_LIMITED', 'Please wait before trying again.', 429);
  const body = req.body || {}, op = String(body.op || ''), now = nowFor();
  const bearer = String(req.headers.authorization || '').replace(/^Bearer /i, '');
  const account = bearer ? await verifyAccountToken(bearer) : null;
  if (bearer && !account) return fail(res, 'UNAUTHORIZED', 'Sign in again to resume your account run.', 401);
  const owner = account ? `account:${account.userId}` : `guest:${session}`;
  if (['play', 'daily-play', 'gauntlet-play'].includes(op)) {
    const requestId = validSimId(body.simulationId);
    if (!requestId) return fail(res, 'INVALID_REQUEST_ID', 'A retry-safe request id is required.');
    const idemKey = key('idempotency', `${identityHash(owner)}:${op}:${requestId}`);
    const replay = await getJSON(idemKey);
    if (replay) return res.status(200).json(replay);
    const lockKey = `${idemKey}:busy`;
    if (!await setNX(lockKey, true, 120)) return fail(res, 'REQUEST_IN_PROGRESS', 'This request is already running; retry with the same request id.', 409);
    const target = res;
    let status = 200;
    res = { status(code) { status = code; return this; }, async json(value) {
      if (status === 200) await setJSON(idemKey, value, 86400);
      await cmd('DEL', lockKey);
      return target.status(status).json(value);
    } };
  }
  try {
    if (op === 'config') return res.status(200).json({ version: LOOP_VERSION, ...dailyConfig(now), boards: Object.values(MODE_TAGS).filter(t => t !== 'LAB') });
    if (op === 'leaderboard') {
      const tag = String(body.tag || 'DAILY');
      if (![...Object.values(MODE_TAGS), 'FRANCHISE', 'TONIGHT'].includes(tag) || tag === 'LAB') return fail(res, 'INVALID_TAG', 'Choose a ranked mode.');
      return res.status(200).json({ tag, rows: await scoreboard(tag) });
    }
    if (op === 'daily-start') {
      const cfg = dailyConfig(now), claim = key('daily-claim', `${cfg.day}:${identityHash(owner)}`);
      if (await getJSON(claim)) return fail(res, 'DAILY_ATTEMPT_USED', 'Your Daily is already complete.', 409);
      const id = `${cfg.day}:${identityHash(owner)}`;
      let run = await getJSON(key('daily-run', id));
      if (!run) {
        run = startRun({ runId: newId(12), seedId: `loop-daily:${cfg.version}:${cfg.day}`, createdAt: now, competitiveEraLock: true });
        run.session = session;
        await setNX(key('daily-run', id), run, 3 * 86400);
        run = await getJSON(key('daily-run', id));
      }
      return res.status(200).json({ dailyToken: await tokenFor('daily', id, owner, Date.parse(cfg.nextResetAt)), config: cfg, state: view(run), streak: await getJSON(key('streak', identityHash(owner))) || { count: 0 } });
    }
    if (op === 'daily-roll' || op === 'daily-coach' || op === 'daily-play') {
      const token = await readToken(body.dailyToken, 'daily', owner, now);
      if (!token || !token.id.startsWith(newYorkDay(now))) return fail(res, 'DAILY_EXPIRED', 'Start today’s Daily again.', 409);
      const run = await getJSON(key('daily-run', token.id));
      if (!run) return fail(res, 'DAILY_EXPIRED', 'The draft expired.', 409);
      if (op === 'daily-roll' || op === 'daily-coach') {
        // The established Chaos functions own holds, burns, coach rolls and reveal.
        const out = op === 'daily-roll' && !body.coachId ? await applyRollDecisions(run, { holdSlots: body.holds || body.holdSlots || [], holdRoles: body.holdRoles || [] }) : await applyCoach(run, body.coachId);
        if (!out.ok) return fail(res, out.code || 'INVALID_DECISION', 'That draft decision is unavailable.');
        await setJSON(key('daily-run', token.id), run, 3 * 86400);
        return res.status(200).json({ state: view(run), dailyToken: body.dailyToken });
      }
      const claimKey = key('daily-claim', token.id);
      const existing = await getJSON(claimKey);
      if (existing) return fail(res, 'DAILY_ATTEMPT_USED', 'Your Daily is already complete.', 409);
      if (run.currentPhase !== 'READY') return fail(res, 'DRAFT_NOT_READY', 'Finish the three rolls and choose a coach first.');
      if (!await setNX(claimKey, { busy: true }, 3 * 86400)) return fail(res, 'DAILY_ATTEMPT_USED', 'Your Daily is already complete.', 409);
      try {
        const setup = simulationSetup(run);
        const out = await storeResult({ ...setup, eraId: setup.eraStyleId, mode: 'daily', tag: 'DAILY', session, owner, accountOwned: !!account, seed: dailySeed(newYorkDay(now)), f, chaosDraft: draftHistory(run), extra: { day: newYorkDay(now) } });
        await setJSON(claimKey, { resultId: out.resultId }, 40 * 86400);
        const previous = await getJSON(key('streak', identityHash(owner)));
        // Calendar subtraction, rather than elapsed hours, survives both DST transitions.
        const today = newYorkDay(now);
        const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
        const streak = { day: newYorkDay(now), count: previous?.day === yesterday ? previous.count + 1 : 1, account: !!account };
        await setJSON(key('streak', identityHash(owner)), streak, TTL);
        const sampleKey = key('daily-sample', newYorkDay(now));
        await cmd('HINCRBY', sampleKey, 'total', 1);
        await cmd('HINCRBY', sampleKey, 'wins', finalScoreOf(out.result).gold > finalScoreOf(out.result).blue ? 1 : 0);
        const counts = await cmd('HGETALL', sampleKey);
        const sample = Array.isArray(counts) ? Object.fromEntries(Array.from({ length: counts.length / 2 }, (_, i) => [counts[i * 2], Number(counts[i * 2 + 1])])) : counts || {};
        return res.status(200).json({ ...out, streak, daily: { day: newYorkDay(now), sample: Number(sample.total || 0), winPercent: Number(sample.total) >= 20 ? Math.round(100 * Number(sample.wins || 0) / Number(sample.total)) : null } });
      } catch (error) { await cmd('DEL', claimKey); throw error; }
    }
    if (op === 'spin-start') {
      const id = newId(14), seed = newId(16), slots = createSpinSlots(seed);
      const state = { slots, seed, franchiseSkips: 1, eraSkips: 1, owner: identityHash(owner) };
      await setJSON(key('spin', id), state, 86400);
      return res.status(200).json({ spinReceipt: await tokenFor('spin', id, owner, now + 86400000), slots, franchiseSkips: 1, eraSkips: 1 });
    }
    if (op === 'spin-skip') {
      const token = await readToken(body.spinReceipt, 'spin', owner, now);
      if (!token || !['franchise', 'era'].includes(body.axis) || !Number.isInteger(body.index) || body.index < 0 || body.index > 4) return fail(res, 'INVALID_SPIN', 'Start a new spin.');
      const stateLock = key('spin-busy', token.id);
      if (!await setNX(stateLock, true, 30)) return fail(res, 'SPIN_BUSY', 'Another skip is saving. Try again.', 409);
      try {
      const state = await getJSON(key('spin', token.id));
      if (!state) return fail(res, 'INVALID_SPIN', 'Start a new spin.');
      const field = body.axis === 'franchise' ? 'franchiseSkips' : 'eraSkips';
      const lockKey = key('spin-skip', `${token.id}:${body.axis}`);
      if (!state[field] || !await setNX(lockKey, true, 86400)) return fail(res, 'SPIN_SKIP_USED', 'That skip has already been used.', 409);
      try { state.slots = rerollSpinSlot(state.slots, body.index, body.axis, `${state.seed}:${body.axis}`); state[field]--; await setJSON(key('spin', token.id), state, 86400); }
      catch (error) { await cmd('DEL', lockKey); throw error; }
      return res.status(200).json({ spinReceipt: body.spinReceipt, slots: state.slots, franchiseSkips: state.franchiseSkips, eraSkips: state.eraSkips });
      } finally { await cmd('DEL', stateLock); }
    }
    if (op === 'gauntlet-start') {
      const resumeKey = key('gauntlet-owner', identityHash(owner));
      const resumeToken = body.gauntletToken ? await readToken(body.gauntletToken, 'gauntlet', owner, now) : null;
      if (body.gauntletToken && !resumeToken) return fail(res, 'INVALID_GAUNTLET', 'This resume token does not belong to you.', 403);
      let id = resumeToken?.id || (account && body.resume ? await getJSON(resumeKey) : null), state = id && await getJSON(key('gauntlet', id));
      if (!state || state.done) {
        const ids = validateFive(body.goldIds, { kind: 'gauntlet', allowOutOfPosition: false });
        if (!ids.ok) return fail(res, 'INVALID_FIVE', ids.error);
        id = newId(14); state = { goldIds: ids.ids, stage: 0, eraIds: GAUNTLET_ERAS, victories: 0, done: false, results: [], seed: newId(16) };
        await setJSON(key('gauntlet', id), state, TTL); if (account) await setJSON(resumeKey, id, TTL);
      }
      return res.status(200).json({ gauntletToken: await tokenFor('gauntlet', id, owner, now + TTL * 1000), ...gauntletView(state) });
    }
    if (op === 'gauntlet-play') {
      const token = await readToken(body.gauntletToken, 'gauntlet', owner, now), state = token && await getJSON(key('gauntlet', token.id));
      if (!state) return fail(res, 'INVALID_GAUNTLET', 'Start or resume your Gauntlet.');
      if (state.done) return fail(res, 'GAUNTLET_FINISHED', 'This run is finished.', 409);
      if (body.stage != null && body.stage !== state.stage) return fail(res, 'STAGE_CHANGED', 'This stage already completed. Resume to see the current stage.', 409);
      const lockKey = key('gauntlet-stage', `${token.id}:${state.stage}`);
      if (!await setNX(lockKey, true, 60)) return fail(res, 'STAGE_IN_PROGRESS', 'This stage is already running.', 409);
      try {
        const eraId = state.eraIds[state.stage], blueIds = legalFive({ seed: `${state.seed}:${state.stage}`, era: eraId });
        const out = await storeResult({ goldIds: state.goldIds, blueIds, eraId, mode: 'gauntlet', tag: 'GAUNTLET', session, owner, accountOwned: !!account, seed: parseInt(newId(8), 36) >>> 0, f, extra: { stage: state.stage + 1, priorVictories: state.victories } });
        const score = finalScoreOf(out.result), won = score.gold > score.blue;
        state.results.push(out.resultId); state.stage++; if (won) state.victories++; state.done = !won || state.stage === state.eraIds.length;
        await setJSON(key('gauntlet', token.id), state, TTL);
        return res.status(200).json({ ...out, gauntlet: gauntletView(state), gauntletToken: body.gauntletToken });
      } finally { await cmd('DEL', lockKey); }
    }
    if (op.startsWith('room-')) return roomOperation(op, body, res, { owner, account, session, now });
    if (op === 'play') {
      const mode = String(body.mode || 'any-five');
      if (![...Object.keys(MODE_TAGS), 'franchise', 'tonight'].includes(mode) || ['daily', 'gauntlet'].includes(mode)) return fail(res, 'INVALID_MODE', 'Use this mode’s governed play action.');
      let slots;
      if (mode === 'spin') { const t = await readToken(body.spinReceipt, 'spin', owner, now); slots = t && (await getJSON(key('spin', t.id)))?.slots; if (!slots) return fail(res, 'INVALID_SPIN', 'Start an official spin first.'); }
      const validation = validateFive(body.goldIds, { kind: ['franchise', 'tonight'].includes(mode) ? 'any-five' : mode, franchise: body.franchise, slots, allowOutOfPosition: false });
      if (!validation.ok) return fail(res, 'INVALID_FIVE', validation.error);
      const cfg = dailyConfig(now);
      const seed = randomBytes(4).readUInt32LE();
      const scenario = mode === 'lab' ? { playerId: validation.ids.includes(body.scenario?.playerId) ? body.scenario.playerId : null, teamLabel: String(body.scenario?.teamLabel || '').replace(/[<>\x00-\x1f]/g, '').slice(0, 80), eraId: body.eraId || cfg.eraId, exploration: true } : undefined;
      const out = await storeResult({ goldIds: validation.ids, blueIds: body.blueIds || cfg.opponentIds, eraId: body.eraId || cfg.eraId, coachGoldId: body.coachGoldId || 'neutral', coachBlueId: body.coachBlueId || 'neutral', mode, tag: MODE_TAGS[mode] || mode.toUpperCase(), session, owner, accountOwned: !!account, seed, f, extra: { hiddenStats: mode === 'spin' && !!body.hiddenStats, outOfPosition: validation.outOfPosition, ...(scenario ? { scenario } : {}), boardType: 'casual-sandbox-margin' } });
      return res.status(200).json(out);
    }
    return fail(res, 'INVALID_OPERATION', 'Unknown Loop action.');
  } catch (error) { return fail(res, error.code || 'LOOP_ERROR', error.code ? error.message : 'The server could not complete this action. Your draft is preserved.', error.code === 'KV_UNAVAILABLE' ? 503 : 400); }
}
function gauntletView(state) { return { stage: state.stage, eraIds: state.eraIds, goldIds: state.goldIds, victories: state.victories, done: state.done, won: state.victories === 7, results: state.results }; }
async function roomOperation(op, body, res, { owner, account, session, now }) {
  if (op === 'room-create') {
    const id = newId(16), room = { id, createdAt: now, members: [identityHash(owner)], entries: [], feed: [], notificationsEnabled: false };
    if (await setJSON(key('room', id), room, TTL) !== 'OK') return fail(res, 'KV_UNAVAILABLE', 'Room storage is unavailable.', 503);
    return res.status(200).json({ roomId: id, invitePath: `/clash/rooms?invite=${id}`, room: publicRoom(room) });
  }
  const id = String(body.roomId || '');
  if (!/^[a-z0-9]{16}$/.test(id)) return fail(res, 'ROOM_UNAVAILABLE', 'This room is unavailable.', 404);
  if (!['room-join', 'room-read', 'room-challenge', 'room-share-challenge'].includes(op)) return fail(res, 'INVALID_OPERATION', 'Unknown room action.');
  const mutation = ['room-join', 'room-challenge', 'room-share-challenge'].includes(op);
  const mutationKey = key('room-busy', id);
  if (mutation && !await setNX(mutationKey, true, 30)) return fail(res, 'ROOM_BUSY', 'Another room update is saving. Try again.', 409);
  try {
  const room = await getJSON(key('room', id));
  if (!room) return fail(res, 'ROOM_UNAVAILABLE', 'This room is unavailable.', 404);
  const member = identityHash(owner);
  if (op === 'room-join') { if (!room.members.includes(member)) room.members.push(member); await setJSON(key('room', id), room, TTL); return res.status(200).json({ roomId: id, room: publicRoom(room) }); }
  if (!room.members.includes(member)) return fail(res, 'ROOM_UNAVAILABLE', 'Use the invitation to join this private room.', 403);
  if (op === 'room-share-challenge') {
    if (!account) return fail(res, 'ACCOUNT_REQUIRED', 'Sign in to share an owned governed Challenge. Guest room play is still available.', 403);
    const challenge = await loadChallengeByCode(body.challengeCode);
    if (!challenge || challenge.creator_user_id !== account.userId || challenge.status !== 'open' || Date.parse(challenge.expires_at) <= now) return fail(res, 'CHALLENGE_UNAVAILABLE', 'Share a live Challenge created by your own account.', 403);
    const path = `/?challenge=${encodeURIComponent(challenge.public_code)}`;
    if (!room.feed.some(e=>e.path===path)) { room.feed.push({ kind:'governed-challenge', path, createdAt:now }); await setJSON(key('room',id),room,TTL); }
  }
  if (op === 'room-challenge') {
    const rid = String(body.resultId || ''), record = /^(pv_)?[a-z0-9]{6,16}$/.test(rid) ? await getJSON(`${rid.startsWith('pv_') ? 'preview-result' : 'result'}:${rid}`) : null;
    const owned = record && await getJSON(key('result-owner', rid));
    if (!record || (owned?.account ? owned.hash !== identityHash(owner) : record.session !== session)) return fail(res, 'NOT_YOUR_RESULT', 'Only your own completed result can enter a room.', 403);
    const score = finalScoreOf(record);
    if (!room.entries.some(e => e.resultId === rid)) {
      const card = await publishOwnedRecap({ resultId:rid, session:record.session, consent:true });
      room.entries.push({ resultId: rid, score, margin: score.gold - score.blue, path:card.path || null, createdAt: now });
      room.feed.push({ kind: 'completed-result', resultId: rid, path:card.path || null, createdAt: now }); await setJSON(key('room', id), room, TTL);
    }
  }
  return res.status(200).json({ roomId: id, room: publicRoom(room) });
  } finally { if (mutation) await cmd('DEL', mutationKey); }
}
const publicRoom = room => ({ id: room.id, createdAt: room.createdAt, memberCount: room.members.length, entries: [...room.entries].sort((a, b) => b.margin - a.margin), feed: room.feed, notificationsEnabled: false });
export async function roomNotificationHook({ roomId, resultId }, sender) {
  // Sender injection is deliberate: this release never enables or sends email.
  if (process.env.ROOM_EMAIL_NOTIFICATIONS_ENABLED !== 'true' || process.env.SMTP_VERIFIED !== 'true' || typeof sender !== 'function') return { status: 'disabled' };
  return sender({ roomId, resultId });
}
