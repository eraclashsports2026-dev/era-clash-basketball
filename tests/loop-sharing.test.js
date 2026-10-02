import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import game from "../api/game.js";
import result from "../api/result.js";
import sharePage, { shareHtml } from "../api/share-page.js";
import { _memReset, getJSON, setJSON } from "../api/_lib/store.js";
import { publicRecapOf, publishOwnedRecap, shareModel } from "../api/_lib/loopShare.js";
import { renderSharePng } from "../api/_lib/loopShareImage.js";
const GOLD = ["magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s"];
const BLUE = ["curry-10s", "ray-00s", "durant-10s", "dirk-00s", "jokic-20s"];
const SESSION = "c".repeat(48);
const res = () => ({ statusCode: 200, headers: {}, body: null, setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(b){this.body=b;return this},send(b){this.body=b;return this},end(){return this} });
const req = (body={}, more={}) => ({ method:"POST", body, query:{}, headers:{host:"eraclash.test",origin:"https://eraclash.test",cookie:`ec_session=${SESSION}`},...more });
async function play(mode="single", preview=true) {
  process.env.PREVIEW_SIM_ENGINE_ENABLED = preview ? "true" : "false";
  const response=res();
  await game(req({mode,simulationId:`share-${mode}-${crypto.randomUUID()}`,goldIds:GOLD,blueIds:BLUE,coachGoldId:"phil-jackson",coachBlueId:"gregg-popovich",eraStyleId:"1990s"}),response);
  expect(response.statusCode).toBe(200);
  return getJSON(`${response.body.resultId.startsWith("pv_")?"preview-result":"result"}:${response.body.resultId}`);
}
async function publish(record, more={}) {
  const response=res(); await result(req({resultId:record.id,publicRecap:true},more),response); return response;
}
beforeEach(()=>{process.env.ECLASH_TEST_MEMORY_STORE="1";process.env.ENABLE_CHAOS_TESTS="true";process.env.SIM_ENGINE_V3_ENABLED="true";_memReset()});

