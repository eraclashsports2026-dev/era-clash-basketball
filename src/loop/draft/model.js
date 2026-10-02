// Loop constraint adapter 1.0.0. Selection only: never modifies a simulation,
// player capability, calibration value, score, or competitive rating.
import { PLAYERS, POSITIONS } from '../../players.js';
import { personIdForCard, personIdFromName } from '../../v3/data/persons.js';
import { FRANCHISES as FRANCHISE_CATALOG, getFranchise } from '../franchiseCatalog.js';

export const LOOP_DRAFT_VERSION = '1.0.0';
export const BY_ID = new Map(PLAYERS.map(p => [p.id, p]));
export const ERAS = [...new Set(PLAYERS.map(p => p.decade))].sort();
export const GAUNTLET_ERAS = ERAS.filter(era => era !== '1950s');
export const franchisesFor = p => String(p?.team || '').split('/').map(s => s.trim()).filter(Boolean);
export const FRANCHISES = [...new Set(PLAYERS.flatMap(franchisesFor))].sort();
export const MODE_TAGS = Object.freeze({ 'any-five': 'ANY_FIVE', daily: 'DAILY', spin: 'SPIN', 'one-franchise': 'ONE_FRANCHISE', 'one-per-era': 'ONE_PER_ERA', 'no-mvps': 'NO_MVPS', gauntlet: 'GAUNTLET', lab: 'LAB' });
const mvpPeople = new Set(PLAYERS.filter(p => Number(p.mvp) > 0).map(p => personIdForCard(p.id)));
const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases = {
  mj: 'Michael Jordan', airjordan: 'Michael Jordan', jordan: 'Michael Jordan',
  lebron: 'LeBron James', bron: 'LeBron James', kingjames: 'LeBron James',
  steph: 'Stephen Curry', stephcurry: 'Stephen Curry', curry: 'Stephen Curry',
  magic: 'Magic Johnson', magicjohnson: 'Magic Johnson', shaq: "Shaquille O'Neal",
  shaqoneal: "Shaquille O'Neal", kobe: 'Kobe Bryant', blackmamba: 'Kobe Bryant',
  ai: 'Allen Iverson', theanswer: 'Allen Iverson', drj: 'Julius Erving',
  kd: 'Kevin Durant', durant: 'Kevin Durant', giannis: 'Giannis Antetokounmpo',
  greekfreak: 'Giannis Antetokounmpo', luka: 'Luka Doncic', jokic: 'Nikola Jokic',
  hakeem: 'Hakeem Olajuwon', thedream: 'Hakeem Olajuwon', kareem: 'Kareem Abdul-Jabbar',
  wilt: 'Wilt Chamberlain', russell: 'Bill Russell', duncan: 'Tim Duncan',
  bird: 'Larry Bird', larrylegend: 'Larry Bird', kg: 'Kevin Garnett',
  cp3: 'Chris Paul', bigo: 'Oscar Robertson', tiny: 'Nate Archibald',
};
// The current canonical name may be Earvin Johnson; aliases never redefine identity.
const names = [...new Set(PLAYERS.map(p => p.name))];
const magicName = names.find(n => /^(Magic|Earvin) Johnson$/.test(n));
if (magicName) { aliases.magic = magicName; aliases.magicjohnson = magicName; }

export const hash32 = value => { let h = 2166136261; for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
export const randomFor = seed => { let a = hash32(seed); return () => { a += 0x6D2B79F5; let t = Math.imul(a ^ a >>> 15, a | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const shuffle = (items, rng) => { const out = [...items]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; };
const editDistance = (a, b) => { let row = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 1; i <= a.length; i++) { const next = [i]; for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); row = next; } return row[b.length]; };

/** Returns explicit decade cards. Similar names never silently select a person. */
export function searchPlayers(query, { era = '', position = '', poolIds, limit = 20 } = {}) {
  const q = norm(query);
  const aliased = aliases[q];
  const target = norm(aliased || query);
  const allowed = poolIds ? new Set(poolIds) : null;
  return PLAYERS.filter(p => (!era || p.decade === era) && (!position || p.positions.includes(position)) && (!allowed || allowed.has(p.id)))
    .map(p => {
      const name = norm(p.name), last = norm(p.name.split(' ').at(-1)), first = norm(p.name.split(' ')[0]);
      const exact = name === target || last === target;
      const partial = target && (name.includes(target) || target.includes(name));
      const distance = target.length >= 4 ? Math.min(editDistance(target, name), editDistance(target, last), editDistance(target, first)) : Infinity;
      return { p, score: !q ? 3 : exact ? 0 : partial ? 1 : distance <= Math.max(1, Math.floor(target.length / 5)) ? 2 + distance / 10 : Infinity };
    }).filter(row => Number.isFinite(row.score))
    .sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name) || b.p.decade.localeCompare(a.p.decade))
    .slice(0, limit).map(row => row.p);
}

export function filterPool({ kind = 'any-five', franchise = '', era = '', position = '', poolIds } = {}) {
  if (!['any-five', 'daily', 'spin', 'one-franchise', 'one-per-era', 'no-mvps', 'gauntlet', 'lab'].includes(kind)) throw new Error('Unknown draft constraint.');
  const allowed = poolIds ? new Set(poolIds) : null;
  const catalog = getFranchise(franchise), franchiseIds = catalog ? new Set(catalog.poolIds) : null;
  if (kind === 'one-franchise' && !catalog) return [];
  return PLAYERS.filter(p => (!franchise || (franchiseIds ? franchiseIds.has(p.id) : franchisesFor(p).includes(franchise))) && (!era || p.decade === era) && (!position || p.positions.includes(position)) && (!allowed || allowed.has(p.id)) && (kind !== 'no-mvps' || !mvpPeople.has(personIdForCard(p.id))));
}

