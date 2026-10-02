#!/usr/bin/env node
/**
 * Read-only route, link, geometry, axe and Lighthouse evidence collector.
 * Prepare: node scripts/loop/fullBrowserAudit.mjs --inventory-only --label prepare
 * Execute AFTER the previous pass closes:
 *   node scripts/loop/fullBrowserAudit.mjs --origin http://localhost:4320 \
 *     --label run2 --environment local-production-harness --sha <commit> \
 *     --results-file <fresh-real-result-url-json> --tools /private/tmp/eraclash-browser-audit-tools
 *
 * Never starts/restarts a server, sends an email, creates an account, purchases,
 * deletes data, or fabricates a result. Per-mode game/account journeys remain
 * separately evidenced. Every skipped interaction is reported as UNVERIFIED.
 */
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { PLAY_MODES, KNOWN_ROUTES } from '../../src/navigation.js';
import { FRANCHISE_PAIRINGS, FRANCHISE_DATA_VERSION } from '../../src/loop/franchises.js';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PROFILE_DEFINITIONS = Object.freeze([
  { id:'desktop', name:'Desktop Chrome', viewport:{width:1440,height:1000}, mobile:false },
  { id:'iphone-se', name:'iPhone SE', device:'iPhone SE', viewport:{width:320,height:568}, mobile:true },
  { id:'iphone-14', name:'iPhone 14', device:'iPhone 14', viewport:{width:390,height:844}, mobile:true },
  { id:'iphone-pro-max', name:'iPhone 14 Pro Max', device:'iPhone 14 Pro Max', viewport:{width:430,height:932}, mobile:true },
  { id:'pixel', name:'Pixel 7', device:'Pixel 7', viewport:{width:412,height:915}, mobile:true },
]);
const AUDIT_ROOT = path.join(REPO,'data/validation/loop-foundation/browser-audit');
const AXE_TAGS = ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice'];
const htmlDecode = value => value.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const slug = value => String(value).replace(/[^a-zA-Z0-9._-]+/g,'-').slice(0,120);
const hash = value => createHash('sha256').update(value).digest('hex');
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
const git = args => { try { return execFileSync('git',args,{cwd:REPO,encoding:'utf8'}).trim(); } catch { return null; } };
const safeUrl = value => { try { const u=new URL(value); for(const key of [...u.searchParams.keys()]) if(/token|secret|password|key|code/i.test(key))u.searchParams.set(key,'[redacted]'); return u.href; } catch { return String(value); } };

export function validateOrigin(value) {
  const u = new URL(value);
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.pathname!=='/'||u.search||u.hash) throw new Error('Supply an http(s) origin with no credentials, path, query or fragment.');
  return u.origin;
}
export function parseArguments(argv=process.argv.slice(2)) {
  const options={origin:'http://localhost:4320',label:null,environment:null,inventoryOnly:false,profiles:PROFILE_DEFINITIONS.map(p=>p.id),programmaticLimit:435,controls:true,lighthouse:true,concurrency:2,externalLimit:500,timeout:20000,tools:process.env.ECLASH_AUDIT_TOOLS||'/private/tmp/eraclash-browser-audit-tools',resultsFile:null,sha:null,scope:'full'};
  const names={'--origin':'origin','--label':'label','--environment':'environment','--tools':'tools','--results-file':'resultsFile','--sha':'sha','--concurrency':'concurrency','--external-limit':'externalLimit','--timeout':'timeout','--programmatic-limit':'programmaticLimit','--profiles':'profiles'};
  for(let i=0;i<argv.length;i++) {
    const arg=argv[i];
    if(arg==='--inventory-only')options.inventoryOnly=true;
    else if(arg==='--no-controls')options.controls=false;
    else if(arg==='--no-lighthouse')options.lighthouse=false;
    else if(arg==='--smoke')options.scope='smoke';
    else if(names[arg]){if(!argv[i+1]||argv[i+1].startsWith('--'))throw new Error(`Missing ${arg} value`);options[names[arg]]=argv[++i];}
    else throw new Error(`Unknown option ${arg}`);
  }
  options.origin=validateOrigin(options.origin);
  if(!options.label||!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(options.label))throw new Error('Supply a unique --label with letters, digits, dots, underscores or hyphens. Existing evidence is never overwritten.');
  for(const key of ['concurrency','externalLimit','timeout','programmaticLimit']){options[key]=Number(options[key]);if(!Number.isInteger(options[key])||options[key]<0)throw new Error(`Invalid ${key}`);}
  if(options.concurrency<1||options.concurrency>4||options.programmaticLimit>435||options.timeout<1000)throw new Error('Concurrency must be 1–4; programmatic limit 0–435; timeout at least 1000ms.');
  if(typeof options.profiles==='string')options.profiles=options.profiles.split(',');
  if(!options.profiles.length||options.profiles.some(id=>!PROFILE_DEFINITIONS.some(p=>p.id===id)))throw new Error('Unknown profile. Use desktop,iphone-se,iphone-14,iphone-pro-max,pixel.');
  if(!options.inventoryOnly&&!options.environment)throw new Error('Execution requires --environment, e.g. local-production-harness or preview.');
  if(options.scope==='full'&&(options.programmaticLimit!==435||new Set(options.profiles).size!==5||!options.controls||!options.lighthouse))options.scope='partial';
  options.output=path.join(AUDIT_ROOT,options.label);
  return options;
}