describe("public recap ownership, privacy and immutable authority",()=>{
  it("keeps the new Loop GET projection as private as its POST response without changing its stored record",async()=>{
    process.env.PREVIEW_SIM_ENGINE_ENABLED='true';
    const created=res();await game(req({action:'loop',op:'play',mode:'any-five',goldIds:GOLD,blueIds:BLUE,simulationId:`projection-${crypto.randomUUID()}`}),created);
    expect(created.statusCode).toBe(200);
    const id=created.body.resultId,stored=await getJSON(`preview-result:${id}`),before=JSON.stringify(stored);
    expect(stored).toHaveProperty('seed');expect(stored).toHaveProperty('session');
    const fetched=res();await game(req({}, {method:'GET',query:{id}}),fetched);
    expect(fetched.statusCode).toBe(200);
    for(const response of [created.body.result,fetched.body]){expect(response).not.toHaveProperty('seed');expect(response).not.toHaveProperty('session');expect(response.core.finalScore).toEqual(stored.core.finalScore);expect(response.candidate).toEqual(stored.candidate);expect(response.goldIds).toEqual(stored.goldIds);expect(response.blueIds).toEqual(stored.blueIds);}
    expect(fetched.body).toEqual(created.body.result);expect(JSON.stringify(await getJSON(`preview-result:${id}`))).toBe(before);
  });
  it("never publishes owner-entered Lab scenario text through the unauthenticated full-result GET",async()=>{
    process.env.PREVIEW_SIM_ENGINE_ENABLED='true';
    const privateLabel='Private Lab label for the projection test',created=res();
    await game(req({action:'loop',op:'play',mode:'lab',goldIds:GOLD,blueIds:BLUE,scenario:{teamLabel:privateLabel},simulationId:`lab-projection-${crypto.randomUUID()}`}),created);
    expect(created.statusCode).toBe(200);expect(created.body.result.loop.scenario.teamLabel).toBe(privateLabel);
    const id=created.body.resultId,stored=await getJSON(`preview-result:${id}`),before=JSON.stringify(stored);
    const fetched=res();await game(req({}, {method:'GET',query:{id},headers:{host:'eraclash.test'}}),fetched);
    expect(fetched.statusCode).toBe(200);expect(fetched.body.loop).not.toHaveProperty('scenario');expect(JSON.stringify(fetched.body)).not.toContain(privateLabel);expect(fetched.body.core.finalScore).toEqual(stored.core.finalScore);expect(fetched.body.candidate).toEqual(stored.candidate);expect(JSON.stringify(await getJSON(`preview-result:${id}`))).toBe(before);
  });
  it("preserves the absorbed legacy GET projection, including its existing seed field",async()=>{
    const stored=await play(),fetched=res();await game(req({}, {method:'GET',query:{id:stored.id}}),fetched);
    const {session,...legacyPublic}=stored;expect(fetched.statusCode).toBe(200);expect(fetched.body).toEqual(legacyPublic);expect(fetched.body.seed).toBe(stored.seed);
  });
  it("publishes a freshly generated Candidate 4 score and performers, never a browser snapshot",async()=>{
    const record=await play(); const response=await publish(record);
    expect(response.statusCode).toBe(200); const saved=await getJSON(`re:${response.body.id}`);
    expect(saved.score).toEqual(record.core.finalScore);expect(saved.teamIds).toEqual(record.goldIds);expect(saved.oppIds).toEqual(record.blueIds);
    const leading=[...record.v3.fullBox.gold,...record.v3.fullBox.blue].sort((a,b)=>b.pts-a.pts||a.name.localeCompare(b.name))[0];
    expect(saved.performers[0]).toMatchObject({name:leading.name});expect(saved.performers[0].line).toContain(`${leading.pts} PTS`);
    for(const privateKey of ['session','seed','candidate','fingerprint','chaosDraft','resultId','rating','xp','name','coachIds']) expect(saved).not.toHaveProperty(privateKey);
    expect(JSON.stringify(saved)).not.toContain(SESSION);
    const forged=res();await result(req({result:{teamIds:GOLD,scoreline:"999–0"}}),forged);expect(forged.statusCode).toBe(400);
  });
  it("requires explicit disclosure consent, ownership and same origin",async()=>{
    const record=await play();
    const consent=res();await result(req({resultId:record.id}),consent);expect(consent.statusCode).toBe(400);
    expect((await publish(record,{headers:{host:"eraclash.test",cookie:`ec_session=${"d".repeat(48)}`}})).statusCode).toBe(403);
    expect((await publish(record,{headers:{host:"eraclash.test",origin:"https://evil.test",cookie:`ec_session=${SESSION}`}})).statusCode).toBe(403);
    expect((await publish(record,{headers:{host:"eraclash.test"}})).statusCode).toBe(403);
  });
  it("concurrent publications return one stable URL and leave the engine record untouched",async()=>{
    const record=await play();const before=JSON.stringify(record);
    const all=await Promise.all(Array.from({length:8},()=>publish(record)));
    expect(new Set(all.map(r=>r.body.id)).size).toBe(1);expect(all.every(r=>r.statusCode===200)).toBe(true);
    expect(all.filter(r=>r.body.created).length).toBe(1);
    expect(JSON.stringify(await getJSON(`preview-result:${record.id}`))).toBe(before);
  });
  it("does not claim a successful publication after a failed persistence write",async()=>{
    const record=await play();expect((await publishOwnedRecap({resultId:record.id,session:SESSION,consent:true},{set:async()=>null})).status).toBe("store_unavailable");
  });
  it("a run publication reads its completed owned result and not a caller's replacement resultId",async()=>{
    const record=await play();await setJSON("chaos-run:ownedrun01",{chaosRunId:"ownedrun01",status:"SIMULATED",resultId:record.id,session:SESSION},60);
    const response=res();await result(req({chaosRunId:"ownedrun01",resultId:"forged01",publicRecap:true}),response);expect(response.statusCode).toBe(200);
    const other=res();await result(req({chaosRunId:"missing01",publicRecap:true}),other);expect(other.statusCode).toBe(403);
  });
});

