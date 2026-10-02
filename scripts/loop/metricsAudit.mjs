// Test-only ingest proof. No browser/admin credentials, network or DB writes.
// The real events handler writes through a deliberately emulated Redis REST
// transport; ratios are computed from its ingested, sanitized raw log.
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const label = process.argv[2];
if (!/^(run2|run3)$/.test(label || '')) throw new Error('Use a fresh run2 or run3 audit label.');
process.env.NODE_ENV = 'test';
process.env.VERCEL_ENV = 'preview';
delete process.env.ECLASH_TEST_MEMORY_STORE;
process.env.UPSTASH_REDIS_REST_URL = 'https://loop-metrics-audit.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'TEST_ONLY_NO_CREDENTIAL';
const lists = new Map(), hashes = new Map(), keys = new Map(), unique = new Map();
const commands = [];
function redis(args) {
  commands.push(args);
  const [op, key, ...rest] = args;
  if (op === 'INCR') { const n = Number(keys.get(key) || 0) + 1; keys.set(key, n); return n; }
  if (op === 'EXPIRE') return 1;
  if (op === 'GET') return keys.get(key) ?? null;
  if (op === 'LPUSH') { const list = lists.get(key) || []; list.unshift(rest[0]); lists.set(key, list); return list.length; }
  if (op === 'LTRIM') { lists.set(key, (lists.get(key) || []).slice(Number(rest[0]), Number(rest[1]) + 1)); return 'OK'; }
  if (op === 'HINCRBY') { const h = hashes.get(key) || {}; h[rest[0]] = Number(h[rest[0]] || 0) + Number(rest[1]); hashes.set(key, h); return h[rest[0]]; }
  if (op === 'PFADD') { const set = unique.get(key) || new Set(); const before = set.size; set.add(rest[0]); unique.set(key, set); return set.size > before ? 1 : 0; }
  throw new Error(`Unimplemented test transport command: ${op}`);
}
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith('https://loop-metrics-audit.invalid')) throw new Error('Audit forbids external network.');
  const data = JSON.parse(options.body);
  const body = String(url).endsWith('/pipeline') ? data.map(args => ({result:redis(args)})) : {result:redis(data)};
  return new Response(JSON.stringify(body), {status:200, headers:{'content-type':'application/json'}});
};
const { default: handler } = await import('../../api/events.js');
const { LOOP_EVENTS, loopNumbers } = await import('../../src/loop/events.js');
const t0 = Date.UTC(2026, 8, 20, 12), day = 86400000;
// Explicit synthetic cohort to test day2/day7 formulas, not observed retention.
const events = LOOP_EVENTS.map((event, index) => ({event, uid:'synthetic-browser-a', ts:t0 + index, mode:'any-five', channel:'copy', source:'card', email:'must-be-stripped.invalid', resultId:'must-be-stripped'}));
events.push({event:'game_completed', uid:'synthetic-browser-b', ts:t0}, {event:'game_completed', uid:'synthetic-browser-a', ts:t0 + day}, {event:'game_completed', uid:'synthetic-browser-a', ts:t0 + 6 * day});
events.push({event:'game_completed', uid:'private-address@invalid', ts:t0, arbitrary:'must-be-stripped'});
let status;
const req = {method:'POST',headers:{host:'localhost:4320',origin:'http://localhost:4320','x-forwarded-for':'127.0.0.1'},body:{events}};
const res = {status(value){status=value;return this;},end(){return this;},json(){return this;}};
await handler(req,res);
const ingested = [...lists.values()].flat().map(line => JSON.parse(line));
const numbers = loopNumbers(ingested);
const checks = [
  {name:'Real handler accepts ingest',pass:status===204},
  {name:'Every named event stored',pass:LOOP_EVENTS.every(name=>ingested.some(row=>row.event===name))},
  {name:'All14 valid observations stored',pass:ingested.length===14},
  {name:'Closed properties remove private fields and invalid identity',pass:ingested.every(row=>!row.email&&!row.resultId&&!row.arbitrary&&(!row.uid||/^[a-z0-9-]{8,64}$/i.test(row.uid)))},
  {name:'Unique counter never receives the invalid identity',pass:commands.filter(row=>row[0]==='PFADD').every(row=>!String(row[2]).includes('@'))},
  {name:'Shares per completed game',pass:numbers.sharesPerCompletedGame===1/5},
  {name:'Card taps per share',pass:numbers.cardTapsPerShare===1},
  {name:'Plays per tap (entry intent)',pass:numbers.playsPerCardTap===1},
  {name:'Synthetic day2 and day7 cohorts',pass:numbers.returnRate.day2===0.5&&numbers.returnRate.day7===0.5},
];
const report = {label, generatedAt:new Date().toISOString(), sourceSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), environment:'test-only actual-handler / emulated Redis transport', identity:'synthetic browser cohort, no account', status:checks.every(row=>row.pass)?'PASS':'FAIL', vendor:'UNVERIFIED — no vendor configured', realRetention:'UNVERIFIED — cohort timestamps deliberately synthetic', numbers, counters:[...hashes.values()], ingested, checks};
mkdirSync('data/validation/loop-foundation/metrics',{recursive:true});
writeFileSync(`data/validation/loop-foundation/metrics/${label}.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,checks:checks.length,numbers},null,2));
process.exitCode = checks.every(row=>row.pass)?0:1;