export async function buildRouteInventory({resultsFile=null,programmaticLimit=435}={}) {
  const map=new Map();
  const add=(route,source,kind='application',extra={})=>{if(!route?.startsWith('/')||route.includes(':'))return;const row=map.get(route)||{path:route,kind,sources:[]};if(!row.sources.includes(source))row.sources.push(source);Object.assign(row,extra);map.set(route,row);};
  add('/','public entrance'); add('/play','navigation registry');
  for(const mode of PLAY_MODES){add(mode.route,'PLAY_MODES','mode',{modeId:mode.id,implemented:mode.implemented});add(`/modes/${mode.id}`,'navigation information contract','mode-information',{modeId:mode.id});}
  for(const route of KNOWN_ROUTES)add(route,'KNOWN_ROUTES',route==='/my-eraclash'?'account':route==='/leaderboard'?'leaderboard':'application');
  const hub=await fs.readFile(path.join(REPO,'src/loop/modes/LoopModes.jsx'),'utf8');
  for(const match of hub.matchAll(/href:\s*['"]([^'"]+)['"]/g))add(match[1],'LOOP_MODE_LINKS','loop-mode');
  for(const key of ['modes','filters','one-franchise','one-per-era','no-mvps'])add(`/clash/${key}`,'LoopModes branches','loop-mode');
  const app=await fs.readFile(path.join(REPO,'src/App.jsx'),'utf8');
  for(const match of app.matchAll(/route\s*===\s*['"](\/[^'"]+)['"]/g))add(match[1],'App route branch',match[1]==='/auth/callback'?'auth-callback':'application');
  for(const route of ['/fantasy/eraclash','/fantasy/live'])add(route,'fantasy registry','mode-information',{implemented:false});
  const sitemapPath=path.join(REPO,'artifacts/loop/franchise-pages/franchise-sitemap.xml');
  let sitemap={path:path.relative(REPO,sitemapPath),status:'UNVERIFIED',expected:435,found:0};
  try {
    const xml=await fs.readFile(sitemapPath,'utf8');
    const urls=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>htmlDecode(m[1]));
    const paths=urls.map(url=>new URL(url).pathname),expected=new Set(FRANCHISE_PAIRINGS.map(p=>p.path));
    sitemap={...sitemap,status:urls.length===435&&new Set(paths).size===435&&paths.every(p=>expected.has(p))?'PASS':'FAIL',found:urls.length,unique:new Set(paths).size,sha256:hash(xml),declaredOrigins:[...new Set(urls.map(u=>new URL(u).origin))]};
  } catch(error){sitemap.error=error.message;}
  for(const pairing of FRANCHISE_PAIRINGS.slice(0,programmaticLimit))add(pairing.path,'FRANCHISE_PAIRINGS + franchise sitemap','programmatic',{pairingId:pairing.id});
  let suppliedResults=[];
  if(resultsFile) {
    const input=JSON.parse(await fs.readFile(path.resolve(resultsFile),'utf8'));
    const candidates=Array.isArray(input)?input:input.resultUrls||input.samples||input.resultIds||[];
    suppliedResults=candidates.map(item=>typeof item==='string'?item:item.path||item.url||item.publicUrl||item.sharePath).filter(Boolean).map(value=>{const u=new URL(value,'http://audit.invalid');if(!/^\/(card|result)\/[a-zA-Z0-9_-]+$/.test(u.pathname))throw new Error(`Expected a real /card/<id> or /result/<id> path, received ${safeUrl(value)}`);return u.pathname;});
    for(const route of suppliedResults)add(route,'caller-supplied fresh real results','result');
  }
  return {routes:[...map.values()].sort((a,b)=>a.path==='/'?-1:b.path==='/'?1:a.path.localeCompare(b.path)),sitemap,suppliedResults,sourceVersion:FRANCHISE_DATA_VERSION};
}

export function parseHtmlMetadata(html) {
  const metas={};
  for(const tag of html.matchAll(/<meta\b[^>]*>/gi)){
    const attrs={};for(const attr of tag[0].matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g))attrs[attr[1].toLowerCase()]=htmlDecode(attr[2]);
    if(attrs.name||attrs.property)metas[attrs.name||attrs.property]=attrs.content||'';
  }
  const title=htmlDecode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]||'');
  const canonical=htmlDecode(html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1]||'');
  const links=[...html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)].map(m=>htmlDecode(m[1]));
  return {title,canonical,metas,links};
}

export function classifyInteraction(control) {
  if(control.disabled)return {status:'N/A',reason:'Disabled control; its enabled-state journey is a separate check.'};
  if(control.href) return {status:'LINK',reason:'Navigation checked against its actual destination.'};
  if(/password|send.*code|send.*email|sign.?out|delete|remove.*account|export.*data|purchase|pay|checkout|support eraclash|create.*room|join.*room|submit.*feedback|accept.*challenge|decline.*challenge/i.test(control.name))return {status:'UNVERIFIED',reason:'Provider, account, email, payment or persistent action; covered by its explicitly authorized journey.'};
  if(/watch this matchup|play with my selections|run.*clash|play.*daily|start.*gauntlet|continue.*era|play this era|roll \d|reroll|roll.*pick|spin|new.*clash|run it back|submit|save.*roster|save.*clash/i.test(control.name))return {status:'UNVERIFIED',reason:'Stateful gameplay/save control; the mode journey must verify its server-owned result.'};
  if(control.tag==='input'&&['email','password','file','hidden'].includes(control.type))return {status:'UNVERIFIED',reason:'Account/provider or file input; no generated credentials or uploads.'};
  return {status:'PROBE',reason:'Local navigation, disclosure, selection, or search state can be exercised without submission.'};
}

