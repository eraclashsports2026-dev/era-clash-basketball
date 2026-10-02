// Real handler + rendered card gates. Local harness only; no provider writes.
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { legalFive } from '../../src/loop/draft/model.js';
import { FRANCHISES } from '../../src/loop/franchises.js';
const mode=process.argv[2] || 'any-five', origin=process.argv[3] || 'http://localhost:4178';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))throw new Error('This emulation gate must never target production.');
let cookie='', checks=[];
const check=(name,pass,detail='')=>{checks.push({name,pass,detail});console.log(`${pass?'PASS':'FAIL'} ${name} ${detail}`)};
async function post(path,body){const r=await fetch(origin+path,{method:'POST',headers:{'content-type':'application/json',origin,cookie},body:JSON.stringify(body)});const c=r.headers.get('set-cookie');if(c)cookie=c.split(';')[0];return{status:r.status,body:await r.json()};}
const api=b=>post('/api/game',{action:'loop',simulationId:randomUUID(),...b});
try{
  let result;
  if(mode==='daily'){
    let run=await api({op:'daily-start'});check('Daily starts as guest',run.status===200);const dailyToken=run.body.dailyToken;
    for(let i=0;i<2;i++)run=await api({op:'daily-roll',dailyToken,holdSlots:[],holdRoles:[]});
    run=await api({op:'daily-roll',dailyToken,coachId:run.body.state.coachOffers[0].coachId});
    result=await api({op:'daily-play',dailyToken});const twice=await api({op:'daily-play',dailyToken});check('Second Daily attempt blocked',twice.status===409);
  }else if(mode==='gauntlet'){
    const run=await api({op:'gauntlet-start',goldIds:legalFive()});result=await api({op:'gauntlet-play',gauntletToken:run.body.gauntletToken,stage:0});check('Gauntlet advances or ends on loss',result.body.gauntlet?.stage===1);
  }else if(mode==='rooms'){
    const room=await api({op:'room-create'});check('Private invite route created',room.status===200&&room.body.invitePath.startsWith('/clash/rooms?invite='));result=await api({op:'play',mode:'any-five',goldIds:legalFive()});const added=await api({op:'room-challenge',roomId:room.body.roomId,resultId:result.body.resultId});check('Own completed result enters private feed',added.body.room?.feed.length===1);
  }else{
    let options={};let ids;
    if(mode==='spin'){const spin=await api({op:'spin-start'});options={spinReceipt:spin.body.spinReceipt};ids=legalFive({kind:'spin',slots:spin.body.slots});}
    else if(['franchise','tonight'].includes(mode)){ids=FRANCHISES[0].playerIds;options={blueIds:FRANCHISES[1].playerIds};}
    else{ids=legalFive({kind:mode,franchise:mode==='one-franchise'?'boston':''});options={franchise:'boston'};}
    result=await api({op:'play',mode,goldIds:ids,...options});
  }
  check('Authoritative guest game completes',result.status===200,`HTTP${result.status}`);
  check('Candidate4 identity retained',result.body.result?.candidate?.possessionCalibrationVersion==='1.4.0'&&result.body.result.candidate.coreHash.startsWith('55bb26a2'));
  const published=await post('/api/result',{resultId:result.body.resultId,publicRecap:true});check('Owned recap published',published.status===200);
  const path=published.body.url?new URL(published.body.url,origin).pathname:`/card/${published.body.id}`;
  for(const ua of ['Twitterbot','facebookexternalhit','Slackbot']){
    const r=await fetch(origin+path,{headers:{'user-agent':ua}}), html=await r.text();check(`${ua} crawler metadata`,r.status===200&&['og:title','og:description','og:image','og:url','twitter:card'].every(tag=>html.includes(tag)));
    const image=html.match(/property="og:image" content="([^"]+)"/)?.[1];const png=await fetch(image?.replaceAll('&amp;','&')||origin+'/missing');const bytes=Buffer.from(await png.arrayBuffer());check(`${ua} 1200x630 PNG`,png.status===200&&png.headers.get('content-type')?.includes('image/png')&&bytes.length<1e6&&bytes.length>24&&bytes.readUInt32BE(16)===1200&&bytes.readUInt32BE(20)===630);
  }
}catch(e){check('Journey completed without an exception',false,String(e.message));}
mkdirSync('data/validation/loop-foundation/gates',{recursive:true});writeFileSync(`data/validation/loop-foundation/gates/${mode}.json`,JSON.stringify({mode,origin,generatedAt:new Date().toISOString(),emulation:true,checks},null,2)+'\n');console.log(`${checks.filter(c=>c.pass).length}/${checks.length} checks passed`);process.exit(checks.every(c=>c.pass)?0:1);
