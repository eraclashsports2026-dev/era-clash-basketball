import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const root='/private/tmp/eraclash-run3-final-20261002',origin='http://localhost:4320',out=path.join(root,'data/validation/loop-foundation/browser-audit/run3-independent-dc926ad/axe-scroll-recheck');await fs.mkdir(out,{recursive:true});
const {chromium,devices}=createRequire(path.join(root,'package.json'))('@playwright/test'),axeSource=await fs.readFile('/private/tmp/eraclash-browser-audit-tools/node_modules/axe-core/axe.min.js','utf8');
const rawDir=path.join(root,'data/validation/loop-foundation/browser-audit/run3-independent-dc926ad-fullcrawl/routes');
const raw=[];for(const file of await fs.readdir(rawDir)){const row=JSON.parse(await fs.readFile(path.join(rawDir,file)));for(const i of row.interactions||[])if(i.axe?.serious||i.axe?.critical)raw.push({file,path:row.path,profile:row.profile,name:i.name,tag:i.tag,index:i.index,violations:i.axe.violations});}
const rows=[];const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
for(const sample of raw){
 const mobile=sample.profile!=='desktop',viewport=sample.profile==='desktop'?{width:1440,height:1000}:sample.profile==='iphone-se'?{width:320,height:568}:sample.profile==='iphone-14'?{width:390,height:844}:sample.profile==='iphone-pro-max'?{width:430,height:932}:{width:412,height:915};
 const context=await browser.newContext({...mobile?devices['iPhone SE']:{},viewport,isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'}),page=await context.newPage(),row={...sample,viewport,stages:[]};rows.push(row);
 const capture=async name=>{await page.evaluate(axeSource);const result=await page.evaluate(async()=>{const a=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']}});return{critical:a.violations.filter(x=>x.impact==='critical').length,serious:a.violations.filter(x=>x.impact==='serious').length,violations:a.violations.map(x=>({id:x.id,impact:x.impact,nodes:x.nodes.map(n=>({target:n.target,html:n.html,failureSummary:n.failureSummary}))})),scrollY:window.scrollY,inputs:[...document.querySelectorAll('[data-testid^="loop-player-"]')].map(e=>({testId:e.getAttribute('data-testid'),rect:e.getBoundingClientRect().toJSON()}))};});row.stages.push({name,...result});};
 try{
  await page.goto(origin+sample.path,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);await capture('initial top');
  if(sample.tag==='summary'){const summary=page.locator('summary').filter({hasText:sample.name});if(mobile)await summary.tap();else await summary.click();}
  else{const index=sample.violations[0]?.nodes?.[0]?.html?.match(/data-testid="loop-player-(\d+)"/)?.[1];const input=page.getByTestId(`loop-player-${index||0}`);await input.fill('Jordan');}
  await page.waitForTimeout(350);await capture('after actual control');await page.screenshot({path:path.join(out,`${rows.length}-after-control.png`),fullPage:false});
  await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(350);await capture('same expanded content scrolled to top');
 }catch(error){row.error=error.message;}finally{await context.close();}
}
await browser.close();const report={generatedAt:new Date().toISOString(),origin,sourceSHA:'dc926adaeebd573f435263265f4251f1814cc0a5',runnerSHA256:createHash('sha256').update(await fs.readFile(new URL(import.meta.url))).digest('hex'),scope:'Bounded fresh native-control recheck of serious axe findings discovered so far; original complete crawl is still running and remains unchanged',rows};await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({out,rows:rows.length,stages:rows.flatMap(r=>r.stages).map(s=>({name:s.name,critical:s.critical,serious:s.serious}))}));