async function toolLocation(options,name,file) {
  const require=createRequire(import.meta.url);
  try{return require.resolve(`${name}/${file}`);}catch{}
  const candidate=path.join(options.tools,'node_modules',name,file);
  if(existsSync(candidate))return candidate;
  throw new Error(`${name} unavailable. Install pinned audit tooling outside the app or provide --tools.`);
}
async function mapBounded(items,concurrency,operation) {
  let next=0;const results=new Array(items.length);
  await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{while(next<items.length){const index=next++;results[index]=await operation(items[index],index);}}));
  return results;
}
function requestHeaders(origin) {
  const headers=process.env.ECLASH_AUDIT_HEADERS_JSON?JSON.parse(process.env.ECLASH_AUDIT_HEADERS_JSON):{};
  if(process.env.VERCEL_AUTOMATION_BYPASS_SECRET)headers['x-vercel-protection-bypass']=process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  // Only same-origin requests receive protection headers; they are never recorded.
  return {origin,headers};
}
async function fetchBounded(url,options,method='GET') {
  const destination=new URL(url),same=destination.origin===options.origin;
  const response=await fetch(destination,{method,signal:AbortSignal.timeout(options.timeout),redirect:'manual',headers:same?requestHeaders(options.origin).headers:{'user-agent':'EraClash-ReadOnly-Audit/1.0'}});
  return response;
}

