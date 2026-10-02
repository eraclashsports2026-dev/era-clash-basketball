import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const root='/private/tmp/eraclash-run3-final-20261002';
const out=path.join(root,'data/validation/loop-foundation/browser-audit/run3-independent-dc926ad/native-and-naming-reverify');
await fs.mkdir(out,{recursive:true});
const {chromium,devices}=createRequire(path.join(root,'package.json'))('@playwright/test');
const {FRANCHISES,FRANCHISE_PAIRINGS,getFranchiseRoster,franchiseDisplayName}=await import(pathToFileURL(path.join(root,'src/loop/franchises.js')));
const {parseHtmlMetadata,PROFILE_DEFINITIONS}=await import(pathToFileURL(path.join(root,'scripts/loop/fullBrowserAudit.mjs')));
const normal=JSON.parse(await fs.readFile(path.join(root,'data/validation/loop-foundation/sharing/run3-independent-dc926ad/report.json')));
const neutral=JSON.parse(await fs.readFile(path.join(root,'data/validation/loop-foundation/sharing/run3-independent-dc926ad-neutral-on/report.json')));
const inventory=JSON.parse(await fs.readFile(path.join(root,'data/validation/loop-foundation/browser-audit/run3-independent-dc926ad-fullcrawl/inventory.json')));
const checks=[],native=[],naming=[],crawler=[];
const check=(name,pass,detail={})=>checks.push({name,status:pass?'PASS':'FAIL',...detail});
const sha=value=>createHash('sha256').update(value).digest('hex');
const report={generatedAt:new Date().toISOString(),sourceSHA:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),scope:'Fresh Chromium device emulation and local actual-handler memory stores; no real provider or physical device claim',normalOrigin:normal.origin,neutralOrigin:neutral.origin,checks,native,naming,crawler};
report.reverificationReason='The first independent instrument compared raw HTML against unescaped apostrophes and inspected a four-second event queue before flush; original raw findings remain preserved. This recheck decodes server HTML entities and observes the actual event transport across navigation after its native queue delay.';
report.runnerSHA256=sha(await fs.readFile(new URL(import.meta.url)));
report.distBuildStamp=(await fs.readFile(path.join(root,'dist/index.html'),'utf8')).match(/name="eraclash-build" content="([^"]+)"/)?.[1];
report.runtimeSHA=report.sourceSHA;
report.runtimeSHAAttribution='Root-owned source attestation; separately read source HEAD, dist stamp and served stamps, not a server-provided SHA field';
report.origins=[];
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const contextFor=p=>browser.newContext({...devices[p.device],viewport:p.viewport,isMobile:p.mobile,hasTouch:p.mobile,serviceWorkers:'block',locale:'en-US',timezoneId:'America/New_York'});
const settle=async(page,url)=>{await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForLoadState('networkidle',{timeout:6000}).catch(()=>{});await page.evaluate(()=>document.fonts.ready);};
try {
 for(const p of PROFILE_DEFINITIONS.filter(p=>p.mobile)) {
  const context=await contextFor(p),page=await context.newPage(),row={profile:p.id,viewport:p.viewport,constraintTrail:[],coach:[]};native.push(row);
  try {
   await settle(page,normal.origin+'/');row.constraintTrail.push({path:new URL(page.url()).pathname,taps:0});
   await page.getByRole('link',{name:'All modes',exact:true}).tap();await page.getByRole('heading',{name:'Find your next Clash',exact:true}).waitFor();row.constraintTrail.push({path:new URL(page.url()).pathname,taps:1});
   await page.getByRole('link',{name:'Open Constraint filters →',exact:true}).tap();await page.getByRole('heading',{name:'Choose a constraint',exact:true}).waitFor();row.constraintTrail.push({path:new URL(page.url()).pathname,taps:2});
   await page.getByRole('link',{name:'Play One Franchise →',exact:true}).tap();await page.getByRole('heading',{name:'One Franchise',exact:true}).waitFor();row.constraintTrail.push({path:new URL(page.url()).pathname,taps:3});
   check(`${p.id}: concrete One Franchise reachable in at most two taps from home`,row.constraintTrail.at(-1).taps<=2,{trail:row.constraintTrail,criterion:'Definition of done: reachable from home in ≤2 taps'});
   await page.screenshot({path:path.join(out,`${p.id}-constraint.png`),fullPage:true});
   await settle(page,normal.origin+'/?scenario=w1-s1');
   await page.getByRole('button',{name:'Edit coaches',exact:true}).waitFor({timeout:15000});
   await page.getByRole('button',{name:'Edit coaches',exact:true}).tap();
   const changes=page.getByRole('button',{name:'Change coach',exact:true});await changes.first().waitFor();
   row.coach=await changes.evaluateAll(xs=>xs.map(x=>({label:x.innerText,width:x.getBoundingClientRect().width,height:x.getBoundingClientRect().height,minHeight:getComputedStyle(x).minHeight})));
   check(`${p.id}: selected-coach target both dimensions at least 44px`,row.coach.length===2&&row.coach.every(x=>x.width>=44&&x.height>=44),{targets:row.coach,setup:'Actual product guided-scenario legal roster/coach preload; no result or score injected'});
   await changes.first().tap();await page.getByRole('dialog',{name:'Select coach for Team Gold'}).waitFor();row.coachTapOpenedDialog=true;check(`${p.id}: native Change coach tap opens real dialog`,true);
   await page.screenshot({path:path.join(out,`${p.id}-coach.png`),fullPage:true});
   await page.getByRole('button',{name:'Close coach selection'}).tap();
  }catch(error){row.error=error.message;checks.push({name:`${p.id}: native targeted journey completed`,status:'UNVERIFIED',reason:error.message});}
  finally {await context.close();}
 }
 const context=await contextFor(PROFILE_DEFINITIONS.find(p=>p.id==='iphone-14')),page=await context.newPage(),eventPayloads=[],httpEvents=[];
 await context.exposeBinding('__recordNativeAuditEvents',(_,batch)=>eventPayloads.push(...batch));
 await context.addInitScript(()=>{window.__nativeAuditEvents=[];const original=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=(url,data)=>{if(String(url).endsWith('/api/events')&&data?.text)void data.text().then(s=>{try{window.__nativeAuditEvents.push(...JSON.parse(s).events);void window.__recordNativeAuditEvents(JSON.parse(s).events)}catch{}});return original(url,data);};});
 page.on('response',async res=>{if(new URL(res.url()).pathname==='/api/events')httpEvents.push({httpStatus:res.status()});});
 const rematch={profile:'iphone-14',freshGuest:true,initialCard:normal.samples[0].path};report.rematch=rematch;
 try {
  const publicRecap=await(await context.request.get(normal.origin+'/api/result?id='+normal.samples[0].path.split('/').at(-1))).json();
  await settle(page,normal.origin+rematch.initialCard);
  await page.getByRole('link',{name:'Run it back with your five',exact:true}).tap();
  await page.getByRole('heading',{name:'Clash Any Five',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('select[aria-label="Opponent"]')?.value==='rematch');
  rematch.destination=page.url();rematch.opponent=await page.getByLabel('Opponent',{exact:true}).inputValue();
  check('Fresh guest card CTA loads the actual shared five as opponent',rematch.opponent==='rematch'&&publicRecap.teamIds?.length===5,{sharedTeamIds:publicRecap.teamIds,destination:rematch.destination});
  const notice=await page.locator('.loop-notice').filter({hasText:'Run it back against the shared five:'}).innerText();
  check('Guest rematch notice contains all five actual shared player names',publicRecap.players.gold.every(p=>notice.includes(p.name)),{notice});
  await page.getByRole('button',{name:'Fill a playable example',exact:true}).tap();
  const fill=await page.locator('.loop-selected').evaluateAll(xs=>xs.map(x=>({name:x.querySelector('strong')?.textContent,details:x.querySelector('small')?.textContent})));
  check('Fresh guest rematch fills all five real player cards',fill.length===5&&fill.every(x=>x.name&&x.details),{slots:fill});
  const gamePromise=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/game'&&r.request().method()==='POST'&&r.request().postDataJSON()?.op==='play',{timeout:45000});
  await page.getByRole('button',{name:'Run this five',exact:true}).tap();
  const response=await gamePromise,payload=await response.json(),submitted=response.request().postDataJSON();
  rematch.httpStatus=response.status();rematch.resultId=payload.resultId;rematch.submitted={mode:submitted.mode,goldIds:submitted.goldIds,blueIds:submitted.blueIds};
  check('Actual guest rematch request uses the shared opponent IDs',response.ok()&&JSON.stringify(submitted.blueIds)===JSON.stringify(publicRecap.teamIds),{httpStatus:response.status(),submitted:rematch.submitted});
  await page.getByRole('region',{name:'Completed Clash'}).waitFor({timeout:20000});
  const rendered=await page.getByRole('region',{name:'Completed Clash'}).innerText();
  rematch.score=payload.result?.core?.finalScore;rematch.recordId=payload.result?.id;rematch.actualMode=payload.result?.loop?.mode;
  check('Guest rematch completed from an actual server record with matching visible score',response.ok()&&!!payload.resultId&&rematch.actualMode==='any-five'&&rendered.includes(`${rematch.score.gold}–${rematch.score.blue}`),{resultId:rematch.resultId,score:rematch.score,actualMode:rematch.actualMode});
  const card=page.getByRole('region',{name:'Completed Clash'}).getByRole('link',{name:'Open result card',exact:true});await card.waitFor({timeout:20000});
  rematch.newCard=await card.getAttribute('href');check('Guest rematch publishes a new actual public card',!!rematch.newCard&&!rematch.newCard.endsWith(rematch.initialCard),{newCard:rematch.newCard,initialCard:rematch.initialCard});
  await page.waitForTimeout(4500);
  rematch.events=eventPayloads;rematch.eventResponses=httpEvents;
  check('Actual rematch flow emits anonymous game and mode events',eventPayloads.some(e=>e.event==='game_completed')&&eventPayloads.some(e=>e.event==='guest_play_started')&&eventPayloads.every(e=>!Object.keys(e).some(k=>['id','resultId','seed','name','lineup'].includes(k))),{events:eventPayloads.map(e=>e.event),responses:httpEvents});
  await page.screenshot({path:path.join(out,'guest-rematch-completed.png'),fullPage:true});
 }catch(error){rematch.error=error.message;checks.push({name:'Actual guest rematch journey completed',status:'UNVERIFIED',reason:error.message});}
 finally{await context.close();}
 for(const [label,sharing,neutralNaming] of [['off',normal,false],['on',neutral,true]]){
  const origin=sharing.origin,context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),page=await context.newPage();
  const html=await(await context.request.get(origin+'/')).text();report.origins.push({label,origin,servedBuildStamp:html.match(/name="eraclash-build" content="([^"]+)"/)?.[1],servedHtmlSHA256:sha(html)});
  for(const route of inventory.routes.filter(r=>!['programmatic','result'].includes(r.kind)&&r.access!=='owner-only')){
   const row={label,path:route.path};naming.push(row);
   try{await settle(page,origin+route.path);const text=await page.locator('body').innerText();row.leagueNames=text.match(/\bNBA\b|National Basketball Association/g)||[];check(`${label} ${route.path}: no league-named visible product copy`,row.leagueNames.length===0,{matches:row.leagueNames});}
   catch(error){row.status='UNVERIFIED';row.reason=error.message;checks.push({name:`${label} ${route.path}: naming observed`,status:'UNVERIFIED',reason:error.message});}
  }
  await settle(page,origin+'/clash/franchise');
  const options=await page.getByLabel('Gold franchise',{exact:true}).locator('option').evaluateAll(xs=>xs.map(x=>({value:x.value,text:x.textContent})));
  check(`${label}: all 30 franchise choices use source-derived names and preserve IDs`,options.length===30&&FRANCHISES.every(f=>options.some(o=>o.value===f.id&&o.text===franchiseDisplayName(f,{neutralNaming}))),{options});
  for(const sample of sharing.samples){
   const id=sample.path.split('/').at(-1),recap=await(await context.request.get(origin+'/api/result?id='+id)).json();
   await settle(page,origin+sample.path);const text=await page.locator('body').innerText();
   check(`${label} ${sample.mode}: public card retains actual handler score and all ten player names`,recap.score?.gold===sample.score?.gold&&recap.score?.blue===sample.score?.blue&&recap.players.gold.length===5&&recap.players.blue.length===5&&[...recap.players.gold,...recap.players.blue].every(p=>text.includes(p.name))&&await page.locator('h1').innerText()===recap.headline&&text.includes(recap.scope),{path:sample.path,score:recap.score,teamIds:recap.teamIds,oppIds:recap.oppIds,scope:recap.scope});
  }
  const uas=['Twitterbot/1.0','facebookexternalhit/1.1','Slackbot-LinkExpanding 1.0'];
  for(const pairing of FRANCHISE_PAIRINGS){
   const gold=franchiseDisplayName(pairing.goldId,{neutralNaming}).replace(' · All-time',''),blue=franchiseDisplayName(pairing.blueId,{neutralNaming}).replace(' · All-time','');
   const expectedTitle=`${gold} vs ${blue}`;
   for(const ua of uas){
    const response=await context.request.get(origin+pairing.path,{headers:{'User-Agent':ua}}),body=await response.text(),metadata=parseHtmlMetadata(body),decodedBody=body.replace(/&#39;/g,"'").replace(/&quot;/g,'\"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
    const row={label,path:pairing.path,ua,httpStatus:response.status(),htmlSHA256:sha(body),title:metadata.metas['og:title'],canonical:metadata.canonical,expectedTitle};crawler.push(row);
    check(`${label} ${pairing.slug} ${ua}: actual initial HTML names, canonical and all ten identities`,response.ok()&&metadata.metas['og:title']===expectedTitle&&metadata.canonical===origin+pairing.path&&[...getFranchiseRoster(pairing.goldId),...getFranchiseRoster(pairing.blueId)].every(p=>decodedBody.includes(p.name))&&!/http-equiv="refresh"/i.test(body),row);
   }
  }
  for(const ua of uas){const response=await context.request.get(origin+'/',{headers:{'User-Agent':ua}}),html=await response.text(),metadata=parseHtmlMetadata(html);check(`${label}: homepage ${ua} initial HTML social metadata`,response.ok()&&metadata.canonical===origin+'/'&&metadata.metas['twitter:card']==='summary_large_image'&&['og:title','og:description','og:image','og:url','description'].every(k=>metadata.metas[k]),{httpStatus:response.status(),metadata});}
  await context.close();
 }
}catch(error){report.infrastructureError=error.stack;checks.push({name:'Targeted audit completion',status:'UNVERIFIED',reason:error.message});}
finally{await browser.close();report.counts=Object.fromEntries(['PASS','FAIL','UNVERIFIED'].map(s=>[s,checks.filter(c=>c.status===s).length]));report.endedAt=new Date().toISOString();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({out,counts:report.counts,native:native.length,naming:naming.length,crawler:crawler.length}));}
