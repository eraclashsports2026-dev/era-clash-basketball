// Independent local HTML layout audit. This does not stand in for deployed
// crawler or authenticated journey tests. Use the bundled Playwright runtime.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildFranchiseManifest, renderFranchiseHtml } from '../scripts/loop/franchise-pages.mjs';

const playwrightPath=process.env.PLAYWRIGHT_MODULE || '/Users/josephjohnson/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const {chromium}=await import(pathToFileURL(playwrightPath));
const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const pages=buildFranchiseManifest({origin:'http://localhost:4173'}),checks=[];
const out=path.resolve(process.env.FRANCHISE_AUDIT_OUTPUT || 'artifacts/loop');
await fs.mkdir(out,{recursive:true});
try {
  for(const neutralNaming of [false,true])for(const width of [320,390,768,1280])for(const index of [0,12,49,88,133,177,220,265,321,434]){
    const page=await browser.newPage({viewport:{width,height:900}});
    // Render the actual server/static template, isolated from external traffic.
    await page.route('**/*',route=>route.abort());
    await page.setContent(renderFranchiseHtml(pages[index],{neutralNaming}),{waitUntil:'domcontentloaded'});
    const layout=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,innerWidth,rosterPlayers:document.querySelectorAll('.side li').length,playLinks:[...document.querySelectorAll('a.button')].map(a=>a.getAttribute('href')),relatedLinks:[...document.querySelectorAll('section a[href^="/clash/all-time/"]')].map(a=>a.getAttribute('href'))}));
    const linksValid=layout.relatedLinks.every(href=>pages.some(p=>p.path===href));
    checks.push({width,neutralNaming,slug:pages[index].slug,...layout,passed:layout.scrollWidth<=width&&layout.rosterPlayers===10&&layout.relatedLinks.length===56&&linksValid&&layout.playLinks.length===2});
    if(width===320&&index===0)await page.screenshot({path:path.join(out,`franchise-mobile-320${neutralNaming?'-neutral':''}.png`),fullPage:false});
    await page.close();
  }
} finally {await browser.close();}
await fs.writeFile(path.join(out,'franchise-layout-audit.json'),JSON.stringify(checks,null,2)+'\n');
const failed=checks.filter(c=>!c.passed);
console.log(JSON.stringify({checks:checks.length,passed:checks.length-failed.length,failed:failed.map(c=>({width:c.width,neutralNaming:c.neutralNaming,slug:c.slug,scrollWidth:c.scrollWidth,rosterPlayers:c.rosterPlayers,relatedLinks:c.relatedLinks.length}))}));
if(failed.length)process.exitCode=1;
