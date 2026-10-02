import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loopHandler } from '../api/_lib/loopFoundation.js';
import { _memReset, getJSON } from '../api/_lib/store.js';
import { buildSavedClash } from '../api/_lib/cloudAccounts.js';
import { finalScoreOf } from '../api/_lib/resultContract.js';
import { legalFive } from '../src/loop/draft/model.js';
import { LOOP_CAREER_MODES, loopCareerMode, loopModeFromCareer } from '../src/loop/careerMode.js';
import { runItBackSetup, replayCapability, modeName, HISTORY_FILTERS } from '../src/accounts/careerV2.js';
import { listProjection } from '../src/accounts/savedReport.js';
const response = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; }, setHeader() {} });
async function play(body = {}) {
  const res = response(); await loopHandler({ body: { op: 'play', mode: 'any-five', goldIds: legalFive({ seed: 'career-real-five' }), simulationId: randomUUID(), ...body }, headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res, { session: 'career-device', f: { previewSimEngine: true } });
  expect(res.code).toBe(200); return getJSON(`preview-result:${res.body.resultId}`);
}
beforeEach(() => { process.env.ECLASH_TEST_MEMORY_STORE = '1'; process.env.NODE_ENV = 'test'; _memReset(); });
const priorEnv = { memory: process.env.ECLASH_TEST_MEMORY_STORE, node: process.env.NODE_ENV };
afterEach(() => { for (const [key, value] of [['ECLASH_TEST_MEMORY_STORE', priorEnv.memory], ['NODE_ENV', priorEnv.node]]) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
describe('saved Loop career identities and explicit fresh casual rematches', () => {
  it.each(Object.entries(LOOP_CAREER_MODES))('preserves %s in the lightweight History projection as %s', async (mode, careerKey) => {
    // The score/rosters/candidate come from a REAL handler result. This unit
    // varies only its closed source-mode metadata to exercise all projections;
    // browser Run2 separately produces actual governed Daily/Spin/Gauntlet.
    const record = await play(); record.loop.mode = mode;
    if (mode === 'daily') record.chaosDraft = { rolls: [] };
    const row = buildSavedClash({ record, userId: '11111111-1111-4111-8111-111111111111', claimedFrom: 'signed_in' });
    expect(row.mode).toBe(careerKey); expect(row.result_snapshot.loop.mode).toBe(mode);
    const list = listProjection(row); expect(list.result_snapshot).toBeUndefined();
    expect(loopModeFromCareer(list)).toBe(mode); expect(modeName(list.mode)).not.toBe('Dream Matchup'); expect(modeName(list.mode)).not.toBe('Chaos Clash');
    expect(HISTORY_FILTERS.mode).toContain(careerKey);
    expect(careerKey).toMatch(/^[a-z0-9_]{1,20}$/);
    expect([row.gold_score, row.blue_score]).toEqual([finalScoreOf(record).gold, finalScoreOf(record).blue]);
    expect(row.gold_roster.map(p => p.id)).toEqual(record.goldIds);
    expect(row.calibration_version).toBe('1.4.0'); expect(row.candidate_core_hash).toMatch(/^55bb26a2/);
    expect(row.result_snapshot.session).toBeUndefined();
    const setup = runItBackSetup(list);
    expect(setup).toMatchObject({ tag: 'any-five', loopMode: mode, freshCasual: true, goldIds: record.goldIds, blueIds: record.blueIds, eraStyleId: record.eraId });
    expect(replayCapability(list).freshCasual).toBe(true); expect(replayCapability(list).exact.available).toBe(false);
  });
  it('a fresh casual rematch preserves exact teams, era and coaches and gets a new server seed', async () => {
    const original = await play({ eraId: '1980s', coachGoldId: 'red-auerbach', coachBlueId: 'billy-cunningham' });
    const setup = runItBackSetup(listProjection(buildSavedClash({ record: original, userId: 'owner', claimedFrom: 'signed_in' })));
    const next = await play({ goldIds: setup.goldIds, blueIds: setup.blueIds, eraId: setup.eraStyleId, coachGoldId: setup.coachGoldId, coachBlueId: setup.coachBlueId });
    expect(next.id).not.toBe(original.id); expect(next.seed).not.toBe(original.seed);
    expect(next.goldIds).toEqual(original.goldIds); expect(next.blueIds).toEqual(original.blueIds); expect(next.coachIds).toEqual(original.coachIds); expect(next.eraId).toBe(original.eraId);
    expect(next.loop).toMatchObject({ mode: 'any-five', tag: 'ANY_FIVE', boardType: 'casual-sandbox-margin' });
  });
  it('keeps unknown metadata outside the closed mode projection', () => { for (const mode of ['salary-cap', 'constructor', '__proto__', 'toString']) expect(loopCareerMode({ loop: { mode } })).toBe(null); });
  it('existing SQL accepts text mode and owner-only reads without requiring a schema change', () => { const sql = readFileSync('supabase/migrations/0001_accounts.sql', 'utf8'); expect(sql).toMatch(/mode\s+text not null/); expect(sql).toContain('saved_clashes_select_own'); expect(sql).not.toMatch(/constraint saved_clashes_mode\b/); });
});
