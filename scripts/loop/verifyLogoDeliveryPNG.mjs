// Standalone encoded-asset proof; it reads actual files and never transforms or overwrites them.
// node verifyLogoDelivery.mjs --root REPO --derived FILE --sharp /absolute/path/to/sharp/dist/index.cjs --output REPORT
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs,v,i,a)=>i%2===0?[...pairs,[v,a[i+1]]]:pairs,[]));
assert(args['--root'] && args['--derived'] && args['--sharp'], 'Explicit --root, --derived and --sharp decoder module are required.');
const sharp = createRequire(import.meta.url)(path.resolve(args['--sharp']));
const originalPath = path.join(path.resolve(args['--root']), 'public/brand/eraclash-logo-mk1.png');
const derivedPath = path.resolve(args['--derived']);
const hash = b => createHash('sha256').update(b).digest('hex');
const CANONICAL = '788af24d641faf5f224e0c8bd9b201851f7e19d000d18a9c364af06283b92948';
const DELIVERY = 'bf9d137b771fe7f99857a40455fffd1afdf7352e78898690e60fe4b6b0076879';
const RGBA = 'ac7c2589ae33ba3acd7bccd08d650baa17ac8d8e15a7ab001b5460e0ea0fc385';
const [original, derived] = await Promise.all([fs.readFile(originalPath), fs.readFile(derivedPath)]);
assert.equal(hash(original), CANONICAL, 'Canonical PNG file bytes changed.');
assert.equal(hash(derived), DELIVERY, 'Delivery file differs from the selected tested encoding.');
assert(derived.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'Actual selected delivery must be PNG.');
const [pngMeta, deliveryMeta, pngRaw, deliveryRaw] = await Promise.all([
 sharp(original).metadata(), sharp(derived).metadata(),
 sharp(original).raw().toBuffer({resolveWithObject:true}), sharp(derived).raw().toBuffer({resolveWithObject:true}),
]);
assert.equal(pngMeta.format,'png'); assert.equal(deliveryMeta.format,'png');
for(const [label, meta, raw] of [['original',pngMeta,pngRaw],['delivery',deliveryMeta,deliveryRaw]]) {
 assert.equal(meta.width,760,label+' width'); assert.equal(meta.height,304,label+' height');
 assert.equal(meta.channels,4,label+' alpha channels'); assert.equal(meta.hasAlpha,true,label+' alpha');
 assert.equal(meta.space,'srgb',label+' colorspace'); assert.equal(meta.isPalette,false,label+' palette');
 assert.deepEqual([raw.info.width,raw.info.height,raw.info.channels],[760,304,4]);
 assert.equal(raw.data.length,924160); assert.equal(hash(raw.data),RGBA,label+' decoded RGBA hash');
}
let mismatchedBytes=0, mismatchedAlphaBytes=0;
for(let i=0;i<pngRaw.data.length;i++) if(pngRaw.data[i]!==deliveryRaw.data[i]) {mismatchedBytes++;if(i%4===3)mismatchedAlphaBytes++;}
assert(pngRaw.data.equals(deliveryRaw.data),'Decoded pixels differ, including hidden RGB behind transparent pixels.');
assert.equal(mismatchedBytes,0); assert.equal(mismatchedAlphaBytes,0);
assert.equal(hash(await fs.readFile(originalPath)),CANONICAL,'Source PNG was overwritten while verifying.');
const report={status:'PASS',kind:'ACTUAL_ENCODED_ASSET_PIXEL_PROOF',generatedAt:new Date().toISOString(),decoder:sharp.versions,
 original:{path:originalPath,bytes:original.length,sha256:hash(original)},delivery:{path:derivedPath,bytes:derived.length,sha256:hash(derived),bitstream:'PNG'},
 decoded:{width:760,height:304,channels:4,bytes:924160,sha256:RGBA,mismatchedBytes,mismatchedAlphaBytes,exactBufferEquality:true},
 savedBytes:original.length-derived.length,reductionPercent:100*(original.length-derived.length)/original.length,
 scope:'Encoding packaging proof only. No source edits, resizing, palette loss, alpha changes, visual changes, browser delivery or performance acceptance.'};
if(args['--output']) await fs.writeFile(path.resolve(args['--output']),JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify({status:report.status,decoded:report.decoded,savedBytes:report.savedBytes,reductionPercent:report.reductionPercent})+'\n');
