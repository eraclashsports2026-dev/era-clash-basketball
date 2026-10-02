// Post-application PNG delivery acceptance. Explicit native defaults; exact pixel equality is required.
// node verifyLogoDeliveryBrowserPNG.mjs --root REPO --base http://localhost:PORT --output REPORT.json
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const argv=process.argv.slice(2),args=Object.fromEntries(argv.reduce((p,v,i)=>i%2===0?[...p,[v,argv[i+1]]]:p,[]));
assert(args['--root']&&args['--base']&&args['--output'],'Explicit --root, --base, --output required');
const root=path.resolve(args['--root']),base=new URL(args['--base']).origin;
const {chromium}=createRequire(path.join(root,'package.json'))('@playwright/test');
const ORIGINAL='/brand/eraclash-logo-mk1.png',DELIVERY='/brand/eraclash-logo-mk1-lossless-bf9d137b.png';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox']});
const report={status:'RUNNING',generatedAt:new Date().toISOString(),base,root,checks:[],screens:[],browserErrors:[]};
const check=(name,value,evidence)=>{report.checks.push({name,pass:!!value,evidence});assert(value,name);};
try {
 for(const width of [1360,390]) {
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),page=await context.newPage();
  const requests=[],responses=[];page.on('request',r=>{const p=new URL(r.url()).pathname;if([ORIGINAL,DELIVERY].includes(p))requests.push({path:p,resourceType:r.resourceType()});});
  page.on('response',r=>{const p=new URL(r.url()).pathname;if([ORIGINAL,DELIVERY].includes(p))responses.push({path:p,status:r.status(),mime:r.headers()['content-type']});});
  page.on('pageerror',e=>report.browserErrors.push(e.message));
  await page.goto(base+'/play',{waitUntil:'networkidle'});await page.locator('img.ec-lobby-logo').waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('img.ec-brand-logo,img.ec-lobby-logo')].every(i=>i.complete&&i.naturalWidth===760));
  const images=await page.locator('img.ec-brand-logo,img.ec-lobby-logo').evaluateAll(list=>list.filter(i=>i.getBoundingClientRect().height>0).map(i=>({className:i.className,src:new URL(i.src).pathname,srcSet:i.getAttribute('srcset'),currentSrc:new URL(i.currentSrc).pathname,alt:i.alt,width:i.getAttribute('width'),height:i.getAttribute('height'),naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight,decoding:i.decoding,loading:i.loading,fetchpriority:i.getAttribute('fetchpriority'),mark:i.getAttribute('data-brand-mark'),pictureWrapper:!!i.closest('picture'),bounds:{width:i.getBoundingClientRect().width,height:i.getBoundingClientRect().height}})));
  const initialRequests=structuredClone(requests),initialResponses=structuredClone(responses);
  check(width+' visible original header and lobby marks',images.length===2,images);
  check(width+' direct imgs select exact-native derivative and retain canonical fallback attributes',images.every(i=>i.currentSrc===DELIVERY&&i.src===ORIGINAL&&i.srcSet===DELIVERY&&i.width==='760'&&i.height==='304'&&i.naturalWidth===760&&i.naturalHeight===304&&i.decoding==='async'&&!i.pictureWrapper),images);
  const header=images.find(i=>i.className==='ec-brand-logo'),hero=images.find(i=>i.className==='ec-lobby-logo');
  check(width+' original labels marks and eager priority hints retained',header.alt===''&&header.mark==='eraclash-logo-mk1'&&hero.alt==='EraClash Basketball'&&hero.loading==='eager'&&hero.fetchpriority==='high',images);
  const expectedHeader=width===1360?[85,34]:[70,28],expectedHero=width===1360?[340,136]:[304.1875,121.671875];
  check(width+' logo boxes equal preceding original-mark layout',Math.abs(header.bounds.width-expectedHeader[0])<0.02&&Math.abs(header.bounds.height-expectedHeader[1])<0.02&&Math.abs(hero.bounds.width-expectedHero[0])<0.02&&Math.abs(hero.bounds.height-expectedHero[1])<0.02,images.map(i=>({className:i.className,bounds:i.bounds})));
  check(width+' fresh load fetches delivery once without original duplicate preload',initialRequests.length===1&&initialRequests[0].path===DELIVERY,{requests:initialRequests,responses:initialResponses});
  check(width+' derivative HTTP200 image/png',initialResponses.some(r=>r.path===DELIVERY&&r.status===200&&/^image\/png(?:;|$)/i.test(r.mime||'')),initialResponses);
  check(width+' no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const preloads=await page.locator('link[rel=preload][as=image]').evaluateAll(xs=>xs.map(x=>({type:x.type,path:new URL(x.href).pathname})));
  check(width+' one matching typed PNG preload',preloads.length===1&&preloads[0].type==='image/png'&&preloads[0].path===DELIVERY,preloads);
  report.screens.push({width,images,initialRequests,initialResponses});
  if(width===390) {
   const pixel=await page.evaluate(async({original,delivery})=>{
    const read=async src=>{const i=new Image();i.src=src;await i.decode();const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;c.getContext('2d',{willReadFrequently:true}).drawImage(i,0,0);return c.getContext('2d').getImageData(0,0,c.width,c.height).data;};
    const [a,b]=await Promise.all([read(original),read(delivery)]);let mismatch=0,alpha=0,maxDelta=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i]){mismatch++;if(i%4===3)alpha++;maxDelta=Math.max(maxDelta,Math.abs(a[i]-b[i]));}return{bytes:a.length,mismatch,alpha,maxDelta};
   },{original:ORIGINAL,delivery:DELIVERY});
   check('actual default native PNG/canonical PNG decoded canvas pixels exactly equal',pixel.bytes===924160&&pixel.mismatch===0&&pixel.alpha===0&&pixel.maxDelta===0,pixel);
   const originalResponse=await page.request.get(base+ORIGINAL),originalBytes=await originalResponse.body();
   check('canonical fallback HTTP bytes remain owner-approved PNG',originalResponse.ok()&&createHash('sha256').update(originalBytes).digest('hex')==='788af24d641faf5f224e0c8bd9b201851f7e19d000d18a9c364af06283b92948');
  }
  await context.close();
 }
 // Feature-absent fixture: browser uses the retained original src when optional srcset is absent.
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();await page.goto(base+'/privacy', { waitUntil: 'networkidle' });
 await page.setContent(`<img id="fallback" src="${base+ORIGINAL}" width="760" height="304" alt="EraClash Basketball">`, { waitUntil: 'domcontentloaded' });
 await page.waitForFunction(()=>document.querySelector('#fallback')?.complete&&document.querySelector('#fallback').naturalWidth===760);
 const fallback=await page.locator('#fallback').evaluate(i=>({currentSrc:new URL(i.currentSrc).pathname,width:i.naturalWidth,height:i.naturalHeight,alt:i.alt,srcset:i.getAttribute('srcset')}));
 check('optional srcset absent retains native canonical PNG fallback',fallback.srcset===null&&fallback.currentSrc===ORIGINAL&&fallback.width===760&&fallback.height===304&&fallback.alt==='EraClash Basketball',fallback);
 await context.close();check('no browser runtime errors',report.browserErrors.length===0,report.browserErrors);report.status='PASS';
}catch(error){report.status='FAIL';report.failure=error.stack||String(error);process.exitCode=1;}
finally{await browser.close();await fs.writeFile(path.resolve(args['--output']),JSON.stringify(report,null,2)+'\n');process.stdout.write(JSON.stringify({status:report.status,passed:report.checks.filter(x=>x.pass).length,failed:report.checks.filter(x=>!x.pass).length,output:args['--output']})+'\n');}
