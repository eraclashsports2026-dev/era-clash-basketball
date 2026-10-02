import fs from 'node:fs/promises';
import path from 'node:path';
import {existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const [origin,label,sha,fixtureFile]=process.argv.slice(2);
if(!origin||!label||!sha||!fixtureFile||!/^run2-[a-z0-9-]+$/.test(label))throw new Error('Supply origin, unique run2 label, exact SHA and fresh fixture file.');
if(process.env.ECLASH_AUDIT_HEADERS_JSON||process.env.VERCEL_AUTOMATION_BYPASS_SECRET)throw new Error('No global protected headers permitted for mobile Lighthouse.');
const repo='/private/tmp/eraclash-loop-verification-20261002',output=path.join(repo,'data/validation/loop-foundation/browser-audit',label,'deferred-lighthouse');
await fs.mkdir(path.dirname(output),{recursive:true});await fs.mkdir(output,{recursive:false});await fs.mkdir(path.join(output,'lighthouse'));
const source=await fs.readFile(path.join(repo,'scripts/loop/fullBrowserAudit.mjs'),'utf8'),start=source.indexOf('async function runLighthouse(options,routes) {'),end=source.indexOf('\nexport async function runAudit',start);
if(start<0||end<0)throw new Error('Cannot locate unchanged collector Lighthouse function.');
const selected=['scripts/loop/fullBrowserAudit.mjs','vite.config.js','index.html','src/App.jsx','src/main.jsx','src/theme/applyTheme.js','src/theme/themeResolver.js','src/loop/modes/LoopModes.jsx','src/loop/modes/FranchiseMode.jsx','src/loop/franchiseCatalog.js','src/index.css','api/share-page.js','api/game.js','scripts/harness.mjs','dist/index.html','dist/sitemap.xml'];
const hash=b=>createHash('sha256').update(b).digest('hex');
const toolFiles=['/private/tmp/eraclash-browser-audit-tools/node_modules/lighthouse/package.json','/private/tmp/eraclash-browser-audit-tools/node_modules/chrome-launcher/package.json','/private/tmp/eraclash-deferred-lighthouse-final6545.mjs'];
async function identity(){const toolSha256={};for(const f of toolFiles)toolSha256[f]=hash(await fs.readFile(f));const files={};for(const f of selected)files[f]=hash(await fs.readFile(path.join(repo,f)));const fixture=await fs.readFile(path.resolve(repo,fixtureFile));const html=await(await fetch(origin+'/')).text();return {at:new Date().toISOString(),toolSha256,checkoutSha:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),files,fixtureSha256:hash(fixture),buildStamp:html.match(/name="eraclash-build" content="([^"]+)"/)?.[1],clientHtmlSha256:hash(html)};}
const fixture=JSON.parse(await fs.readFile(path.resolve(repo,fixtureFile),'utf8')),resultPath=fixture.samples?.[0]?.path;if(!resultPath)throw new Error('Fresh actual result required.');
const requestHeaders=()=>({origin,headers:{}}),safeUrl=value=>new URL(value).href;
async function toolLocation(options,name,file){const f=path.join(options.tools,'node_modules',name,file);if(!existsSync(f))throw new Error('Missing tool '+f);return f;}
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const fn=await new AsyncFunction('fs','path','pathToFileURL','toolLocation','requestHeaders','safeUrl',source.slice(start,end)+'\nreturn runLighthouse;')(fs,path,pathToFileURL,toolLocation,requestHeaders,safeUrl);
const before=await identity();if(before.checkoutSha!==sha)throw new Error('SHA mismatch before measurements.');
const results=await fn({origin,output,tools:'/private/tmp/eraclash-browser-audit-tools',lighthouse:true},[{kind:'result',path:resultPath},{kind:'programmatic',path:'/clash/all-time/atlanta-vs-boston'}]);
const after=await identity(),changedFiles=selected.filter(f=>before.files[f]!==after.files[f]),stable=JSON.stringify(before.toolSha256)===JSON.stringify(after.toolSha256)&&before.checkoutSha===after.checkoutSha&&before.fixtureSha256===after.fixtureSha256&&before.clientHtmlSha256===after.clientHtmlSha256&&changedFiles.length===0;
const report={phase:'Five deferred actual mobile Lighthouse reports; raw route matrix unchanged',origin,requestedSha:sha,before,after,sourceStability:{status:stable?'PASS':'UNVERIFIED',changedFiles},scope:'Actual Lighthouse mobile formFactor and simulated CPU/network throttling in desktop Chromium, not physical devices or production hosting.',results,status:!stable||results.some(x=>x.status==='UNVERIFIED')?'UNVERIFIED':results.every(x=>x.status==='PASS')?'PASS':'PARTIAL'};
await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
