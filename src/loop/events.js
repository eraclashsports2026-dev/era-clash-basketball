// Closed Loop event vocabulary. Vendor delivery is optional; play never awaits it.
import { track } from '../analytics.js';
import { getUid } from '../identity.js';
export const LOOP_EVENTS_VERSION = '1.0.0';
export const LOOP_EVENTS = Object.freeze(['game_completed', 'card_created', 'card_shared', 'card_opened', 'rematch_started_from_card', 'guest_play_started', 'signup_completed', 'daily_attempted', 'daily_shared', 'mode_started']);
const MODES = new Set(['chaos', 'dream', 'daily', 'any-five', 'franchise', 'tonight', 'spin', 'one-franchise', 'one-per-era', 'no-mvps', 'gauntlet', 'lab', 'rooms', 'best7', '82', 'tournament']);
const CHANNELS = new Set(['copy', 'native', 'download', 'link', 'unknown']);
const SOURCES = new Set(['card', 'direct', 'link', 'unknown']);
export function cleanLoopProperties(props = {}) {
  const out = {};
  if (MODES.has(props.mode)) out.mode = props.mode;
  if (CHANNELS.has(props.channel)) out.channel = props.channel;
  if (SOURCES.has(props.source)) out.source = props.source;
  return out;
}
export async function deliverLoopEvent(name, properties, adapter = {}) {
  if (!LOOP_EVENTS.includes(name)) return { sink: 'noop', delivered: false };
  const props = cleanLoopProperties(properties);
  try {
    if (typeof adapter.vercelTrack === 'function') { adapter.vercelTrack(name, props); return { sink: 'vercel', delivered: true }; }
    if (adapter.posthogKey && /^https:\/\/(us|eu)\.i\.posthog\.com$/.test(adapter.posthogHost || 'https://us.i.posthog.com')) {
      const response = await (adapter.fetch || fetch)(`${adapter.posthogHost || 'https://us.i.posthog.com'}/capture/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, body: JSON.stringify({ api_key: adapter.posthogKey, event: name, properties: { ...props, distinct_id: adapter.distinctId || getUid(), $process_person_profile: false } }) });
      return { sink: 'posthog', delivered: response.ok };
    }
  } catch { return { sink: adapter.posthogKey ? 'posthog' : 'vercel', delivered: false }; }
  return { sink: 'noop', delivered: false };
}
export function loopEvent(name, properties = {}) {
  if (!LOOP_EVENTS.includes(name)) return;
  const props = cleanLoopProperties(properties);
  track(name, props); // Existing first-party allowlisted /api/events sink.
  void deliverLoopEvent(name, props, {
    vercelTrack: typeof window !== 'undefined' && typeof window.va === 'function' ? (event, p) => window.va('event', { name: event, data: p }) : null,
    posthogKey: import.meta.env?.VITE_POSTHOG_KEY,
    posthogHost: import.meta.env?.VITE_POSTHOG_HOST,
  });
}
export function loopNumbers(events) {
  const n = name => events.filter(e => e.event === name).length;
  const ratio = (a, b) => b ? a / b : null;
  const starts = events.filter(e => ['guest_play_started', 'game_completed'].includes(e.event));
  const first = new Map();
  for (const e of starts) if (e.uid && Number.isFinite(e.ts)) first.set(e.uid, Math.min(first.get(e.uid) ?? Infinity, e.ts));
  const returned = day => new Set(starts.filter(e => e.uid && Math.floor((e.ts - first.get(e.uid)) / 86400000) === day).map(e => e.uid)).size;
  return { sharesPerCompletedGame: ratio(n('card_shared'), n('game_completed')), cardTapsPerShare: ratio(n('card_opened'), n('card_shared')), playsPerCardTap: ratio(n('rematch_started_from_card'), n('card_opened')), returnRate: { day2: ratio(returned(1), first.size), day7: ratio(returned(6), first.size) } };
}