async function documentControls(page) {
  return page.evaluate(()=>{
    const elements=[...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=checkbox],[role=switch]')];
    return elements.map((element,index)=>{
      element.setAttribute('data-browser-audit-control',String(index));
      const rectangle=element.getBoundingClientRect(),style=getComputedStyle(element),visible=rectangle.width>0&&rectangle.height>0&&style.visibility!=='hidden'&&style.display!=='none';
      // A associated checkbox/radio label is a real clickable activation box,
      // so measure it rather than declaring its small native glyph the target.
      const labelTargets=['checkbox','radio'].includes(element.type)?[...(element.labels||[])].map(label=>label.getBoundingClientRect()).filter(r=>r.width&&r.height):[];
      const target=labelTargets.find(r=>r.width>=rectangle.width&&r.height>=rectangle.height)||rectangle;
      let name=element.getAttribute('aria-label')||element.innerText?.trim()||element.getAttribute('placeholder')||'';
      if(!name&&element.labels?.length)name=[...element.labels].map(label=>label.textContent.trim()).join(' ');
      return {index,tag:element.tagName.toLowerCase(),type:element.type||null,role:element.getAttribute('role'),name:name.slice(0,160),href:element.getAttribute('href'),disabled:!!element.disabled||element.getAttribute('aria-disabled')==='true',visible,width:Math.round(target.width*100)/100,height:Math.round(target.height*100)/100,rawWidth:Math.round(rectangle.width*100)/100,rawHeight:Math.round(rectangle.height*100)/100,targetIncludesAssociatedLabel:target!==rectangle,inline:element.tagName==='A'&&style.display==='inline',value:element.type==='password'||element.type==='email'?'[private]':String(element.value??'').slice(0,80)};
    }).filter(control=>control.visible);
  });
}
async function settledPage(page,url,options) {
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:options.timeout});
  await page.waitForLoadState('networkidle',{timeout:Math.min(options.timeout,6000)}).catch(()=>{});
  await page.evaluate(()=>document.fonts?.ready).catch(()=>{});
  await page.waitForFunction(()=>!document.body.innerText.includes('Loading the server’s mode configuration'),{},{timeout:6000}).catch(()=>{});
  return response;
}
async function runAxe(page,axePath) {
  await page.addScriptTag({path:axePath});
  return page.evaluate(async tags=>{
    const result=await window.axe.run(document,{runOnly:{type:'tag',values:tags},resultTypes:['violations','incomplete','passes']});
    const reduce=item=>({id:item.id,impact:item.impact,description:item.description,help:item.help,helpUrl:item.helpUrl,nodes:item.nodes.map(n=>({target:n.target,html:n.html,failureSummary:n.failureSummary}))});
    return {version:result.testEngine.version,violations:result.violations.map(reduce),incomplete:result.incomplete.map(reduce),passedRules:result.passes.length,critical:result.violations.filter(v=>v.impact==='critical').length,serious:result.violations.filter(v=>v.impact==='serious').length};
  },AXE_TAGS);
}
async function pageState(page) {
  return page.evaluate(()=>({url:location.href,text:document.body.innerText.slice(0,30000),html:document.body.innerHTML,values:[...document.querySelectorAll('input:not([type=password]):not([type=email]),select,textarea')].map(e=>[e.value,e.checked]),expanded:[...document.querySelectorAll('[aria-expanded],[aria-checked],[aria-selected]')].map(e=>[e.getAttribute('aria-expanded'),e.getAttribute('aria-checked'),e.getAttribute('aria-selected')])}));
}
async function probeControl(browser,profile,route,control,options,axePath,devices) {
  const classification=classifyInteraction(control),entry={...control,...classification};
  if(classification.status!=='PROBE')return entry;
  const context=await browser.newContext(contextOptions(profile,devices,options)),page=await context.newPage();
  const mutations=[];let popup=null;
  page.on('popup',value=>{popup=value;});
  // New context for every probe. Block all writes except telemetry; no email,
  // account, gameplay, payment or deletion requests can leak through a label.
  await context.route('**/*',async intercepted=>{
    const request=intercepted.request(),u=new URL(request.url());
    let readOnlyConfig=false;
    if(u.pathname==='/api/game'&&request.method()==='POST')try {const body=request.postDataJSON();readOnlyConfig=body?.action==='loop'&&body?.op==='config';}catch{}
    if(!['GET','HEAD','OPTIONS'].includes(request.method())&&!u.pathname.endsWith('/api/events')&&!readOnlyConfig){mutations.push({method:request.method(),path:u.pathname});return intercepted.abort('blockedbyclient');}
    return intercepted.continue();
  });
  try {
    await settledPage(page,options.origin+route.path,options);await documentControls(page);
    const locator=page.locator(`[data-browser-audit-control="${control.index}"]`);
    if(await locator.count()!==1)throw new Error('Control inventory changed before probe.');
    const before=await pageState(page);
    if(control.tag==='select'){
      const values=await locator.locator('option').evaluateAll(nodes=>nodes.filter(n=>!n.disabled).map(n=>n.value));
      const selected=values.find(value=>value!==control.value);if(selected===undefined)return {...entry,status:'N/A',reason:'Select has one available value.'};
      await locator.selectOption(selected);
    } else if(control.tag==='input'||control.tag==='textarea') {
      if(['checkbox','radio','button','submit'].includes(control.type))await locator.click();
      else if(control.type==='date')await locator.fill('2026-10-20');
      else if(control.type==='number'||control.type==='range')return {...entry,status:'UNVERIFIED',reason:'Numeric input needs a valid domain value; no guessed value submitted.'};
      else await locator.fill('Jordan');
    } else await locator.click({timeout:5000});
    await sleep(300);await page.waitForLoadState('networkidle',{timeout:2000}).catch(()=>{});
    const after=await pageState(page);
    if(mutations.length)return {...entry,status:'UNVERIFIED',reason:'Action attempted a persistent request; blocked in this read-only audit.',attemptedWrites:mutations};
    const meaningful={navigation:before.url!==after.url,visibleText:before.text!==after.text,value:JSON.stringify(before.values)!==JSON.stringify(after.values),accessibleState:JSON.stringify(before.expanded)!==JSON.stringify(after.expanded),popup:!!popup};
    const observed=Object.values(meaningful).some(Boolean);
    let axe=null;if(observed&&before.text!==after.text)axe=await runAxe(page,axePath).catch(error=>({error:error.message}));
    return {...entry,status:observed?'PASS':'UNVERIFIED',reason:observed?'Observed navigation, visible content, input, or accessible-state change.':'No observable change. This is a candidate dead control requiring its exact intended behavior to be checked.',observed:meaningful,destination:safeUrl(after.url),axe};
  } catch(error){return {...entry,status:'FAIL',reason:error.message};}
  finally{await popup?.close().catch(()=>{});await context.close();}
}
function contextOptions(profile,devices,options) {
  const device=profile.device?devices[profile.device]:null;
  return {...(device||{}),viewport:profile.viewport,isMobile:profile.mobile,hasTouch:profile.mobile,extraHTTPHeaders:requestHeaders(options.origin).headers,serviceWorkers:'block',locale:'en-US',timezoneId:'America/New_York',bypassCSP:true};
}

