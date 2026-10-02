import fs from 'node:fs/promises';
import path from 'node:path';
import { buildFranchiseManifest, validatedOrigin } from '../scripts/loop/franchise-pages.mjs';

const origin=validatedOrigin(process.env.FRANCHISE_CRAWLER_ORIGIN || 'http://localhost:4320');
const artifactRoot=path.resolve(process.env.FRANCHISE_ARTIFACT_ROOT || 'artifacts/loop/franchise-pages');
const pages=buildFranchiseManifest({origin});
const decode=s=>s.replace(/&amp;/g,'&');
const checks=[];
for(const page of pages){
  const html=await fs.readFile(path.join(artifactRoot,page.path.slice(1),'index.html'),'utf8');
  const png=await fs.readFile(path.join(artifactRoot,page.imagePath.slice(1)));
  const related=[...html.matchAll(/href="(\/clash\/all-time\/[^"]+)"/g)].map(m=>m[1]);
  checks.push({kind:'generated',slug:page.slug,pass:html.includes(`<link rel="canonical" href="${page.canonical}">`)&&html.includes(`<meta property="og:image" content="${page.imageUrl}">`)&&related.length===56&&related.every(href=>pages.some(p=>p.path===href))&&png.subarray(0,8).toString('hex')==='89504e470d0a1a0a'&&png.readUInt32BE(16)===1200&&png.readUInt32BE(20)===630&&png.length<1_000_000});
}
for(const userAgent of ['Twitterbot/1.0','facebookexternalhit/1.1','Slackbot-LinkExpanding 1.0'])for(const index of [0,12,49,88,133,177,220,265,321,434]){
  const page=pages[index],response=await fetch(page.canonical,{headers:{'user-agent':userAgent}}),html=await response.text();
  const canonical=decode(html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] || ''),image=decode(html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] || '');
  let imageStatus=0,imageType='',imageBytes=0,dimensions=null;
  if(image){const img=await fetch(image,{headers:{'user-agent':userAgent}}),png=Buffer.from(await img.arrayBuffer());imageStatus=img.status;imageType=img.headers.get('content-type')||'';imageBytes=png.length;if(png.length>=24&&png.subarray(0,8).toString('hex')==='89504e470d0a1a0a')dimensions=[png.readUInt32BE(16),png.readUInt32BE(20)];}
  const related=(html.match(/href="\/clash\/all-time\//g)||[]).length,rosterRows=(html.match(/<li><span>/g)||[]).length;
  checks.push({kind:'runtime',slug:page.slug,userAgent,status:response.status,canonical,imageStatus,imageType,imageBytes,dimensions,related,rosterRows,pass:response.status===200&&canonical===page.canonical&&imageStatus===200&&imageType.startsWith('image/png')&&dimensions?.[0]===1200&&dimensions?.[1]===630&&imageBytes<1_000_000&&related===56&&rosterRows===10&&html.includes('entry=watch')&&html.includes('entry=control')&&html.includes('summary_large_image')});
}
const failed=checks.filter(c=>!c.pass),out=path.resolve('artifacts/loop/franchise-crawler-audit.json');
await fs.writeFile(out,JSON.stringify({origin,scope:'Generated files plus local real-handler crawler requests; no public deployment claim',checks,pass:failed.length===0},null,2)+'\n');
console.log(JSON.stringify({generated:checks.filter(c=>c.kind==='generated').length,runtime:checks.filter(c=>c.kind==='runtime').length,passed:checks.length-failed.length,failed,output:out}));
if(failed.length)process.exitCode=1;
