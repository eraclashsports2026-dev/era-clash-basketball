import { afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ session: null }));
vi.mock('../src/accounts/accountState.js', () => ({ accountState: () => state, accessToken: () => state.session?.accessToken || null }));
import { loopApi } from '../src/loop/client.js';
const response = data => ({ ok: true, status: 200, json: async () => data });
afterEach(() => { vi.unstubAllGlobals(); state.session = null; });
describe('Loop authoritative API transport', () => {
  it('posts input only to the existing game endpoint with guest cookies', async () => {
    const fetch = vi.fn(async () => response({ resultId: 'verified-test' })); vi.stubGlobal('fetch', fetch);
    const out = await loopApi({ op: 'play', mode: 'any-five', goldIds: ['a', 'b', 'c', 'd', 'e'], simulationId: 'unit-input-only' });
    expect(out.resultId).toBe('verified-test'); const [url, request] = fetch.mock.calls[0];
    expect(url).toBe('/api/game'); expect(request.credentials).toBe('same-origin'); expect(JSON.parse(request.body)).toMatchObject({ action: 'loop', mode: 'any-five', op: 'play' });
    expect(JSON.parse(request.body)).not.toHaveProperty('score'); expect(request.headers).not.toHaveProperty('Authorization');
  });
  it('attaches the current verified provider token for account ownership', async () => { state.session = { userId: 'test-user', accessToken: 'unit-test-token-only' }; const fetch = vi.fn(async () => response({ config: {} })); vi.stubGlobal('fetch', fetch); await loopApi({ op: 'config', simulationId: 'unit-auth' }); expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer unit-test-token-only'); expect(JSON.parse(fetch.mock.calls[0][1].body)).not.toHaveProperty('accountId'); });
  it('deduplicates double taps while the same operation is in flight', async () => { let resolve; const fetch = vi.fn(() => new Promise(done => { resolve = done; })); vi.stubGlobal('fetch', fetch); const body = { op: 'play', mode: 'lab', simulationId: 'unit-dedup' }; const a = loopApi(body), b = loopApi(body); expect(fetch).toHaveBeenCalledTimes(1); resolve(response({ resultId: 'one-result' })); expect(await a).toEqual(await b); });
  it('reuses the attempt identity after a lost response and makes a new one after success', async () => { const sent = []; let calls = 0; vi.stubGlobal('fetch', async (_url, request) => { sent.push(JSON.parse(request.body).simulationId); if (++calls === 1) throw new Error('connection interrupted'); return response({ resultId: 'recovered-result' }); }); const body = { op: 'play', mode: 'any-five', goldIds: ['unit-lost-response'] }; await expect(loopApi(body)).rejects.toMatchObject({ code: 'NETWORK_ERROR' }); await loopApi(body); await loopApi(body); expect(sent[0]).toBe(sent[1]); expect(sent[2]).not.toBe(sent[1]); });
  it('does not deduplicate or share a pending account request across sign out', async () => { let resolve; vi.stubGlobal('fetch', vi.fn(() => new Promise(done => { resolve = done; }))); state.session = { userId: 'test-owner', accessToken: 'unit-owner-token' }; const a = loopApi({ op: 'config', simulationId: 'scope-owner' }); const resolveA = resolve; state.session = null; const b = loopApi({ op: 'config', simulationId: 'scope-owner' }); expect(fetch).toHaveBeenCalledTimes(2); resolveA(response({ private: 'owner-only' })); resolve(response({ private: null })); expect((await a).private).toBe('owner-only'); expect((await b).private).toBe(null); });
  it('shows the New York Daily limit and preserves the error code', async () => { vi.stubGlobal('fetch', async () => ({ ok: false, status: 409, json: async () => ({ code: 'DAILY_ATTEMPT_USED' }) })); await expect(loopApi({ op: 'daily-play', dailyToken: 'unit-token' })).rejects.toMatchObject({ code: 'DAILY_ATTEMPT_USED', message: expect.stringContaining('midnight in New York') }); });
  it('refuses unreadable API responses', async () => { vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => { throw new Error('bad-json'); } })); await expect(loopApi({ op: 'config', simulationId: 'unit-bad-json' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' }); });
});
