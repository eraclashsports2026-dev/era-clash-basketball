// A separately versioned New York Loop Daily. Legacy UTC Daily remains intact.
import { PLAYERS } from '../../players.js';
import { startRun, revealEra } from '../../chaos/runState.js';
import { hash32 } from '../draft/model.js';
export const LOOP_DAILY_VERSION = '1.0.0';
const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
export function newYorkDay(now = new Date()) { const parts = Object.fromEntries(formatter.formatToParts(new Date(now)).map(p => [p.type, p.value])); return `${parts.year}-${parts.month}-${parts.day}`; }
export function nextNewYorkMidnight(now = new Date()) {
  const start = new Date(now).getTime(); if (!Number.isFinite(start)) throw new Error('Invalid Daily date.');
  const day = newYorkDay(start); let low = start, high = start + 36 * 3600000;
  while (high - low > 1) { const middle = Math.floor((high + low) / 2); if (newYorkDay(middle) === day) low = middle; else high = middle; }
  return new Date(high).toISOString();
}
export const dailySeed = day => hash32(`loop-daily|${LOOP_DAILY_VERSION}|${day}`);
export const dailySeedId = day => `loop-daily:${LOOP_DAILY_VERSION}:${day}`;
export function dailyConfig(now = new Date()) {
  const day = newYorkDay(now), seed = dailySeed(day), seedId = dailySeedId(day);
  const initial = startRun({ runId: `daily-config-${day}`, seedId, createdAt: Date.parse(`${day}T12:00:00Z`), competitiveEraLock: true });
  return { version: LOOP_DAILY_VERSION, day, seed, poolIds: PLAYERS.map(p => p.id), coachIds: initial.coachOffers.gold.map(c => c.coachId), opponentIds: initial.blueRoster, eraId: revealEra(seedId), nextResetAt: nextNewYorkMidnight(now), timeZone: 'America/New_York' };
}