/** Find a legal position assignment without dropping or replacing a player. */
export function assignFive(ids) {
  if (!Array.isArray(ids) || ids.length !== 5 || ids.some(id => !BY_ID.has(id)) || new Set(ids.map(personIdForCard)).size !== 5) return null;
  const chosen = Array(5), used = new Set();
  const visit = slot => {
    if (slot === 5) return true;
    for (const id of ids) if (!used.has(id) && BY_ID.get(id).positions.includes(POSITIONS[slot])) {
      chosen[slot] = id; used.add(id); if (visit(slot + 1)) return true; used.delete(id);
    }
    return false;
  };
  return visit(0) ? chosen : null;
}

export function validateFive(ids, { kind = 'any-five', franchise = '', slots, allowOutOfPosition = false } = {}) {
  if (!Array.isArray(ids) || ids.length !== 5 || ids.some(id => !BY_ID.has(id))) return { ok: false, error: 'Choose five player cards from the current roster.' };
  if (new Set(ids.map(personIdForCard)).size !== 5) return { ok: false, error: 'Choose five different people. Two decades of one player still count as one person.' };
  const players = ids.map(id => BY_ID.get(id));
  if (kind === 'one-franchise' && (!getFranchise(franchise) || players.some(p => !getFranchise(franchise).poolIds.includes(p.id)))) return { ok: false, error: 'Every card must belong to the selected documented franchise pool.' };
  if (kind === 'one-per-era' && new Set(players.map(p => p.decade)).size !== 5) return { ok: false, error: 'One Per Era needs five different decades.' };
  if (kind === 'no-mvps' && players.some(p => mvpPeople.has(personIdForCard(p.id)))) return { ok: false, error: 'No MVPs excludes people credited with an MVP on any current card.' };
  if (kind === 'spin' && (!Array.isArray(slots) || slots.length !== 5 || ids.some((id, i) => !slots[i]?.poolIds?.includes(id)))) return { ok: false, error: 'A pick does not match its official franchise and era spin.' };
  const outOfPosition = players.map((p, i) => p.positions.includes(POSITIONS[i]) ? null : POSITIONS[i]).filter(Boolean);
  if (!allowOutOfPosition && outOfPosition.length) return { ok: false, error: 'Place each player at a position listed on their card.' };
  return { ok: true, ids, outOfPosition };
}

/** Seeded selection with backtracking: sparse eras cannot strand a later slot. */
export function legalFive({ seed = 'loop', franchise = '', era = '', kind = 'any-five', excludePersonIds = [], slots, poolIds } = {}) {
  const rng = randomFor(seed), excluded = new Set(excludePersonIds), used = new Set(), decades = new Set(), result = Array(5);
  const pools = POSITIONS.map((position, i) => shuffle(filterPool({ kind, franchise, era, position, poolIds: slots?.[i]?.poolIds || poolIds }), rng));
  const visit = slot => {
    if (slot === 5) return true;
    for (const p of pools[slot]) {
      const person = personIdForCard(p.id);
      if (used.has(person) || excluded.has(person) || (kind === 'one-per-era' && decades.has(p.decade))) continue;
      used.add(person); decades.add(p.decade); result[slot] = p.id;
      if (visit(slot + 1)) return true;
      used.delete(person); decades.delete(p.decade);
    }
    return false;
  };
  return visit(0) ? result : null;
}

const spinOptions = (position, franchise = '', era = '') => FRANCHISE_CATALOG.filter(f => !franchise || f.id === franchise).flatMap(f => ERAS.filter(e => !era || e === era).map(e => ({ position, franchise: f.id, franchiseLabel: f.name, era: e, poolIds: filterPool({ position, franchise: f.id, era: e }).map(p => p.id) }))).filter(s => s.poolIds.length);
export function createSpinSlots(seed = 'spin') {
  const rng = randomFor(seed), slots = [], used = new Set();
  for (const position of POSITIONS) {
    const choices = shuffle(spinOptions(position), rng).filter(s => s.poolIds.some(id => !used.has(personIdForCard(id))));
    const slot = choices[0]; if (!slot) throw new Error('No playable franchise-era combination.');
    used.add(personIdForCard(slot.poolIds.find(id => !used.has(personIdForCard(id))))); slots.push(slot);
  }
  return slots;
}
export function rerollSpinSlot(slots, index, axis, seed) {
  if (!Array.isArray(slots) || slots.length !== 5 || !Number.isInteger(index) || index < 0 || index > 4 || !['franchise', 'era'].includes(axis)) throw new Error('Invalid spin skip.');
  const original = slots[index];
  const choices = shuffle(spinOptions(POSITIONS[index], axis === 'era' ? original.franchise : '', axis === 'franchise' ? original.era : ''), randomFor(seed)).filter(s => s[axis] !== original[axis]);
  for (const option of choices) { const next = slots.map((s, i) => i === index ? option : s); if (legalFive({ seed, slots: next, kind: 'spin' })) return next; }
  throw new Error('No alternate playable spin for that slot. Your skip was not used.');
}

export const canonicalPerson = id => personIdForCard(id) || null;
export const personForName = name => personIdFromName(name);