describe("real engine modes have honest score and stat scopes",()=>{
  it("displays a validated Daily date as MM-DD-YYYY while preserving the ISO machine day",async()=>{
    const record=await play();
    const recap=publicRecapOf({...record,loop:{mode:'daily',day:'2026-10-02'}});
    expect(recap.loop.day).toBe('2026-10-02');expect(recap.scope).toContain('Daily Clash 10-02-2026');expect(recap.scope).not.toContain('2026-10-02');
    expect(shareModel(recap).subtitle).toContain('10-02-2026');
    const invalid=publicRecapOf({...record,loop:{mode:'daily',day:'2026-02-30'}});
    expect(invalid.loop).not.toHaveProperty('day');expect(invalid.scope).not.toContain('02-30-2026');
  });
  it("projects only valid server Gauntlet counts with an honest stage-score scope",async()=>{
    const record=await play();
    for(const progress of [{victories:1,totalEras:7,stagesPlayed:1,finished:false},{victories:3,totalEras:7,stagesPlayed:4,finished:true},{victories:7,totalEras:7,stagesPlayed:7,finished:true}]){
      const recap=publicRecapOf({...record,loop:{mode:'gauntlet',stage:progress.stagesPlayed,gauntlet:{...progress,secret:'Never publish user text'}}});
      expect(recap.loop.gauntlet).toEqual(progress);expect(recap.headline).toContain(`${progress.victories} of 7 eras`);expect(shareModel(recap).subtitle).toContain('Latest stage points');
      expect(JSON.stringify(recap)).not.toContain('Never publish user text');expect(recap.score).toEqual(record.core.finalScore);
    }
    for(const progress of [{victories:'7',totalEras:7,stagesPlayed:7,finished:true},{victories:8,totalEras:7,stagesPlayed:7,finished:true},{victories:3,totalEras:8,stagesPlayed:4,finished:true},{victories:4,totalEras:7,stagesPlayed:3,finished:true},{victories:3,totalEras:7,stagesPlayed:4,finished:false},{victories:1,totalEras:7,stagesPlayed:1,finished:true}]){
      const recap=publicRecapOf({...record,loop:{mode:'gauntlet',stage:1,gauntlet:progress}});expect(recap.loop).not.toHaveProperty('gauntlet');expect(recap.headline).not.toContain('of 7 eras');
    }
  });
  it("publishes real Gauntlet progress derived after an unchanged server simulation",async()=>{
    process.env.PREVIEW_SIM_ENGINE_ENABLED='true';
    const started=res();await game(req({action:'loop',op:'gauntlet-start',goldIds:GOLD}),started);expect(started.statusCode).toBe(200);
    const played=res();await game(req({action:'loop',op:'gauntlet-play',gauntletToken:started.body.gauntletToken,stage:0,simulationId:`share-gauntlet-${crypto.randomUUID()}`}),played);expect(played.statusCode).toBe(200);
    const record=await getJSON(`preview-result:${played.body.resultId}`);
    const published=await publish(record);expect(published.statusCode).toBe(200);
    const recap=await getJSON(`re:${published.body.id}`);
    expect(recap.loop.gauntlet).toEqual({victories:played.body.gauntlet.victories,totalEras:7,stagesPlayed:1,finished:played.body.gauntlet.done});
    expect(recap.headline).toContain(`${played.body.gauntlet.victories} of 7 eras`);expect(recap.score).toEqual(record.core.finalScore);
    const image=renderSharePng(shareModel(recap));expect(image.readUInt32BE(16)).toBe(1200);expect(image.length).toBeLessThan(1_000_000);
  });
  it.each(['single','best7','82','tournament'])("projects a freshly computed %s record",async(mode)=>{
    const record=await play(mode,false);const recap=publicRecapOf(record);expect(recap).not.toBeNull();
    expect(recap.players.gold.map(p=>p.id)).toEqual(record.goldIds);expect(recap.players.blue).toHaveLength(5);
    if(mode==='best7'){expect(recap.score).toEqual(record.core.seriesScore);expect(recap.statScope).toBe('series');expect(recap.performers[0].line).toContain('/ game')}
    else if(mode==='82'){expect(recap.score).toEqual({gold:record.wins,blue:record.losses});expect(recap.scope).toMatch(/finale/);expect(recap.statScope).toBe('season finale')}
    else if(mode==='tournament'){expect(recap.score).toEqual(record.rounds.at(-1).core.seriesScore);expect(recap.scope).toContain(record.rounds.at(-1).name);expect(recap.players.blue.map(p=>p.id)).toEqual(record.rounds.at(-1).oppIds)}
    else expect(recap.score).toEqual(record.core.finalScore);
  });
  it.each(['any-five','lab'])("publishes a real %s adapter result with a closed mode label",async(mode)=>{
    process.env.PREVIEW_SIM_ENGINE_ENABLED='true';
    const response=res();await game(req({action:'loop',op:'play',mode,simulationId:`sharing-loop-${crypto.randomUUID()}`,goldIds:GOLD,blueIds:BLUE,eraId:'1990s',scenario:{playerId:GOLD[0],teamLabel:'Private imagined team'}}),response);
    expect(response.statusCode).toBe(200);
    const record=await getJSON(`preview-result:${response.body.resultId}`);
    const published=await publish(record),recap=await getJSON(`re:${published.body.id}`);
    expect(recap.displayMode).toBe(mode);expect(recap.loop).toEqual({mode,tag:mode==='lab'?'LAB':'ANY_FIVE'});
    expect(JSON.stringify(recap)).not.toContain('Private imagined team');expect(recap.scope).toContain(mode==='lab'?'Imagined scenario':'Clash Any Five');
    expect(recap.score).toEqual(record.core.finalScore);
  });
});

