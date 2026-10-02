import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const checkout='/private/tmp/eraclash-run3-final-20261002', origin='http://localhost:4320', label='run3-independent-dc926ad';
const output=resolve(checkout,'data/validation/loop-foundation/browser-audit',label,'quiet-lighthouse');
await mkdir(output,{recursive:true});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const buildFrom=html=>html.match(/<meta\s+name="eraclash-build"\s+content="([^"]+)"/i)?.[1]||null;
const report={label,scope:'Quiet independent Run3 mobile Lighthouse: local production-build client plus actual handlers and memory store; fresh actual guest result. No hosted provider, SMTP, RLS or physical-device acceptance.',startedAt:new Date().toISOString(),origin,executionCheckout:checkout,sourceSHA:execFileSync('git',['rev-parse','HEAD'],{cwd:checkout,encoding:'utf8'}).trim(),runnerSHA256:digest(await readFile(fileURLToPath(import.meta.url))),productionBuildStamp:buildFrom(await readFile(resolve(checkout,'dist/index.html'),'utf8')),fixtureBuildStamp:buildFrom(await readFile(resolve(checkout,'dist-fixtures/index.html'),'utf8')),checks:[],errors:[],targets:[]};
if(report.sourceSHA!=='dc926adaeebd573f435263265f4251f1814cc0a5')throw Error('Frozen source identity mismatch');
const save=()=>writeFile(resolve(output,'quiet-lighthouse.json'),JSON.stringify(report,null,2)+'\n');
await save();
try{
 const healthResponse=await fetch(origin+'/api/health');report.runtimeHealth={httpStatus:healthResponse.status,data:await healthResponse.json()};
 const served=await fetch(origin+'/');const shell=await served.text();report.servedBuildStamp=buildFrom(shell);report.servedHTMLSHA256=digest(shell);if(report.servedBuildStamp!==report.productionBuildStamp)throw Error('Served build stamp differs from dist');
 const {chromium}=await import(pathToFileURL(resolve(checkout,'node_modules/@playwright/test/index.mjs')));
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>report.errors.push(e.message));
 try{
  await page.goto(origin+'/clash/any-five',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Fill a playable example',exact:true}).click();
  const [response]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname==='/api/game'&&r.request().method()==='POST'&&r.request().postDataJSON()?.op==='play'),page.getByRole('button',{name:'Run this five',exact:true}).click()]);
  const game=await response.json();if(!response.ok()||!game.resultId||!game.result?.core?.finalScore)throw Error('Fresh actual guest game did not complete');
  const region=page.getByRole('region',{name:'Completed Clash',exact:true});await region.waitFor();const link=region.getByRole('link',{name:'Open result card',exact:true});await link.waitFor();const url=await link.getAttribute('href');if(new URL(url).origin!==origin)throw Error('Fresh card origin mismatch');
  report.freshResult={resultId:game.resultId,path:new URL(url).pathname,score:game.result.core.finalScore,candidate:game.result.candidate,goldIds:game.result.goldIds,blueIds:game.result.blueIds,identity:'new anonymous guest context; no account adapter',createdAt:new Date().toISOString()};
  report.checks.push({name:'Fresh actual guest result and public card created',status:'PASS'});
  await writeFile(resolve(output,'fresh-result-urls.json'),JSON.stringify({sourceSHA:report.sourceSHA,resultUrls:[report.freshResult.path]},null,2)+'\n');
 }finally{await context.close();await browser.close();}
 const {FRANCHISE_PAIRINGS}=await import(pathToFileURL(resolve(checkout,'src/loop/franchiseCatalog.js')));
 const targets=[{name:'home',path:'/'},{name:'daily',path:'/clash/daily'},{name:'result',path:report.freshResult.path},{name:'programmatic',path:FRANCHISE_PAIRINGS[0].path},{name:'modes-hub',path:'/clash/modes'}];
 const {default:lighthouse}=await import(pathToFileURL('/private/tmp/eraclash-browser-audit-tools/node_modules/lighthouse/core/index.js'));
 const launcher=await import(pathToFileURL('/private/tmp/eraclash-browser-audit-tools/node_modules/chrome-launcher/dist/index.js'));
 for(const target of targets){let chrome;const startedAt=new Date().toISOString();console.log('LIGHTHOUSE START '+target.name);try{
  chrome=await launcher.launch({chromePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',chromeFlags:['--headless','--disable-dev-shm-usage','--no-sandbox']});
  const result=await lighthouse(origin+target.path,{port:chrome.port,logLevel:'error',output:['html','json'],onlyCategories:['performance','accessibility','best-practices','seo'],formFactor:'mobile'});
  await writeFile(resolve(output,target.name+'.html'),result.report[0]);await writeFile(resolve(output,target.name+'.json'),result.report[1]);
  const lhr=result.lhr,lcp=lhr.audits['largest-contentful-paint']?.numericValue;
  const row={...target,startedAt,endedAt:new Date().toISOString(),status:lhr.runtimeError||!Number.isFinite(lcp)?'UNVERIFIED':lcp>2500?'PARTIAL':'PASS',scores:Object.fromEntries(Object.entries(lhr.categories).map(([k,v])=>[k,Math.round((v.score??0)*100)])),lcpMs:lcp,finalURL:lhr.finalDisplayedUrl,lighthouseVersion:lhr.lighthouseVersion,throttlingMethod:lhr.configSettings.throttlingMethod,formFactor:lhr.configSettings.formFactor,runtimeError:lhr.runtimeError||null,warnings:lhr.runWarnings,rawJSONSHA256:digest(result.report[1]),rawHTMLSHA256:digest(result.report[0]),lcpDetails:lhr.audits['largest-contentful-paint-element']?.details||null,diagnosticAudits:Object.fromEntries(Object.entries(lhr.audits).filter(([k,v])=>/lcp|render-block|unused|font|image|cache|compression|network|long|mainthread|dom-size|bootup/i.test(k)&&v.score!==1).map(([k,v])=>[k,{title:v.title,numericValue:v.numericValue,displayValue:v.displayValue,details:v.details}]))};
  report.targets.push(row);console.log(JSON.stringify({name:target.name,status:row.status,lcpMs:lcp,scores:row.scores}));
 }catch(e){report.targets.push({...target,startedAt,endedAt:new Date().toISOString(),status:'UNVERIFIED',error:e.message});console.log('LIGHTHOUSE ERROR '+target.name+' '+e.message);}finally{await chrome?.kill();await save();}}
}catch(e){report.errors.push(e.message);console.log('RUNNER ERROR '+e.message);}
report.endedAt=new Date().toISOString();report.summary={targets:report.targets.length,passed:report.targets.filter(t=>t.status==='PASS').length,partial:report.targets.filter(t=>t.status==='PARTIAL').length,unverified:report.targets.filter(t=>t.status==='UNVERIFIED').length,errors:report.errors.length};await save();console.log(JSON.stringify(report.summary));if(report.errors.length||report.targets.length!==5||report.summary.unverified)process.exitCode=1;
