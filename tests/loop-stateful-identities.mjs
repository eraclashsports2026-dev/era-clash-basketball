// Test-only identity namespace. A new salt creates new local fake-account UUIDs;
// no game/result/saved rows are seeded here. Never import in production.
import { createHash } from 'node:crypto';
export const identitySalt = process.env.LOOP_QA_IDENTITY_SALT || 'run-2';
const uuid = side => { const chars = createHash('sha256').update(`loop-qa:${identitySalt}:${side}`).digest('hex').slice(0, 32).split(''); chars[12] = '4'; chars[16] = '8'; const s = chars.join(''); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
export const statefulUsers = [
  { userId: uuid('one'), email: `one.${createHash('sha256').update(identitySalt).digest('hex').slice(0,8)}@qa.invalid`, displayName: 'QA One' },
  { userId: uuid('two'), email: `two.${createHash('sha256').update(identitySalt).digest('hex').slice(0,8)}@qa.invalid`, displayName: 'QA Two' },
];
