import { describe, expect, it } from 'vitest';
import { PLAYERS, POSITIONS } from '../src/players.js';
import { assignFive, BY_ID, canonicalPerson, createSpinSlots, ERAS, filterPool, GAUNTLET_ERAS, legalFive, rerollSpinSlot, searchPlayers, validateFive } from '../src/loop/draft/model.js';
import { dailyConfig, dailySeed, dailySeedId, newYorkDay, nextNewYorkMidnight } from '../src/loop/daily/calendar.js';
import { startRun, revealEra } from '../src/chaos/runState.js';
import { FRANCHISES, getFranchise } from '../src/loop/franchises.js';

const typedFives = [
  ['Steph', 'MJ', 'LeBron', 'Duncan', 'Shaq'],
  ['Stephen Curry', 'Michael Jordan', 'LeBron James', 'Tim Duncan', "Shaquille O'Neal"],
  ['Stephn Curry', 'Micheal Jordan', 'Lebron Jmaes', 'Tim Duncn', 'Shaquille Oneal'],
  ['Magic', 'Kobe', 'Bird', 'KG', 'Kareem'],
  ['Magic Johnson', 'Kobe Brynt', 'Larry Brd', 'Kevin Garnet', 'Kareem Abdul Jabar'],
  ['CP3', 'AI', 'KD', 'Giannis', 'Jokic'],
  ['Chris Paul', 'Allen Iverson', 'Kevin Durant', 'Giannis Antetokounmpo', 'Nikola Jokic'],
  ['Luka', 'Air Jordan', 'Dr J', 'Charles Barkley', 'Hakeem'],
  ['Luka Doncic', 'Michael Jordon', 'Julius Erving', 'Charles Barkley', 'Hakeem Olajuwon'],
  ['John Stockton', 'Dwyane Wade', 'Scottie Pippen', 'Dirk Nowitzki', 'David Robinson'],
  ['John Stocktn', 'Dwyane Wde', 'Scottie Pipen', 'Dirk Nowitzki', 'David Robison'],
  ['Big O', 'Jerry West', 'Elgin Baylor', 'Bob Pettit', 'Bill Russell'],
  ['Oscar Robertson', 'Jerry West', 'Elgin Baylor', 'Bob Pettit', 'Bill Rusell'],
  ['Tiny', 'Ray Allen', 'Carmelo Anthony', 'Kevin McHale', 'Wilt'],
  ['Nate Archibald', 'Ray Allen', 'Carmelo Antony', 'Kevin McHale', 'Wilt Chamberlin'],
  ['Isiah Thomas', 'Vince Carter', 'Paul Pierce', 'Chris Bosh', 'Patrick Ewing'],
  ['Isaiah? Thomas', 'Vince Carter', 'Paul Pierce', 'Chris Bosh', 'Patrick Ewing'],
  ['Damian Lillard', 'James Harden', 'Kawhi Leonard', 'Anthony Davis', 'Joel Embiid'],
  ['Damian Lilard', 'James Harden', 'Kawhi Lenard', 'Anthony Davis', 'Joel Embid'],
  ['Jason Kidd', 'Tracy McGrady', 'Grant Hill', 'Dennis Rodman', 'Moses Malone'],
];
describe('Loop Any Five identity and explicit resolution', () => {
  it.each(typedFives.map((queries, i) => [i + 1, queries]))('resolves scripted five %i without fabricating a player', (_number, queries) => {
    const ids = queries.map(query => { const choices = searchPlayers(query); expect(choices.length, query).toBeGreaterThan(0); return choices[0].id; });
    expect(validateFive(ids).ok).toBe(true);
    expect(ids.every(id => BY_ID.has(id))).toBe(true);
  });
  it('shows multiple decade cards for aliases instead of silently choosing an era', () => {
    const cards = searchPlayers('LeBron'); expect(cards.length).toBeGreaterThan(1);
    expect(new Set(cards.map(p => p.name)).size).toBe(1);
    expect(searchPlayers('LeBron', { era: '2010s' }).every(p => p.decade === '2010s')).toBe(true);
  });
  it('keeps genuinely ambiguous surnames explicit', () => { expect(new Set(searchPlayers('Johnson', { limit: 40 }).map(p => p.name)).size).toBeGreaterThan(1); });
  it('rejects two decade cards of one person', () => { const cards = searchPlayers('LeBron'); const ids = legalFive({ seed: 'duplicate-check' }); ids[0] = cards[0].id; ids[1] = cards[1].id; expect(validateFive(ids).ok).toBe(false); });
  it('refuses an unsupported five of centers before simulation instead of forging eligibility', () => { const ids = ['wilt-60s', 'bill-60s', 'shaq-90s', 'kareem-70s', 'jokic-20s']; expect(assignFive(ids)).toBe(null); expect(validateFive(ids).ok).toBe(false); expect(validateFive(ids, { kind: 'gauntlet' }).ok).toBe(false); });
  it('reorders eligible positions without replacing selected people', () => { const ids = ['shaq-90s', 'duncan-00s', 'lebron-10s', 'jordan-90s', 'curry-10s']; const assigned = assignFive(ids); expect(assigned).not.toBe(null); expect([...assigned].sort()).toEqual([...ids].sort()); expect(assigned.every((id, i) => BY_ID.get(id).positions.includes(POSITIONS[i]))).toBe(true); });
  it('rejects malformed or unsupported identities', () => { for (const ids of [null, [], Array(5).fill('made-up'), ['curry-10s']]) expect(validateFive(ids).ok).toBe(false); });
});
describe('constraint filters are selections, not fabricated capability or price', () => {
  it('excludes every decade version of every MVP person', () => { const excluded = new Set(PLAYERS.filter(p => p.mvp > 0).map(p => canonicalPerson(p.id))); expect(filterPool({ kind: 'no-mvps' }).every(p => !excluded.has(canonicalPerson(p.id)))).toBe(true); });
  it('validates One Franchise by its documented canonical pool', () => { const ids = legalFive({ kind: 'one-franchise', franchise: 'la-lakers', seed: 'lakers' }); expect(validateFive(ids, { kind: 'one-franchise', franchise: 'la-lakers' }).ok).toBe(true); expect(validateFive(ids, { kind: 'one-franchise', franchise: 'boston' }).ok).toBe(false); });
  it('separates Charlotte from New Orleans despite their shared historical Hornets label', () => { expect(filterPool({ kind: 'one-franchise', franchise: 'charlotte' }).map(p => p.id)).not.toContain('cp3-00s'); expect(filterPool({ kind: 'one-franchise', franchise: 'new-orleans' }).map(p => p.id)).toContain('cp3-00s'); expect(filterPool({ kind: 'one-franchise', franchise: 'Hornets' })).toEqual([]); });
  it.each(FRANCHISES.map(f => [f.id]))('can fill all five positions from canonical franchise %s', franchise => { const ids = legalFive({ kind: 'one-franchise', franchise, seed: 'canonical-pool' }); expect(ids).toHaveLength(5); expect(validateFive(ids, { kind: 'one-franchise', franchise }).ok).toBe(true); });
  it('makes five distinct decades for One Per Era', () => { const ids = legalFive({ kind: 'one-per-era', seed: 'five-eras' }); expect(validateFive(ids, { kind: 'one-per-era' }).ok).toBe(true); expect(new Set(ids.map(id => BY_ID.get(id).decade)).size).toBe(5); });
  it('refuses a fabricated Salary Cap constraint', () => { expect(() => filterPool({ kind: 'salary-cap' })).toThrow('Unknown draft constraint'); });
  it.each(ERAS)('can construct a legal complete %s five even in the sparse 1950s pool', era => { const ids = legalFive({ era, seed: 'sparse-test' }); expect(ids).toHaveLength(5); expect(ids.every((id, i) => BY_ID.get(id).decade === era && BY_ID.get(id).positions.includes(POSITIONS[i]))).toBe(true); expect(new Set(ids.map(canonicalPerson)).size).toBe(5); });
  it('returns null for an impossible pool rather than substituting an unrelated player', () => { expect(legalFive({ franchise: 'made-up', seed: 'impossible' })).toBe(null); });
});
describe('Spin receipts can be governed by the server adapter', () => {
  it.each(Array.from({ length: 20 }, (_, i) => i))('produces a playable deterministic five for seed %i', seed => { const slots = createSpinSlots(seed); expect(slots).toEqual(createSpinSlots(seed)); for (const slot of slots) { const franchise = getFranchise(slot.franchise); expect(franchise).not.toBe(null); expect(slot.poolIds.every(id => franchise.poolIds.includes(id) && BY_ID.get(id).decade === slot.era && BY_ID.get(id).positions.includes(slot.position))).toBe(true); } const ids = legalFive({ kind: 'spin', slots, seed }); expect(validateFive(ids, { kind: 'spin', slots }).ok).toBe(true); });
  it('skips only one requested axis and keeps a globally playable pool', () => { const original = createSpinSlots('skip-test'); for (const axis of ['era', 'franchise']) { let found = false; for (let i = 0; i < 5; i++) { try { const next = rerollSpinSlot(original, i, axis, 'skip-next'); expect(next[i][axis]).not.toBe(original[i][axis]); expect(next[i][axis === 'era' ? 'franchise' : 'era']).toBe(original[i][axis === 'era' ? 'franchise' : 'era']); expect(next.filter((_, slot) => slot !== i)).toEqual(original.filter((_, slot) => slot !== i)); expect(legalFive({ kind: 'spin', slots: next, seed: 'next' })).not.toBe(null); found = true; break; } catch (e) { if (!e.message.startsWith('No alternate')) throw e; } } expect(found).toBe(true); } });
  it('rejects forged and malformed slot constraints', () => { const slots = createSpinSlots('forgery'); const ids = legalFive({ slots, kind: 'spin', seed: 'forgery' }); slots[0] = { ...slots[0], poolIds: [] }; expect(validateFive(ids, { kind: 'spin', slots }).ok).toBe(false); expect(() => rerollSpinSlot(slots, 99, 'era', 'forged')).toThrow('Invalid spin skip'); });
});
describe('separately versioned New York Daily and Gauntlet calendar', () => {
  it('changes the day at New York midnight, not UTC midnight', () => { expect(newYorkDay('2026-10-02T03:59:59Z')).toBe('2026-10-01'); expect(newYorkDay('2026-10-02T04:00:00Z')).toBe('2026-10-02'); });
  it('handles the 23-hour spring Daily', () => { expect(nextNewYorkMidnight('2026-03-08T05:00:00Z')).toBe('2026-03-09T04:00:00.000Z'); });
  it('handles the 25-hour fall Daily', () => { expect(nextNewYorkMidnight('2026-11-01T04:00:00Z')).toBe('2026-11-02T05:00:00.000Z'); });
  it('crosses month and leap-year boundaries correctly', () => { expect(nextNewYorkMidnight('2028-02-29T18:00:00Z')).toBe('2028-03-01T05:00:00.000Z'); });
  it('returns identical constraints during one New York day', () => { const a = dailyConfig('2026-10-02T05:00:00Z'), b = dailyConfig('2026-10-03T03:00:00Z'); expect(a).toEqual(b); expect(new Set(a.coachIds).size).toBe(3); expect(validateFive(a.opponentIds).ok).toBe(true); });
  it('uses the actual initial Daily opponent, coach board and era, not an unrelated seeded roster', () => { const cfg = dailyConfig('2026-10-02T05:00:00Z'); const run = startRun({ runId: 'test-daily', seedId: dailySeedId(cfg.day), createdAt: 12345, competitiveEraLock: true }); expect(cfg.opponentIds).toEqual(run.blueRoster); expect(cfg.coachIds).toEqual(run.coachOffers.gold.map(c => c.coachId)); expect(cfg.eraId).toBe(revealEra(run.seedId)); });
  it('rotates the next day seed and protects the fixed seven-stage sequence', () => { expect(dailySeed('2026-10-02')).not.toBe(dailySeed('2026-10-03')); expect(GAUNTLET_ERAS).toEqual(['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s']); });
});