async function auditRoute(browser,devices,axePath,profile,route,options,links) {
  const context=await browser.newContext(contextOptions(profile,devices,options)),page=await context.newPage();
  const errors=[],badResponses=[],failedRequests=[],consoleErrors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)badResponses.push({url:safeUrl(response.url()),status:response.status(),resourceType:response.request().resourceType()});});
  page.on('requestfailed',request=>failedRequests.push({url:safeUrl(request.url()),error:request.failure()?.errorText}));
  const row={path:route.path,kind:route.kind,profile:profile.id,identity:{...options.evidenceIdentity,actor:'fresh guest context'},startedAt:new Date().toISOString(),issues:[]};
  try {
    const response=await settledPage(page,options.origin+route.path,options);
    row.statusCode=response?.status()??null;row.finalUrl=safeUrl(page.url());row.title=await page.title();
    const text=await page.locator('body').innerText();
    row.geometry=await page.evaluate(()=>{
      const court=document.querySelector('.loop-court');let background=null,expected=null,light=null;
      if(court){background=getComputedStyle(court).backgroundColor;const probe=document.createElement('span');probe.style.cssText='display:none;background:var(--loop-bg)';court.append(probe);expected=getComputedStyle(probe).backgroundColor;probe.remove();const values=background.match(/[\d.]+/g)?.slice(0,3).map(Number);light=values?.length===3&&values.reduce((a,b)=>a+b,0)/3>180;}
      return {viewport:{width:innerWidth,height:innerHeight},scrollWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,theme:document.documentElement.getAttribute('data-theme'),loopBackground:background,loopTokenBackground:expected,lightCourt:light,metaViewport:document.querySelector('meta[name=viewport]')?.content};
    });
    row.controls=await documentControls(page);
    row.smallTargets=row.controls.filter(c=>!c.disabled&&(c.width<43.5||c.height<43.5));
    for(const control of row.controls)if(control.href)links.set(new URL(control.href,page.url()).href,{href:new URL(control.href,page.url()).href,source:route.path});
    row.authGate=route.kind==='auth-callback'||(/sign in|sign up|create (?:a free |an )?account|account features.*unavailable/i.test(text)&&route.kind==='account')||(route.path==='/clash/rooms'&&/sign in|guest|account/i.test(text));
    if(row.authGate)row.authCoverage={status:'UNVERIFIED',reason:'Only the public gate was inspected. Private account data and real SMTP delivery need separately provisioned identities.'};
    row.availability=route.implemented===false?'EXPECTED_UNAVAILABLE':/not available here|temporarily unavailable|disabled in this|not configured|not ready|could not.*load/i.test(text)?'ENVIRONMENT_BARRIER':'RENDERED';
    if(row.availability==='ENVIRONMENT_BARRIER')row.issues.push({status:'UNVERIFIED',name:'environment surface',detail:text.slice(0,1000)});
    if(row.statusCode>=400)row.issues.push({status:'FAIL',name:'route HTTP status',detail:row.statusCode});
    if(row.geometry.overflow)row.issues.push({status:'FAIL',name:'horizontal document overflow',detail:row.geometry});
    if(profile.mobile&&row.smallTargets.length)row.issues.push({status:'FAIL',name:'44px minimum target dimension',detail:row.smallTargets});
    if(row.geometry.loopBackground&&(row.geometry.loopBackground!==row.geometry.loopTokenBackground||!row.geometry.lightCourt))row.issues.push({status:'FAIL',name:'Light Court token binding/surface',detail:row.geometry});
    if(!text.trim())row.issues.push({status:'FAIL',name:'empty page'});
    if(/Loading the server’s mode configuration|TODO|\bplaceholder\b/i.test(text))row.issues.push({status:'FAIL',name:'unfinished/loading page',detail:text.slice(0,1000)});
    if(errors.length)row.issues.push({status:'FAIL',name:'uncaught browser errors',detail:errors});
    if(consoleErrors.length)row.issues.push({status:'FAIL',name:'console errors',detail:consoleErrors});
    if(badResponses.length)row.issues.push({status:'FAIL',name:'failed network responses',detail:badResponses});
    if(failedRequests.length)row.issues.push({status:'FAIL',name:'failed requests',detail:failedRequests});
    row.axe=await runAxe(page,axePath);
    if(row.axe.critical||row.axe.serious)row.issues.push({status:'FAIL',name:'axe critical/serious violations',detail:{critical:row.axe.critical,serious:row.axe.serious}});
    else if(row.axe.violations.length)row.issues.push({status:'PARTIAL',name:'axe other violations',detail:row.axe.violations.map(v=>({id:v.id,impact:v.impact}))});
    const shouldScreenshot=route.kind!=='programmatic'||row.issues.some(i=>i.status==='FAIL')||[FRANCHISE_PAIRINGS[0].path,FRANCHISE_PAIRINGS[434].path].includes(route.path);
    if(shouldScreenshot){row.screenshot=`screenshots/${profile.id}-${slug(route.path)}.png`;await page.screenshot({path:path.join(options.output,row.screenshot),fullPage:true});}
    if(options.controls){row.interactions=[];for(const control of row.controls){if(control.href){row.interactions.push({...control,...classifyInteraction(control)});continue;}row.interactions.push(await probeControl(browser,profile,route,control,options,axePath,devices));}}
    else row.interactions=[{status:'UNVERIFIED',reason:'Controls disabled by command option.'}];
    if(row.interactions?.some(i=>i.status==='FAIL'))row.issues.push({status:'FAIL',name:'control probe failure'});
    if(row.interactions?.some(i=>i.axe?.critical||i.axe?.serious))row.issues.push({status:'FAIL',name:'axe violation after control interaction'});
    row.status=row.issues.some(i=>i.status==='FAIL')?'FAIL':row.issues.length?'PARTIAL':'PASS';
  }catch(error){row.status='FAIL';row.issues.push({status:'FAIL',name:'audit route failed',detail:error.message});}
  finally{row.errors=errors;row.consoleErrors=consoleErrors;row.failedResponses=badResponses;row.failedRequests=failedRequests;row.endedAt=new Date().toISOString();await context.close();}
  const filename=`routes/${profile.id}-${slug(route.path)}-${hash(route.path).slice(0,8)}.json`;await fs.writeFile(path.join(options.output,filename),JSON.stringify(row,null,2)+'\n');
  return {...row,artifact:filename};
}

