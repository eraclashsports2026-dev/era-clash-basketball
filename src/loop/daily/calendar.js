// A separately versioned New York Loop Daily. Legacy UTC Daily remains intact.
import { PLAYERS } from '../../players.js';
import { startRun, revealEra } from '../../chaos/runState.js';
import { hash32 } from '../draft/model.js';
export const LOOP_DAILY_VERSION = '1.0.0';
export { newYorkDay, nextNewYorkMidnight } from './clock.js';
import { newYorkDay, nextNewYorkMidnight } from './clock.js';
export const dailySeed = day => hash32(`loop-daily|${LOOP_DAILY_VERSION}|${day}`);
export const dailySeedId = day => `loop-daily:${LOOP_DAILY_VERSION}:${day}`;
export function dailyConfig(now = new Date()) {
  const day = newYorkDay(now), seed = dailySeed(day), seedId = dailySeedId(day);
  const initial = startRun({ runId: `daily-config-${day}`, seedId, createdAt: Date.parse(`${day}T12:00:00Z`), competitiveEraLock: true });
  return { version: LOOP_DAILY_VERSION, day, seed, poolIds: PLAYERS.map(p => p.id), coachIds: initial.coachOffers.gold.map(c => c.coachId), opponentIds: initial.blueRoster, eraId: revealEra(seedId), nextResetAt: nextNewYorkMidnight(now), timeZone: 'America/New_York' };
}
