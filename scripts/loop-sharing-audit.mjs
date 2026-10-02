#!/usr/bin/env node
// Reproducible HTTP + actual Chrome sharing audit. No remote writes/deployment.
import { chromium, request } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { legalFive } from "../src/loop/draft/model.js";
import { getFranchiseRoster } from "../src/loop/franchises.js";
const origin = new URL(process.argv[2] || "http://localhost:4175").origin;
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) throw new Error("This audit publishes test results on a local harness only.");
const dir = path.resolve(process.env.ECLASH_SHARE_AUDIT_DIR || "data/validation/loop-foundation/sharing");
await mkdir(dir,{recursive:true});
const checks=[], samples=[], browsers=[], events=[];
const check=(name,ok,detail={})=>{checks.push({name,pass:!!ok,...detail});if(!ok)throw new Error(name)};
const api=await request.newContext({baseURL:origin,extraHTTPHeaders:{Origin:origin}});
const publicApi=await request.newContext({baseURL:origin});
const goldIds=['magic-80s','jordan-90s','bird-80s','duncan-00s','hak-90s'];
const blueIds=['curry-10s','ray-00s','durant-10s','dirk-00s','jokic-20s'];
const uas=['Twitterbot/1.0','facebookexternalhit/1.1','Slackbot-LinkExpanding 1.0'];
const loopModes=['any-five','franchise','tonight','one-franchise','one-per-era','no-mvps','lab','spin','daily','gauntlet'];
const callLoop=async(body)=>{const response=await api.post('/api/game',{data:{...body,action:'loop',simulationId:`share-audit-${crypto.randomUUID()}`}});if(!response.ok())throw new Error(`${body.op} ${response.status()}: ${await response.text()}`);return response.json()};
async function playLoop(mode){
  if(mode==='daily'){
    const started=await callLoop({op:'daily-start'});let state=started.state;
    for(let roll=0;roll<2;roll++)state=(await callLoop({op:'daily-roll',dailyToken:started.dailyToken,holdSlots:[],holdRoles:[]})).state;
    const offer=state.coachDraft.offers[0];await callLoop({op:'daily-coach',dailyToken:started.dailyToken,coachId:offer.coachId||offer.id});
    return callLoop({op:'daily-play',dailyToken:started.dailyToken});
  }
  if(mode==='gauntlet'){const started=await callLoop({op:'gauntlet-start',goldIds});return callLoop({op:'gauntlet-play',gauntletToken:started.gauntletToken,stage:0})}
  let body={op:'play',mode,goldIds,blueIds,eraId:'1990s'};
  if(['franchise','tonight'].includes(mode)){body.goldIds=getFranchiseRoster('boston').map(p=>p.id);body.blueIds=getFranchiseRoster('la-lakers').map(p=>p.id)}
  if(['one-franchise','one-per-era','no-mvps'].includes(mode)){body.franchise=mode==='one-franchise'?'Celtics':'';body.goldIds=legalFive({seed:'sharing-audit',kind:mode,franchise:body.franchise})}
  if(mode==='lab')body.scenario={playerId:goldIds[0],teamLabel:'Private sharing audit scenario'};
  if(mode==='spin'){const start=await callLoop({op:'spin-start'});body.spinReceipt=start.spinReceipt;body.goldIds=legalFive({seed:'sharing-spin',kind:'spin',slots:start.slots});body.hiddenStats=true}
  return callLoop(body);
}
let browser;
try {
  for(let i=0;i<10;i++){
    const loopSet=process.env.ECLASH_SHARE_MODE_SET==='loop',mode=loopSet?loopModes[i]:i===7?'best7':i===8?'82':i===9?'tournament':'single';
    let played;
    if(loopSet){played=await playLoop(mode);check(`sample-${i}: real handler ${mode}`,!!played.resultId)}
    else {const game=await api.post('/api/game',{data:{mode,simulationId:`share-audit-${crypto.randomUUID()}`,goldIds,blueIds,coachGoldId:'phil-jackson',coachBlueId:'gregg-popovich',eraStyleId:'1990s'}});check(`sample-${i}: real handler game`,game.ok(),{status:game.status()});played=await game.json()}
    const publish=await api.post('/api/result',{data:{resultId:played.resultId,publicRecap:true}});check(`sample-${i}: owned publication`,publish.ok(),{status:publish.status()});const shared=await publish.json();
    const recap=await (await api.get(`/api/result?id=${shared.id}`)).json();
    check(`sample-${i}: private fields excluded`,!['session','seed','candidate','fingerprint','chaosDraft','resultId','rating','xp','name'].some(k=>k in recap));
    const html=[];
    for(const ua of uas){
      const response=await publicApi.get(`/card/${shared.id}`,{headers:{'User-Agent':ua}});const body=await response.text();
      check(`sample-${i}: crawler ${ua}`,response.ok()&&body.includes('data-public-recap')&&body.includes(recap.headline)&&body.includes(recap.players.gold[0].name)&&body.includes('summary_large_image')&&!body.includes('http-equiv="refresh"'),{status:response.status()});
      html.push({ua,status:response.status(),bytes:Buffer.byteLength(body)});
      if(ua===uas[0])await writeFile(path.join(dir,`sample-${i}.html`),body);
    }
    const pngPath=`/api/share-page?kind=result&id=${shared.id}&format=png&v=2`;
    const coldStart=performance.now(),cold=await publicApi.get(pngPath),png=await cold.body(),coldMs=performance.now()-coldStart;
    const warmStart=performance.now(),warm=await publicApi.get(pngPath),warmPng=await warm.body(),warmMs=performance.now()-warmStart;
    check(`sample-${i}: 1200x630 PNG below 1MB`,cold.ok()&&png.readUInt32BE(16)===1200&&png.readUInt32BE(20)===630&&png.length<1_000_000,{bytes:png.length});
    check(`sample-${i}: byte-identical warm response below 1s`,png.equals(warmPng)&&warmMs<1000,{coldMs,warmMs});
    await writeFile(path.join(dir,`sample-${i}.png`),png);
    samples.push({index:i,mode,sourceResultId:played.resultId,path:`/card/${shared.id}`,score:recap.score,scope:recap.scope,performers:recap.performers,pngBytes:png.length,coldMs,warmMs,crawlers:html});
  }
  const executablePath=process.env.ECLASH_BROWSER_EXECUTABLE || (existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined);
  browser=await chromium.launch({headless:true,executablePath});
  for(const viewport of [{width:320,height:568},{width:390,height:844},{width:412,height:915},{width:768,height:1024},{width:1440,height:1000}]){
    const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
    // Chromium does not expose Blob sendBeacon postData to Playwright. Observe
    // its unchanged payload before forwarding to the real native transport.
    await context.addInitScript(()=>{window.__loopBeacons=[];const native=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=(url,data)=>{if(String(url).endsWith('/api/events')&&data?.text)void data.text().then(s=>{try{window.__loopBeacons.push(...JSON.parse(s).events)}catch{}});return native(url,data)}});
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('/api/events'))try{events.push(...JSON.parse(r.postData()).events)}catch{}});
    await page.goto(origin+samples[0].path);await page.waitForSelector('[data-public-recap]');
    check(`${viewport.width}: actual result visible`,await page.locator('h1').innerText()===`Gold wins ${samples[0].score.gold}–${samples[0].score.blue}`|| (await page.locator('h1').innerText()).includes(`${samples[0].score.gold}–${samples[0].score.blue}`));
    check(`${viewport.width}: no horizontal overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    check(`${viewport.width}: no page errors`,errors.length===0,{errors});
    await page.screenshot({path:path.join(dir,`recap-${viewport.width}.png`),fullPage:true});
    const cta=page.getByRole('link',{name:'Run it back with your five'});check(`${viewport.width}: guest rematch destination`,(await cta.getAttribute('href')).includes('/clash/any-five?rematch='));
    browsers.push({viewport,context:'fresh Chrome desktop viewport emulation',path:samples[0].path,errors});
    events.push(...await page.evaluate(()=>window.__loopBeacons));
    await context.close();
  }
  check('human open events have no card IDs or names',events.some(e=>e.event==='card_opened')&&events.every(e=>!Object.keys(e).some(k=>['id','resultId','seed','name','lineup'].includes(k))));
} catch(e) { checks.push({name:'audit completion',pass:false,error:e.message});process.exitCode=1; }
finally {
  await browser?.close();await api.dispose();await publicApi.dispose();
  await writeFile(path.join(dir,'report.json'),JSON.stringify({generatedAt:new Date().toISOString(),origin,scope:'Basketball local real-handler memory store; no public Preview or physical-device claim',checks,samples,browsers,events,pass:checks.every(c=>c.pass)},null,2)+'\n');
  console.log(JSON.stringify({dir,checks:checks.length,pass:checks.every(c=>c.pass),samples:samples.length}));
}