describe("crawlable real-result HTML and deterministic PNG",()=>{
  it("three real game URLs serve result HTML to all three crawler user agents",async()=>{
    for(let i=0;i<3;i++){
      const record=await play();const published=await publish(record);const id=published.body.id;
      for(const ua of ['Twitterbot/1.0','facebookexternalhit/1.1','Slackbot-LinkExpanding 1.0']){
        const response=res();await sharePage(req({}, {method:'GET',query:{kind:'result',id},headers:{host:'eraclash.test','user-agent':ua}}),response);
        expect(response.statusCode).toBe(200);expect(response.body).toContain(record.core.finalScore.gold.toString());expect(response.body).toContain(record.v3.fullBox.gold[0].name);
        expect(response.body).toContain('summary_large_image');expect(response.body).toContain('og:image:width');expect(response.body).not.toContain('http-equiv="refresh"');
        expect(response.body).toContain(`/clash/any-five?rematch=${id}`);
      }
      const image=res();await sharePage(req({}, {method:'GET',query:{kind:'result',id,format:'png'},headers:{host:'eraclash.test'}}),image);
      expect(image.headers['Content-Type']).toBe('image/png');expect(image.body.readUInt32BE(16)).toBe(1200);expect(image.body.readUInt32BE(20)).toBe(630);expect(image.body.length).toBeLessThan(1_000_000);
    }
  });
  it("warm image generation is byte-identical and below one second",async()=>{
    const model=shareModel(publicRecapOf(await play()));const first=renderSharePng(model);const start=performance.now();
    expect(renderSharePng(model).equals(first)).toBe(true);expect(performance.now()-start).toBeLessThan(1000);
  });
  it("missing pages are no-store, invalid hosts are rejected and text is escaped",async()=>{
    const missing=res();await sharePage(req({}, {method:'GET',query:{id:'missing0'},headers:{host:'eraclash.test'}}),missing);expect(missing.statusCode).toBe(404);expect(missing.headers['Cache-Control']).toBe('no-store');
    const invalid=res();await sharePage(req({}, {method:'GET',query:{id:'missing0'},headers:{host:'bad"><script>alert(1)</script>'}}),invalid);expect(invalid.statusCode).toBe(400);
    const html=shareHtml({model:{title:'<script>alert(1)</script>',subtitle:'" onload="evil',players:{gold:[],blue:[]}},origin:'https://eraclash.test',path:'/card/abc123',image:'/image.png',play:'/play'});
    expect(html).not.toContain('<script>alert(1)</script>');expect(html).toContain('&lt;script&gt;');
  });
  it("invitations do not disclose the creator's five or game performers",async()=>{
    await setJSON('ch:invite01',{challenger:{name:'Private Name',teamIds:GOLD},mvp:'Michael Jordan',seed:9181},60);
    const response=res();await sharePage(req({}, {method:'GET',query:{kind:'challenge',id:'invite01'},headers:{host:'eraclash.test'}}),response);
    expect(response.statusCode).toBe(200);for(const hidden of ['Private Name','Michael Jordan','Magic Johnson','9181'])expect(response.body).not.toContain(hidden);
  });
  it("the static homepage advertises a real original 1200×630 PNG",()=>{
    const home=readFileSync('index.html','utf8'),png=readFileSync('public/og-home.png');expect(home).toContain('property="og:image"');expect(home).toContain('/og-home.png');expect(png.readUInt32BE(16)).toBe(1200);expect(png.readUInt32BE(20)).toBe(630);expect(png.length).toBeLessThan(1_000_000);
  });
});
