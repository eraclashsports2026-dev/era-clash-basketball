import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { loopHandler, roomNotificationHook } from '../api/_lib/loopFoundation.js';
import { _memReset, getJSON, cmd, dayKey } from '../api/_lib/store.js';
import { legalFive, rerollSpinSlot, MODE_TAGS } from '../src/loop/draft/model.js';
import { dailyConfig } from '../src/loop/daily/calendar.js';
import { installFakeCloud } from '../scripts/lib/fakeCloud.mjs';
import { buildSavedClash } from '../api/_lib/cloudAccounts.js';
import { engineIdentity, finalScoreOf } from '../api/_lib/resultContract.js';
import eventsHandler from '../api/events.js';
import { LOOP_EVENTS, loopNumbers, deliverLoopEvent } from '../src/loop/events.js';

const U1='11111111-1111-4111-8111-111111111111', U2='22222222-2222-4222-8222-222222222222';
const realFetch=globalThis.fetch;
const response=()=>({code:200,body:null,status(c){this.code=c;return this},json(b){this.body=b;return this},end(){return this},setHeader(){}});
async function action(body, {session='one', user=null}={}) {
  const res=response();
  await loopHandler({body:{simulationId:randomUUID(),...body},headers:user?{authorization:`Bearer test-token.${user}`}:{},socket:{remoteAddress:'127.0.0.1'}},res,{session,f:{previewSimEngine:true}});
  return res;
}
const five=()=>legalFive({seed:'loop-server-test'});
async function readyDaily(identity={}) {
  let r=await action({op:'daily-start'},identity); expect(r.code).toBe(200);
  const dailyToken=r.body.dailyToken;
  for(let i=0;i<2;i++){r=await action({op:'daily-roll',dailyToken,holdSlots:[],holdRoles:[]},identity);expect(r.code).toBe(200);}
  expect(r.body.state.phase).toBe('ROLL_3_REVEALED');
  r=await action({op:'daily-roll',dailyToken,coachId:r.body.state.coachOffers[0].coachId},identity);expect(r.code).toBe(200);expect(r.body.state.phase).toBe('READY');
  return dailyToken;
}
beforeEach(()=>{process.env.ECLASH_TEST_MEMORY_STORE='1';process.env.NODE_ENV='test';process.env.LOOP_TOKEN_SECRET='isolated-local-test-signing-secret';process.env.LOOP_TEST_NOW='2026-10-02T16:00:00Z';_memReset();});
afterEach(()=>{globalThis.fetch=realFetch;delete process.env.LOOP_TEST_NOW;delete process.env.LOOP_TOKEN_SECRET;delete process.env.ROOM_EMAIL_NOTIFICATIONS_ENABLED;delete process.env.SMTP_VERIFIED;});
describe('Loop adapters preserve authoritative results and retry semantics',()=>{
  it('persists real Candidate4 identity, score, rosters and saved-row identity without session exposure',async()=>{
    const r=await action({op:'play',mode:'any-five',goldIds:five()});expect(r.code).toBe(200);
    const rec=r.body.result;expect(rec.session).toBeUndefined();expect(rec.seed).toBeUndefined();
    expect(rec.candidate.possessionCalibrationVersion).toBe('1.4.0');expect(rec.candidate.coreHash).toMatch(/^55bb26a2/);
    const stored=await getJSON(`preview-result:${rec.id}`);expect(stored.session).toBe('one');expect(finalScoreOf(stored)).toEqual(finalScoreOf(rec));
    const row=buildSavedClash({record:stored,userId:U1,claimedFrom:'signed_in'});
    expect(row.candidate_core_hash).toBe(rec.candidate.coreHash);expect(row.calibration_version).toBe('1.4.0');expect(row.gold_roster.map(x=>x.id)).toEqual(rec.goldIds);
    expect(engineIdentity(stored)).toEqual(engineIdentity(rec));
  });
  it('returns the same immutable result for a successful retry, even if inputs change',async()=>{
    const body={op:'play',mode:'any-five',goldIds:five(),simulationId:randomUUID()};const a=await action(body),b=await action({...body,goldIds:[]});expect(a.code).toBe(200);expect(b.body).toEqual(a.body);
  });
  it('explains unsupported out-of-position fives before reaching the protected engine',async()=>{
    const r=await action({op:'play',mode:'any-five',goldIds:['wilt-60s','bill-60s','shaq-00s','kareem-70s','jokic-20s']});expect(r.code).toBe(400);expect(r.body.code).toBe('INVALID_FIVE');expect(r.body.message).toMatch(/position/);
  });
  it('rejects missing retry ids and invalid bearers instead of granting guest access',async()=>{
    expect((await action({op:'play',goldIds:five(),simulationId:null})).body.code).toBe('INVALID_REQUEST_ID');
    installFakeCloud({users:[{userId:U1}]});expect((await action({op:'config'},{user:'no-such-user'})).code).toBe(401);
  });
  it('keeps Lab exploration off every leaderboard and sanitizes its free-text scenario',async()=>{
    const ids=five(),r=await action({op:'play',mode:'lab',goldIds:ids,scenario:{playerId:ids[0],teamLabel:'<script>\u0001'}});expect(r.code).toBe(200);expect(r.body.result.loop.scenario).toEqual({playerId:ids[0],teamLabel:'script',eraId:dailyConfig(Date.parse(process.env.LOOP_TEST_NOW)).eraId,exploration:true});expect((await action({op:'leaderboard',tag:'LAB'})).code).toBe(400);expect(await getJSON(`loop:entry:${r.body.resultId}`)).toBeNull();
  });
  it.each(['any-five','one-franchise','one-per-era','no-mvps','franchise','tonight'])('runs %s and tags its casual board without competitive rating',async mode=>{
    const ids=legalFive({seed:mode,kind:['franchise','tonight'].includes(mode)?'any-five':mode,franchise:mode==='one-franchise'?'boston':undefined});
    const r=await action({op:'play',mode,goldIds:ids,franchise:'boston'});expect(r.code).toBe(200);expect(r.body.result.loop.tag).toBe(MODE_TAGS[mode]||mode.toUpperCase());expect(r.body.result.loop.boardType).toBe('casual-sandbox-margin');const board=await action({op:'leaderboard',tag:r.body.result.loop.tag});expect(board.body.rows[0].resultId).toBe(r.body.resultId);expect(board.body.rows[0].rating).toBeUndefined();
  });
});
describe('Daily calendar, signed claims and account streaks',()=>{
  it('gives two guest identities the same real Chaos constraints, offers and era',async()=>{
    const a=await action({op:'daily-start'}),b=await action({op:'daily-start'},{session:'two'});expect(a.body.state.gold).toEqual(b.body.state.gold);expect(a.body.state.blue).toEqual(b.body.state.blue);expect(a.body.state.coachDraft.offers).toEqual(b.body.state.coachDraft.offers);expect(a.body.config.opponentIds).toEqual(a.body.state.blue.roster.map(x=>x.id));
  });
  it('rejects forged and other-owner tokens',async()=>{
    const a=await action({op:'daily-start'});expect((await action({op:'daily-roll',dailyToken:a.body.dailyToken},{session:'two'})).code).toBe(409);expect((await action({op:'daily-roll',dailyToken:a.body.dailyToken+'x'})).code).toBe(409);
  });
  it('allows one completion; same request retry replays, a different attempt is blocked',async()=>{
    const token=await readyDaily(),body={op:'daily-play',dailyToken:token,simulationId:randomUUID()};const a=await action(body);expect(a.code).toBe(200);expect(a.body.daily.winPercent).toBeNull();expect((await action(body)).body).toEqual(JSON.parse(JSON.stringify(a.body)));expect((await action({...body,simulationId:randomUUID()})).body.code).toBe('DAILY_ATTEMPT_USED');expect((await action({op:'daily-start'})).code).toBe(409);
  });
  it('server-enforces the account claim across sessions and increments next-day streak',async()=>{
    installFakeCloud({users:[{userId:U1},{userId:U2}]});const identity={user:U1,session:'one'};
    const day1=await action({op:'daily-play',dailyToken:await readyDaily(identity)},identity);expect(day1.body.streak.count).toBe(1);
    expect((await action({op:'daily-start'},{user:U1,session:'new-device'})).code).toBe(409);
    const firstSeed=dailyConfig(Date.parse(process.env.LOOP_TEST_NOW)).seed;process.env.LOOP_TEST_NOW='2026-10-03T16:00:00Z';expect(dailyConfig(Date.parse(process.env.LOOP_TEST_NOW)).seed).not.toBe(firstSeed);
    const day2=await action({op:'daily-play',dailyToken:await readyDaily({...identity,session:'new-device'})},{...identity,session:'new-device'});expect(day2.body.streak).toMatchObject({count:2,account:true});
  });
});
describe('Spin, resumable Gauntlet and private-room concurrency',()=>{
  it('binds spin constraints to a signed receipt and serializes different-axis skips',async()=>{
    const s=(await action({op:'spin-start'})).body;
    const availableIndex=axis=>s.slots.findIndex((_,i)=>{try{rerollSpinSlot(s.slots,i,axis,'probe');return true}catch{return false}});
    const [a,b]=await Promise.all(['franchise','era'].map(axis=>action({op:'spin-skip',spinReceipt:s.spinReceipt,index:availableIndex(axis),axis})));expect([a.code,b.code].sort()).toEqual([200,409]);
    const other=a.code===409?'franchise':'era', current=(a.code===200?a:b).body;
    const index=current.slots.findIndex((_,i)=>{try{rerollSpinSlot(current.slots,i,other,'probe');return true}catch{return false}});
    const retry=await action({op:'spin-skip',spinReceipt:s.spinReceipt,index,axis:other});expect(retry.code).toBe(200);expect(retry.body).toMatchObject({franchiseSkips:0,eraSkips:0});expect((await action({op:'spin-skip',spinReceipt:s.spinReceipt,index,axis:other})).body.code).toBe('SPIN_SKIP_USED');
    expect((await action({op:'play',mode:'spin',goldIds:five(),spinReceipt:s.spinReceipt},{session:'two'})).code).toBe(400);
  });
  it('resumes an account Gauntlet without supplying a new team and rejects other-owner tokens',async()=>{
    installFakeCloud({users:[{userId:U1},{userId:U2}]});const a=await action({op:'gauntlet-start',goldIds:five()},{user:U1});const b=await action({op:'gauntlet-start',resume:true},{user:U1,session:'new'});expect(b.body.goldIds).toEqual(a.body.goldIds);expect(b.body.stage).toBe(0);expect((await action({op:'gauntlet-start',gauntletToken:a.body.gauntletToken},{user:U2})).code).toBe(403);
    const body={op:'gauntlet-play',gauntletToken:a.body.gauntletToken,stage:0,simulationId:randomUUID()};const played=await action(body,{user:U1});expect(played.code).toBe(200);expect(played.body.gauntlet.stage).toBe(1);expect((await action(body,{user:U1})).body).toEqual(JSON.parse(JSON.stringify(played.body)));expect((await action({...body,simulationId:randomUUID()},{user:U1})).code).toBe(409);
  });
  it('hides room data from nonmembers and preserves simultaneous join retries',async()=>{
    const roomId=(await action({op:'room-create'})).body.roomId;expect((await action({op:'room-read',roomId},{session:'two'})).code).toBe(403);
    const identities=[{session:'two'},{session:'three'}];const joins=await Promise.all(identities.map(i=>action({op:'room-join',roomId},i)));expect(joins.map(j=>j.code).sort()).toEqual([200,409]);await action({op:'room-join',roomId},identities[joins.findIndex(j=>j.code===409)]);expect((await action({op:'room-read',roomId})).body.room.memberCount).toBe(3);
    const rec=(await action({op:'play',goldIds:five(),mode:'any-five'})).body;expect((await action({op:'room-challenge',roomId,resultId:rec.resultId},{session:'two'})).code).toBe(403);expect((await action({op:'room-challenge',roomId,resultId:rec.resultId})).code).toBe(200);expect((await action({op:'room-read',roomId})).body.room.feed).toHaveLength(1);
  });
  it('does not send room email without both verified flags and an injected sender',async()=>{
    let sent=0;const sender=async()=>{sent++;return{status:'sent'}};expect(await roomNotificationHook({},sender)).toEqual({status:'disabled'});expect(sent).toBe(0);process.env.ROOM_EMAIL_NOTIFICATIONS_ENABLED='true';process.env.SMTP_VERIFIED='true';expect(await roomNotificationHook({},sender)).toEqual({status:'sent'});expect(sent).toBe(1);
  });
  it('preserves two-account room membership across devices and shares only owned live governed Challenges',async()=>{
    const fake=installFakeCloud({users:[{userId:U1},{userId:U2}]});const a={user:U1,session:'device-a'},b={user:U2,session:'device-b'};
    const roomId=(await action({op:'room-create'},a)).body.roomId;await action({op:'room-join',roomId},b);
    const played=await action({op:'play',goldIds:five(),mode:'any-five'},a);
    expect((await action({op:'room-challenge',roomId,resultId:played.body.resultId},{user:U1,session:'device-c'})).code).toBe(200);
    expect((await action({op:'room-challenge',roomId,resultId:played.body.resultId},{user:U2,session:'device-a'})).code).toBe(403);
    fake.tables.challenges.push({id:randomUUID(),public_code:'EC-ABCD-EFGH',creator_user_id:U1,status:'open',expires_at:'2026-10-09T16:00:00Z'});
    expect((await action({op:'room-share-challenge',roomId,challengeCode:'EC-ABCD-EFGH'},b)).code).toBe(403);
    const posted=await action({op:'room-share-challenge',roomId,challengeCode:'EC-ABCD-EFGH'},a);expect(posted.code).toBe(200);expect(posted.body.room.feed.find(e=>e.kind==='governed-challenge').path).toBe('/?challenge=EC-ABCD-EFGH');
    expect((await action({op:'room-read',roomId},b)).body.room.memberCount).toBe(2);
  });
});
describe('closed event delivery and measurable loop numbers',()=>{
  it('ingests every event into first-party counters, discarding free text and invalid identity',async()=>{
    const res=response();await eventsHandler({method:'POST',headers:{host:'localhost:4320',origin:'http://localhost:4320'},body:{events:LOOP_EVENTS.map(event=>({event,uid:'valid-uid-123',ts:Date.now(),mode:'daily',channel:'copy',source:'card',email:'private@example.invalid',token:'secret'}))}},res);expect(res.code).toBe(204);const raw=await cmd('HGETALL',`an:counts:${dayKey()}`);for(const name of LOOP_EVENTS){expect(raw).toContain(name);}expect(JSON.stringify(raw)).not.toMatch(/secret|private/);
  });
  it('computes all four numbers from known test observations and reports missing denominators as null',()=>{
    const base=1000, events=[{event:'game_completed',uid:'coach-123',ts:base},{event:'card_shared'},{event:'card_opened'},{event:'rematch_started_from_card'},{event:'guest_play_started',uid:'coach-123',ts:base+86400000},{event:'guest_play_started',uid:'coach-123',ts:base+6*86400000}];expect(loopNumbers(events)).toEqual({sharesPerCompletedGame:1,cardTapsPerShare:1,playsPerCardTap:1,returnRate:{day2:1,day7:1}});expect(loopNumbers([]).sharesPerCompletedGame).toBeNull();
  });
  it('uses no-op without a vendor and sends only closed properties with an optional configured adapter',async()=>{
    expect(await deliverLoopEvent('game_completed',{})).toEqual({sink:'noop',delivered:false});let body;const r=await deliverLoopEvent('card_shared',{channel:'copy',email:'private'},{posthogKey:'public-test-key',distinctId:'coach-123',fetch:async(_,opts)=>{body=JSON.parse(opts.body);return{ok:true}}});expect(r).toEqual({sink:'posthog',delivered:true});expect(body.properties).not.toHaveProperty('email');
  });
});