async function inspectLink(link,options) {
  const u=new URL(link.href);
  if(!['http:','https:'].includes(u.protocol))return {url:safeUrl(u.href),source:link.source,status:'N/A',reason:'Non-HTTP link requires a configured local handler.'};
  if(u.username||u.password||[...u.searchParams.keys()].some(key=>/token|secret|password|key|code/i.test(key)))return {url:safeUrl(u.href),source:link.source,status:'UNVERIFIED',reason:'Credential-bearing/auth link was not fetched.'};
  const internal=u.origin===options.origin;
  try {
    let response=await fetchBounded(u.href,options,'HEAD'),redirects=[];
    for(let count=0;count<5&&[301,302,303,307,308].includes(response.status);count++){
      const location=response.headers.get('location');if(!location)break;const next=new URL(location,u);redirects.push({status:response.status,destination:safeUrl(next.href)});response=await fetchBounded(next.href,options,'HEAD');u.href=next.href;
    }
    const code=response.status;
    const status=code>=200&&code<400?'PASS':[401,403,405,429].includes(code)?'UNVERIFIED':'FAIL';
    return {url:safeUrl(link.href),source:link.source,internal,method:'HEAD',httpStatus:code,finalUrl:safeUrl(u.href),redirects,status,reason:status==='UNVERIFIED'?'Access protection, rate limit or HEAD unsupported; this does not establish a broken destination.':null};
  }catch(error){return {url:safeUrl(link.href),source:link.source,internal,method:'HEAD',status:'UNVERIFIED',reason:error.message};}
}

async function checkSocial(route,options) {
  const result={path:route.path,status:'FAIL',issues:[]};
  try {
    const response=await fetchBounded(options.origin+route.path,options),html=await response.text(),metadata=parseHtmlMetadata(html);Object.assign(result,{httpStatus:response.status,...metadata});
    for(const key of ['description','og:title','og:description','og:image','og:url','twitter:card'])if(!metadata.metas[key])result.issues.push(`Missing ${key}`);
    if(!metadata.title||!metadata.canonical)result.issues.push('Missing title/canonical');
    if(metadata.metas['twitter:card']!=='summary_large_image')result.issues.push('Expected summary_large_image');
    if(metadata.metas['og:url']!==options.origin+route.path||metadata.canonical!==options.origin+route.path)result.issues.push('Canonical and og:url do not match the inspected URL');
    const visibleMetadata=[metadata.title,...['description','og:title','og:description'].map(key=>metadata.metas[key]||'')].join(' ');
    if(/\bNBA\b|National Basketball Association/i.test(visibleMetadata))result.issues.push('League name in visible/social metadata');
    if(metadata.metas['og:image']){
      const image=new URL(metadata.metas['og:image'],options.origin);if(image.origin!==options.origin)throw new Error('OG image is outside the inspected origin.');
      const pngResponse=await fetchBounded(image.href,options),png=Buffer.from(await pngResponse.arrayBuffer());
      result.image={url:safeUrl(image.href),status:pngResponse.status,bytes:png.length,type:pngResponse.headers.get('content-type'),dimensions:png.length>=24&&png.subarray(0,8).toString('hex')==='89504e470d0a1a0a'?[png.readUInt32BE(16),png.readUInt32BE(20)]:null};
      if(!pngResponse.ok||result.image.dimensions?.[0]!==1200||result.image.dimensions?.[1]!==630||png.length>=1_000_000)result.issues.push('Image must be a successful 1200×630 PNG below 1MB');
    }
    if(!response.ok)result.issues.push(`HTTP ${response.status}`);result.status=result.issues.length?'FAIL':'PASS';
  }catch(error){result.issues.push(error.message);}
  return result;
}

