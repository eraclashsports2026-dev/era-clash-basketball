// Thin transport to the existing authoritative game API. No local simulation.
import { accessToken, accountState } from '../accounts/accountState.js';
const inflight = new Map();
const pendingIds = new Map();
const messages = {
  FEATURE_DISABLED: 'This mode is temporarily unavailable. Your picks are still here.',
  KV_UNAVAILABLE: 'This mode needs its server store. It is currently unavailable; no result was invented.',
  DAILY_ALREADY_COMPLETED: 'Your Daily is complete. The next challenge opens at midnight in New York.',
  DAILY_ATTEMPT_USED: 'Your Daily is complete. The next challenge opens at midnight in New York.',
  DAILY_EXPIRED: 'The Daily has changed. Reload to start the new challenge.',
  GAUNTLET_FINISHED: 'This Gauntlet is finished. Start a new run from the Modes hub.',
  SPIN_SKIP_USED: 'That skip has already been used.',
  RATE_LIMITED: 'Please wait a moment before trying again. Your picks are still here.',
};
export async function loopApi(body) {
  const key = `${accountState().session?.userId || 'guest'}|${JSON.stringify(body)}`;
  if (inflight.has(key)) return inflight.get(key);
  const simulationId = body.simulationId || pendingIds.get(key) || globalThis.crypto?.randomUUID?.() || `loop-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  pendingIds.set(key, simulationId);
  if (pendingIds.size > 200) pendingIds.delete(pendingIds.keys().next().value);
  const token = accessToken();
  const request = (async () => {
    let response;
    try { response = await fetch('/api/game', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ ...body, action: 'loop', simulationId }) }); }
    catch { const error = new Error('Connection lost. Your picks are still here; try again.'); error.code = 'NETWORK_ERROR'; throw error; }
    let data; try { data = await response.json(); } catch { const error = new Error('The game server returned an unreadable response. Try again.'); error.code = 'INVALID_RESPONSE'; throw error; }
    if (!response.ok) { const error = new Error(messages[data.code] || data.message || 'The server could not complete this action. Your picks are still here.'); error.code = data.code || 'LOOP_ERROR'; error.status = response.status; throw error; }
    pendingIds.delete(key); return data;
  })().finally(() => inflight.delete(key));
  inflight.set(key, request); return request;
}
