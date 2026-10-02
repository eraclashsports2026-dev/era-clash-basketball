import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root='/private/tmp/eraclash-run3-final-20261002',origin='http://localhost:4320',dir=path.join(root,'data/validation/loop-foundation/browser-audit/run3-independent-dc926ad');
const report={generatedAt:new Date().toISOString(),sourceSHA:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),scope:'Read-only local production client/actual handlers; real Supabase RLS, SMTP and hosted headers not established',checks:[],headers:[],assets:[]};
const check=(name,pass,detail={})=>report.checks.push({name,status:pass?'PASS':'FAIL',...detail});
const sharing=JSON.parse(await fs.readFile(path.join(root,'data/validation/loop-foundation/sharing/run3-independent-dc926ad/report.json')));
const lab=sharing.samples.find(s=>s.mode==='lab');
for(const target of ['/', '/clash/any-five',sharing.samples[0].path,'/clash/all-time/boston-vs-la-lakers','/api/health','/api/game?resultId='+lab.sourceResultId,'/run3-unknown-security-check']){
 const r=await fetch(origin+target),headers=Object.fromEntries(r.headers),body=await r.text();report.headers.push({path:target,httpStatus:r.status,headers,bodySHA256:createHash('sha256').update(body).digest('hex')});
 const required=['content-security-policy','strict-transport-security','x-content-type-options','referrer-policy','permissions-policy','cross-origin-opener-policy'];
 check(target+': real served local response contains security headers',required.every(k=>headers[k])&&headers['x-content-type-options']==='nosniff'&&headers['content-security-policy'].includes("frame-ancestors 'none'"),{present:required.filter(k=>headers[k]),missing:required.filter(k=>!headers[k])});
 if(target.includes('resultId=')){
  const record=JSON.parse(body);report.publicLabGet={httpStatus:r.status,keys:Object.keys(record),loopKeys:Object.keys(record.loop||{}),id:record.id,mode:record.loop?.mode,score:record.core?.finalScore,headers};
  check('Unauthenticated actual Lab full-result GET excludes private scenario/session/seed without losing actual result identity',r.ok&&record.id===lab.sourceResultId&&record.loop?.mode==='lab'&&!('scenario'in(record.loop||{}))&&!['session','seed','owner','accountId','fingerprint'].some(k=>k in record)&&!body.includes('Private sharing audit scenario')&&record.core?.finalScore?.gold===lab.score.gold&&record.core?.finalScore?.blue===lab.score.blue,{projection:report.publicLabGet});
 }
}
const walk=async p=>{const results=[];for(const d of await fs.readdir(p,{withFileTypes:true})){const n=path.join(p,d.name);if(d.isDirectory())results.push(...await walk(n));else if(/\.(js|json|html)$/.test(n))results.push(n);}return results;};
for(const file of await walk(path.join(root,'dist'))){
 const bytes=await fs.readFile(file),text=bytes.toString('utf8'),findings=[];
 for(const [kind,re] of [['supabase-secret',/sb_secret_[A-Za-z0-9_-]{16,}/g],['stripe-secret',/sk_(?:live|test)_[A-Za-z0-9]{16,}/g],['aws-access',/AKIA[0-9A-Z]{16}/g],['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g]])if(re.test(text))findings.push({kind});
 for(const token of text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[]){try{const payload=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));if(payload.role==='service_role')findings.push({kind:'service-role-JWT'});}catch{}}
 const row={file:path.relative(root,file),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),findings};report.assets.push(row);
}
check('Actually served normal build text assets contain no recognizable server-secret patterns',report.assets.every(a=>a.findings.length===0),{scannedFiles:report.assets.length,limits:'Pattern scan is bounded and cannot prove absence of all secrets; no secret values emitted.'});
report.sourceProjectRefs=await fs.readFile(path.join(root,'config/projectRefs.js'),'utf8');
report.provider={status:'UNVERIFIED',reason:'Source config separates Preview and production; actual hosted Preview is access-protected and local health explicitly has cloudAccounts.enabled=false/ready=false. No actual provider credentials, identities or database writes were used.'};
report.runtimeSHA=report.sourceSHA;report.runnerSHA256=createHash('sha256').update(await fs.readFile(new URL(import.meta.url))).digest('hex');report.distBuildStamp=(await fs.readFile(path.join(root,'dist/index.html'),'utf8')).match(/name="eraclash-build" content="([^"]+)"/)?.[1];report.counts=Object.fromEntries(['PASS','FAIL'].map(status=>[status,report.checks.filter(c=>c.status===status).length]));
await fs.writeFile(path.join(dir,'readonly-security.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({file:path.join(dir,'readonly-security.json'),counts:report.counts,assetFiles:report.assets.length}));