async function runLighthouse(options,routes) {
  const resultRoute=routes.find(r=>r.kind==='result'),pairing=routes.find(r=>r.kind==='programmatic');
  const targets=[{name:'home',path:'/'},{name:'daily',path:'/clash/daily'},{name:'result',path:resultRoute?.path},{name:'programmatic',path:pairing?.path},{name:'modes-hub',path:'/clash/modes'}];
  if(!options.lighthouse)return targets.map(t=>({...t,status:'UNVERIFIED',reason:'Lighthouse disabled by command option.'}));
  let lighthouse,launcher;
  try {lighthouse=(await import(pathToFileURL(await toolLocation(options,'lighthouse','core/index.js')).href)).default;launcher=await import(pathToFileURL(await toolLocation(options,'chrome-launcher','dist/index.js')).href);}catch(error){return targets.map(t=>({...t,status:'UNVERIFIED',reason:error.message}));}
  const results=[];
  for(const target of targets){
    if(!target.path){results.push({...target,status:'UNVERIFIED',reason:'A real, fresh public result URL must be supplied. No fabricated identifier or score.'});continue;}
    let chrome;
    try {
      chrome=await launcher.launch({chromePath:process.env.ECLASH_BROWSER_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',chromeFlags:['--headless','--disable-dev-shm-usage']});
      const result=await lighthouse(options.origin+target.path,{port:chrome.port,logLevel:'error',output:['html','json'],onlyCategories:['performance','accessibility','best-practices','seo'],formFactor:'mobile',extraHeaders:requestHeaders(options.origin).headers});
      const lhr=result.lhr,base=`lighthouse/${target.name}`;
      await fs.writeFile(path.join(options.output,base+'.html'),result.report[0]);await fs.writeFile(path.join(options.output,base+'.json'),result.report[1]);
      const scores=Object.fromEntries(Object.entries(lhr.categories).map(([key,value])=>[key,Math.round((value.score??0)*100)])),lcp=lhr.audits['largest-contentful-paint']?.numericValue;
      results.push({...target,status:lhr.runtimeError?'UNVERIFIED':lcp>2500?'PARTIAL':'PASS',scores,lcpMs:lcp,finalUrl:safeUrl(lhr.finalDisplayedUrl),lighthouseVersion:lhr.lighthouseVersion,formFactor:lhr.configSettings.formFactor,throttlingMethod:lhr.configSettings.throttlingMethod,artifact:base+'.html',warnings:lhr.runWarnings,runtimeError:lhr.runtimeError||null,lcpNeedsInvestigation:lcp>2500});
    }catch(error){results.push({...target,status:'UNVERIFIED',reason:error.message});}
    finally{await chrome?.kill();}
  }
  return results;
}

export async function runAudit(options) {
  await fs.mkdir(AUDIT_ROOT,{recursive:true});
  await fs.mkdir(options.output,{recursive:false});
  const inventory=await buildRouteInventory(options);
  const report={label:options.label,startedAt:new Date().toISOString(),origin:options.origin,environment:options.environment||'inventory-only',requestedSha:options.sha,checkoutSha:git(['rev-parse','HEAD']),checkoutDirty:!!git(['status','--porcelain']),scope:options.inventoryOnly?'PREPARATION_ONLY':options.scope,profiles:PROFILE_DEFINITIONS.filter(p=>options.profiles.includes(p.id)),inventory,sources:{axe:'https://github.com/dequelabs/axe-core/blob/develop/doc/API.md',lighthouse:'https://github.com/GoogleChrome/lighthouse/blob/main/docs/readme.md',emulation:'https://playwright.dev/docs/emulation'},limitations:['Chromium viewport/touch emulation does not verify physical iOS Safari or Android Chrome.','Automated axe findings do not establish full accessibility conformance or screen-reader usability.','Audit contexts bypass CSP solely to inject the local axe instrument; server security headers are not validated by this runner.','Read-only control probes do not establish stateful gameplay, account, private-data, email or payment correctness.','The local checkout SHA and health identity are recorded separately; a caller-provided deployment SHA is not independently verified by this runner.'],physicalDeviceChecklist:['iOS Safari on an actual iPhone SE: keyboard, scrolling, dialogs and tap targets.','Actual iPhone 14 and Pro Max: safe areas, rotation, text zoom and sharing.','Actual Android Pixel Chrome: soft keyboard, back navigation, clipboard/share and touch.']};
  report.fileHashes={};
  for(const file of ['scripts/loop/fullBrowserAudit.mjs','scripts/loop/sitemap.mjs','vite.config.js','index.html','src/App.jsx','src/navigation.js','src/loop/franchises.js','src/loop/modes/LoopModes.jsx','src/loop/components/loop.css','api/share-page.js','dist/index.html','dist/sitemap.xml'])try{report.fileHashes[file]=hash(await fs.readFile(path.join(REPO,file)));}catch{}
  report.codeFingerprint=hash(JSON.stringify(report.fileHashes));
  await fs.writeFile(path.join(options.output,'inventory.json'),JSON.stringify(inventory,null,2)+'\n');
  if(options.inventoryOnly){report.status='PREPARATION_ONLY';report.endedAt=new Date().toISOString();await fs.writeFile(path.join(options.output,'report.json'),JSON.stringify(report,null,2)+'\n');return report;}
  for(const dir of ['routes','screenshots','lighthouse'])await fs.mkdir(path.join(options.output,dir));
  let browser;
  try {
    const health=await fetchBounded(options.origin+'/api/health',options);report.health={status:health.status,payload:health.ok?await health.json():null};
    options.evidenceIdentity={origin:options.origin,environment:options.environment,checkoutSha:report.checkoutSha,requestedSha:options.sha,checkoutDirty:report.checkoutDirty,codeFingerprint:report.codeFingerprint,engineIdentity:report.health.payload?.preview||null};
    if(options.sha&&options.sha!==report.checkoutSha&&options.origin.includes('localhost'))report.limitations.push('Requested SHA differs from this checkout. Exact code identity needs owner reconciliation.');
    const axePath=await toolLocation(options,'axe-core','axe.min.js'),pw=await import('@playwright/test');
    report.tools={axeVersion:JSON.parse(await fs.readFile(path.join(path.dirname(axePath),'package.json'),'utf8')).version,playwrightVersion:JSON.parse(await fs.readFile(createRequire(import.meta.url).resolve('@playwright/test/package.json'),'utf8')).version};
    browser=await pw.chromium.launch({headless:true,executablePath:process.env.ECLASH_BROWSER_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    report.tools.browserVersion=browser.version();
    const smokePaths=new Set(['/','/clash/modes','/privacy',inventory.routes.find(r=>r.kind==='programmatic')?.path,inventory.routes.find(r=>r.kind==='result')?.path]);
    const selectedRoutes=options.scope==='smoke'?inventory.routes.filter(r=>smokePaths.has(r.path)):inventory.routes;
    report.browserCoverage={inventoried:inventory.routes.length,selected:selectedRoutes.length,scope:options.scope};
    const links=new Map(),tasks=report.profiles.flatMap(profile=>selectedRoutes.map(route=>({profile,route})));
    report.routes=await mapBounded(tasks,options.concurrency,async({profile,route},index)=>{const result=await auditRoute(browser,pw.devices,axePath,profile,route,options,links);if(index%25===0)console.log(JSON.stringify({label:options.label,completed:index+1,total:tasks.length,path:route.path,profile:profile.id,status:result.status}));return result;});
    for(const route of inventory.routes)links.set(options.origin+route.path,{href:options.origin+route.path,source:'route inventory'});
    // Public profile and rematch/query links discovered at runtime are checked
    // as exact URLs by HEAD, even if their private content is inaccessible.
    const internal=[...links.values()].filter(l=>new URL(l.href).origin===options.origin),external=[...links.values()].filter(l=>new URL(l.href).origin!==options.origin);
    report.links=await mapBounded([...internal,...external.slice(0,options.externalLimit)],3,link=>inspectLink(link,options));
    for(const link of external.slice(options.externalLimit))report.links.push({url:safeUrl(link.href),source:link.source,status:'UNVERIFIED',reason:'External HEAD limit reached; no omitted link is counted as passing.'});
    report.servedSitemap={path:'/sitemap.xml',status:'UNVERIFIED'};
    try {
      const response=await fetchBounded(options.origin+'/sitemap.xml',options),xml=await response.text();
      const urls=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>htmlDecode(m[1])),expected=new Set(FRANCHISE_PAIRINGS.map(p=>options.origin+p.path));
      report.servedSitemap={path:'/sitemap.xml',httpStatus:response.status,entries:urls.length,unique:new Set(urls).size,origins:[...new Set(urls.map(u=>new URL(u).origin))],sha256:hash(xml),status:response.ok&&urls.length===435&&new Set(urls).size===435&&urls.every(u=>expected.has(u))?'PASS':'FAIL'};
    }catch(error){report.servedSitemap.reason=error.message;}
    report.notFound=[];
    for(const route of ['/this-page-does-not-exist-browser-audit','/clash/all-time/not-a-real-franchise-pairing','/card/zzzzzzzzzzzzzzzzzzzzzzzz']){
      const response=await fetchBounded(options.origin+route,options),text=await response.text();report.notFound.push({path:route,httpStatus:response.status,status:response.status===404?'PASS':'FAIL',bodyHasNotice:/not found|unavailable|unknown|doesn.t exist/i.test(text)});
    }
    const socialRoutes=[{path:'/',kind:'home'},...inventory.routes.filter(r=>r.kind==='result').slice(0,10),...inventory.routes.filter(r=>r.kind==='programmatic').filter((_,i)=>[0,12,49,88,133,177,220,265,321,434].includes(i))];
    report.social=await mapBounded(socialRoutes,2,route=>checkSocial(route,options));
    if(inventory.suppliedResults.length<10)report.social.push({status:'UNVERIFIED',reason:`Only ${inventory.suppliedResults.length} real result URLs supplied; ten are required for the full sharing matrix.`});
    report.lighthouse=await runLighthouse(options,inventory.routes);
    const interactions=report.routes.flatMap(r=>r.interactions||[]);
    report.summary={routes:report.routes.length,routeFailures:report.routes.filter(r=>r.status==='FAIL').length,criticalAxe:report.routes.reduce((n,r)=>n+(r.axe?.critical||0),0),seriousAxe:report.routes.reduce((n,r)=>n+(r.axe?.serious||0),0),links:report.links.length,failedLinks:report.links.filter(r=>r.status==='FAIL').length,unverifiedLinks:report.links.filter(r=>r.status==='UNVERIFIED').length,controls:interactions.length,observedControls:interactions.filter(r=>r.status==='PASS').length,unverifiedControls:interactions.filter(r=>r.status==='UNVERIFIED').length,disabledControls:interactions.filter(r=>r.status==='N/A').length,socialFailures:report.social.filter(r=>r.status==='FAIL').length,lighthouseReports:report.lighthouse.filter(r=>r.artifact).length};
    report.status=report.summary.routeFailures||report.summary.failedLinks||report.summary.socialFailures||report.notFound.some(r=>r.status==='FAIL')||inventory.sitemap.status==='FAIL'||report.servedSitemap.status==='FAIL'?'FAIL':options.scope!=='full'||report.summary.unverifiedControls||report.summary.unverifiedLinks||report.social.some(r=>r.status!=='PASS')||report.lighthouse.some(r=>r.status!=='PASS')?'PARTIAL':'PASS';
  }catch(error){report.status='UNVERIFIED';report.error=error.message;}
  finally{await browser?.close();report.endedAt=new Date().toISOString();await fs.writeFile(path.join(options.output,'report.json'),JSON.stringify(report,null,2)+'\n');}
  return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try {const options=parseArguments(),report=await runAudit(options);console.log(JSON.stringify({label:report.label,status:report.status,summary:report.summary,output:options.output,error:report.error}));if(report.status==='FAIL'||report.status==='UNVERIFIED')process.exitCode=1;}catch(error){console.error(error.message);process.exitCode=1;}
}
