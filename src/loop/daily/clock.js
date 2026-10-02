const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
export function newYorkDay(now = new Date()) { const parts = Object.fromEntries(formatter.formatToParts(new Date(now)).map(p => [p.type, p.value])); return `${parts.year}-${parts.month}-${parts.day}`; }
export function nextNewYorkMidnight(now = new Date()) {
  const start = new Date(now).getTime(); if (!Number.isFinite(start)) throw new Error('Invalid Daily date.');
  const day = newYorkDay(start); let low = start, high = start + 36 * 3600000;
  while (high - low > 1) { const middle = Math.floor((high + low) / 2); if (newYorkDay(middle) === day) low = middle; else high = middle; }
  return new Date(high).toISOString();
}
