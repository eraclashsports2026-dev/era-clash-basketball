// Read-only local verification of frozen sources, build secrets and headers.
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const label = process.argv[2], origin = process.argv[3] || 'http://localhost:4320';
if (!/^(run2|run3)$/.test(label || '') || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) throw new Error('Audit requires a fresh run2/run3 label and local-only target.');
const git = (...args) => execFileSync('git', args, {encoding:'utf8'}).trim();
const baseline = '16ea9085a9f864c607cad226e6577177004268e1';
const protectedPaths = new Set(JSON.parse(readFileSync('data/validation/loop-foundation/protected-files.json','utf8')).rows.map(row=>row.file));
for (const file of ['api/_lib/previewCoaching.js','api/_lib/previewKeyMoments.js','src/coaches.js']) {
  try { git('cat-file','-e',`${baseline}:${file}`); protectedPaths.add(file); } catch {}
}
const rows = [...protectedPaths].sort().map(file => {
  const bytes = readFileSync(file);
  const actual = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  const expected = git('rev-parse',`${baseline}:${file}`);
  return {file,expected,actual,unchanged:actual===expected};
});
const walk = dir => readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(join(dir,entry.name)):[join(dir,entry.name)]);
const assetFindings = [];
for (const file of walk('dist').filter(file=>/\.(js|html|css)$/.test(file))) {
  const text = readFileSync(file,'utf8');
  if (/sb_secret_[A-Za-z0-9_-]{16,}/.test(text)) assetFindings.push({file,type:'secret-key-shaped value'});
  if (/test-token\.[0-9a-f-]{36}|__loop-qa\/read|loop-stateful-browser-provider/.test(text)) assetFindings.push({file,type:'test-only account fixture'});
  for (const match of text.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
    try { if(JSON.parse(Buffer.from(match[0].split('.')[1],'base64url').toString()).role==='service_role')assetFindings.push({file,type:'service-role JWT'}); } catch {}
  }
}
const response = await fetch(origin), headers = Object.fromEntries(response.headers);
const required = ['content-security-policy','strict-transport-security','x-content-type-options','referrer-policy','permissions-policy','cross-origin-opener-policy'];
const headerChecks = required.map(name=>({name,present:!!headers[name],value:headers[name]||null}));
const csp = headers['content-security-policy'] || '';
const checks = [
  {name:'Protected engine/calibration source bytes unchanged',pass:rows.every(row=>row.unchanged)},
  {name:'Main unchanged',pass:git('rev-parse','main')==='b31d2ada57e977cf1b2ce546bde86aaf1547e6c8'},
  {name:'Wave1 unchanged',pass:git('rev-parse','origin/wave1')==='4dc59e7b2175b82cea8d5ab5c336b75b550c7f59'},
  {name:'Wave2 unchanged',pass:git('rev-parse','origin/wave2')==='ef0caa525c4cf6830fe20b4a8ef5d483e29afd86'},
  {name:'Built client has no recognizable server credential or test provider',pass:assetFindings.length===0},
  {name:'Required security headers present',pass:headerChecks.every(row=>row.present)},
  {name:'CSP frame ancestors deny embedding',pass:/frame-ancestors 'none'/.test(csp)},
  {name:'Homepage HTTP200',pass:response.status===200},
];
const report={label,generatedAt:new Date().toISOString(),origin,sourceSha:git('rev-parse','HEAD'),environment:'local production-build client / real handlers, memory store',identity:'anonymous read-only',status:checks.every(row=>row.pass)?'PASS':'FAIL',rls:'UNVERIFIED — real Basketball Preview credentials unavailable',protectedCount:rows.length,rows,assetFindings,headerChecks,checks};
mkdirSync('data/validation/loop-foundation/security',{recursive:true});
writeFileSync(`data/validation/loop-foundation/security/${label}.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,protectedCount:rows.length,checks},null,2));
process.exitCode=checks.every(row=>row.pass)?0:1;
