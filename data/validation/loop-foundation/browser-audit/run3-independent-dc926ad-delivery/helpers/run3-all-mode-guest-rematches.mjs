import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const root='/private/tmp/eraclash-run3-final-20261002',origin='http://localhost:4320';
const out=path.join(root,'data/validation/loop-foundation/browser-audit/run3-independent-dc926ad/all-mode-guest-rematches');await fs.mkdir(out,{recursive:true});
const {chromium,devices}=createRequire(path.join(root,'package.json'))('@playwright/test');
const {PROFILE_DEFINITIONS}=await import(pathToFileURL(path.join(root,'scripts/loop/fullBrowserAudit.mjs')));
const {PLAYERS}=await import(pathToFileURL(path.join(root,'src/players.js')));
const sharing=JSON.parse(await fs.readFile(path.join(root,'data/validation/loop-foundation/sharing/run3-independent-dc926ad/report.json')));
const checks=[],journeys=[],constraints=[];
const check=(name,value,detail={})=>{checks.push({name,status:value?'PASS':'FAIL',...detail});if(!value)throw Error(name);};
const sourceSHA=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const report={generatedAt:new Date().toISOString(),origin,sourceSHA,runtimeSHA:sourceSHA,runtimeSHAAttribution:'Fresh root runtime/build attestation plus independent served stamp and current source HEAD; no self-reported runtime SHA endpoint',runnerSHA256:createHash('sha256').update(await fs.readFile(new URL(import.meta.url))).digest('hex'),distBuildStamp:(await fs.readFile(path.join(root,'dist/index.html'),'utf8')).match(/name="eraclash-build" content="([^"]+)"/)?.[1],scope:'Actual local handlers and fresh guest browser identities; Chromium iPhone14 emulation, no real account/provider/device scope',checks,journeys,constraints};
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const selectedIds=['curry-10s','ray-00s','durant-10s','dirk-00s','jokic-20s'];
const settle=async(page,url)=>{await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForLoadState('networkidle',{timeout:6000}).catch(()=>{});await page.evaluate(()=>document.fonts.ready);};
try{
 for(const p of PROFILE_DEFINITIONS.filter(p=>p.mobile))for(const [key,title] of [['one-franchise','One Franchise'],['one-per-era','One Per Era'],['no-mvps','No MVPs']]){
  const context=await browser.newContext({...devices[p.device],viewport:p.viewport,isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),row={profile:p.id,key,trail:[]};constraints.push(row);
  try{
   await settle(page,origin+'/');row.homeVisibleLinks=await page.locator('a:visible').evaluateAll(xs=>xs.map(x=>({name:x.innerText,href:x.getAttribute('href')})));row.trail.push({path:new URL(page.url()).pathname,taps:0});
   await page.getByRole('link',{name:'All modes',exact:true}).tap();await page.getByRole('heading',{name:'Find your next Clash'}).waitFor();row.hubVisibleLinks=await page.locator('a:visible').evaluateAll(xs=>xs.map(x=>({name:x.innerText,href:x.getAttribute('href')})));row.trail.push({path:new URL(page.url()).pathname,taps:1});
   await page.getByRole('link',{name:'Open Constraint filters →',exact:true}).tap();await page.getByRole('heading',{name:'Choose a constraint'}).waitFor();row.trail.push({path:new URL(page.url()).pathname,taps:2});
   await page.getByRole('link',{name:`Play ${title} →`,exact:true}).tap();await page.getByRole('heading',{name:title,exact:true}).waitFor();row.trail.push({path:new URL(page.url()).pathname,taps:3});
   const pass=row.trail.at(-1).taps<=2;checks.push({name:`${p.id}: ${title} mobile home entry within two taps`,status:pass?'PASS':'FAIL',trail:row.trail,criterion:'User C.7 requires every mode in two taps from mobile home; no direct home/hub variant link visible in recorded inventories'});
   check(`${p.id}: ${title} third tap opens actual intended route`,new URL(page.url()).pathname===`/clash/${key}`,{trail:row.trail});
  }catch(error){row.error=error.message;checks.push({name:`${p.id}: ${key} reachability observed`,status:'UNVERIFIED',reason:error.message});}
  finally{await context.close();}
 }
 for(const sample of sharing.samples){
  const context=await browser.newContext({...devices['iPhone 14'],viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',permissions:['clipboard-read','clipboard-write']}),page=await context.newPage(),events=[],responses=[],errors=[],row={sourceMode:sample.mode,initialCard:sample.path,freshGuest:true};journeys.push(row);
  await context.exposeBinding('__observeRun3Events',(_,batch)=>events.push(...batch));
  await context.addInitScript(()=>{const native=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=(url,data)=>{if(String(url).endsWith('/api/events')&&data?.text)void data.text().then(s=>{try{void window.__observeRun3Events(JSON.parse(s).events)}catch{}});return native(url,data);};});
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(new URL(r.url()).pathname==='/api/events')responses.push({httpStatus:r.status()});});
  try{
   check(`${sample.mode}: rematch context starts without creator/account cookies`,(await context.cookies()).length===0);
   const publicRecap=await(await context.request.get(origin+'/api/result?id='+sample.path.split('/').at(-1))).json();
   await settle(page,origin+sample.path);check(`${sample.mode}: actual source public recap matches heading/score/ten player names`,await page.locator('h1').innerText()===publicRecap.headline&&[...publicRecap.players.gold,...publicRecap.players.blue].every(p=>publicRecap.teamIds.includes(p.id)||publicRecap.oppIds.includes(p.id)),{score:publicRecap.score,teamIds:publicRecap.teamIds,oppIds:publicRecap.oppIds});
   await page.getByRole('link',{name:'Run it back with your five',exact:true}).tap();await page.getByRole('heading',{name:'Clash Any Five',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('select[aria-label="Opponent"]')?.value==='rematch');
   check(`${sample.mode}: card CTA retains correct reference and starts an empty guest five`,new URL(page.url()).searchParams.get('rematch')===sample.path.split('/').at(-1)&&await page.locator('.loop-selected').count()===0);
   for(let i=0;i<selectedIds.length;i++){const player=PLAYERS.find(p=>p.id===selectedIds[i]);await page.getByTestId(`loop-player-${i}`).fill(player.name);const option=page.getByRole('option').filter({hasText:player.name}).filter({hasText:player.decade});check(`${sample.mode}: typed ${player.name} resolves explicit ${player.decade} choice`,await option.count()===1);await option.tap();}
   const cards=await page.locator('.loop-selected strong').allTextContents();check(`${sample.mode}: five actual typed guest cards visible`,cards.length===5&&selectedIds.every(id=>cards.includes(PLAYERS.find(p=>p.id===id).name)),{cards});
   const gamePromise=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/game'&&r.request().method()==='POST'&&r.request().postDataJSON()?.op==='play',{timeout:45000});await page.getByRole('button',{name:'Run this five',exact:true}).tap();const response=await gamePromise,payload=await response.json(),submitted=response.request().postDataJSON();
   check(`${sample.mode}: actual guest rematch has correct chosen and shared fives`,response.ok()&&JSON.stringify(submitted.goldIds)===JSON.stringify(selectedIds)&&JSON.stringify(submitted.blueIds)===JSON.stringify(publicRecap.teamIds),{httpStatus:response.status(),submitted:{mode:submitted.mode,goldIds:submitted.goldIds,blueIds:submitted.blueIds}});
   const result=page.getByRole('region',{name:'Completed Clash'});await result.waitFor({timeout:20000});const score=payload.result.core.finalScore;check(`${sample.mode}: new actual server result has rendered exact score`,!!payload.resultId&&(await result.innerText()).includes(`${score.gold}–${score.blue}`),{resultId:payload.resultId,score});
   const open=result.getByRole('link',{name:'Open result card',exact:true});await open.waitFor({timeout:20000});row.newCard=await open.getAttribute('href');row.resultId=payload.resultId;row.score=score;row.submitted={mode:submitted.mode,goldIds:submitted.goldIds,blueIds:submitted.blueIds};
   check(`${sample.mode}: new guest public URL differs from source card`,new URL(row.newCard,origin).pathname!==sample.path);
   await result.getByRole('button',{name:'Copy card link',exact:true}).tap();check(`${sample.mode}: real clipboard action confirms copied link`,await result.getByRole('button',{name:'Link copied',exact:true}).count()===1);
   await page.waitForTimeout(4500);await open.tap();await page.locator('[data-public-recap]').waitFor();const shown=await page.locator('.score').allTextContents(),body=await page.locator('body').innerText();check(`${sample.mode}: new guest public recap renders actual score and both real fives`,shown[0]===String(score.gold)&&shown[1]===String(score.blue)&&[...submitted.goldIds,...submitted.blueIds].every(id=>body.includes(PLAYERS.find(p=>p.id===id).name))&&await page.locator('.sides li').count()===10);
   check(`${sample.mode}: completed guest flow no overflow or runtime errors`,errors.length===0&&await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),{errors});
   await page.screenshot({path:path.join(out,`${sample.mode}-guest-rematch-card.png`),fullPage:true});
   row.events=events;row.eventResponses=responses;row.errors=errors;row.status='PASS';
   console.log(JSON.stringify({mode:sample.mode,newCard:new URL(row.newCard,origin).pathname,events:[...new Set(events.map(e=>e.event))]}));
  }catch(error){row.status='UNVERIFIED';row.error=error.message;checks.push({name:`${sample.mode}: complete actual guest rematch flow`,status:'UNVERIFIED',reason:error.message});}
  finally{await context.close();}
 }
}catch(error){report.infrastructureError=error.stack;}
finally{await browser.close();report.endedAt=new Date().toISOString();report.counts=Object.fromEntries(['PASS','FAIL','UNVERIFIED'].map(s=>[s,checks.filter(c=>c.status===s).length]));await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({out,counts:report.counts,journeys:journeys.length,constraints:constraints.length}));}
