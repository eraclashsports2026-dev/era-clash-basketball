import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getTonightGames, scheduleDateKey, getFranchiseRoster, franchiseDisplayName, AUTOMATIC_FRANCHISE_COACH_ID, AUTOMATIC_FRANCHISE_ERA, FRANCHISE_DATA_VERSION, SCHEDULE_METADATA } from '../../src/loop/franchises.js';
import { POSITIONS } from '../../src/players.js';
import { neutralTeamNaming } from '../../src/loop/rights.js';
import { computeResultV3 } from '../../api/_lib/game-core-v3.js';
import { flags } from '../../api/_lib/flags.js';
import { renderSharePng } from '../../api/_lib/loopShareImage.js';
import { validatedOrigin, htmlEscape } from './franchise-pages.mjs';

export const activeTonightEngine = () => flags().previewSimEngine ? 'preview' : 'production';
export function tonightSeed(game, engine = activeTonightEngine()) {
  return createHash('sha256').update(`tonight|${FRANCHISE_DATA_VERSION}|${engine}|${game.id}|${game.homeId}|${game.awayId}|${AUTOMATIC_FRANCHISE_ERA}|neutral`).digest().readUInt32BE(0);
}
export async function createTonightResult(game, {engine = activeTonightEngine()} = {}) {
  if (!['production','preview'].includes(engine)) throw new Error('Engine must be production or preview.');
  if (engine !== activeTonightEngine()) throw new Error('Tonight engine must match the active PREVIEW_SIM_ENGINE_ENABLED policy.');
  const gold = getFranchiseRoster(game.homeId), blue = getFranchiseRoster(game.awayId), seed = tonightSeed(game, engine);
  const simulate = engine === 'preview' ? (await import('../../api/_lib/previewEngine.js')).computeResultPreview : computeResultV3;
  const computed = simulate('single', gold, blue, {coachGoldId:AUTOMATIC_FRANCHISE_COACH_ID, coachBlueId:AUTOMATIC_FRANCHISE_COACH_ID, eraStyleId:AUTOMATIC_FRANCHISE_ERA}, seed);
  return {kind:'tonight-content', ranked:false, officialResult:false, sourceDate:game.date, scheduledGameId:game.id, goldIds:gold.map(p => p.id), blueIds:blue.map(p => p.id), ...computed};
}
export function tonightCardModel(game, result, {neutralNaming = false} = {}) {
  const goldName = franchiseDisplayName(game.home, {neutralNaming}), blueName = franchiseDisplayName(game.away, {neutralNaming});
  return { title:'Tonight’s Clash', subtitle:`${game.date} · ${game.tipoffET} ET · All-time simulation`, goldName, blueName,
    score:result.core?.finalScore || result.finalScore,
    players:{gold:getFranchiseRoster(game.homeId).map((p,i) => ({name:p.name,pos:POSITIONS[i]})), blue:getFranchiseRoster(game.awayId).map((p,i) => ({name:p.name,pos:POSITIONS[i]}))},
    performers:result.core?.mvpLine ? [{name:result.core.mvp,line:`${result.core.mvpLine.pts} PTS · ${result.core.mvpLine.reb} REB · ${result.core.mvpLine.ast} AST`}] : [],
    footer:'Simulated all-time matchup · Balanced staff · Neutral court',
  };
}
export async function generateTonight({date = scheduleDateKey(), output, origin, neutralNaming = false, engine = activeTonightEngine()} = {}) {
  const base = validatedOrigin(origin), games = getTonightGames(date);
  if (!output) throw new Error('Supply an output directory.');
  const dir = path.resolve(output, date);
  await fs.mkdir(dir, {recursive:true});
  const cards = [];
  for (const game of games) {
    const result = await createTonightResult(game, {engine}), model = tonightCardModel(game, result, {neutralNaming});
    if (!model.score || !Number.isFinite(model.score.gold) || !Number.isFinite(model.score.blue)) throw new Error(`Missing engine score for ${game.id}`);
    const name = `${game.awayId}-at-${game.homeId}`, png = `${name}.png`;
    await fs.writeFile(path.join(dir,png), renderSharePng(model));
    await fs.writeFile(path.join(dir,`${name}.json`), JSON.stringify(result,null,2)+'\n');
    const frameModels = [{...model,score:undefined,performers:[],subtitle:`${game.date} · All-time lineups`}, {...model,score:undefined,performers:[],subtitle:'Meet the Gold five',players:{gold:model.players.gold,blue:[]}}, {...model,score:undefined,performers:[],subtitle:'Meet the Blue five',players:{gold:[],blue:model.players.blue}}, model];
    const frames = [];
    for (let i=0;i<frameModels.length;i++) {
      const filename = `${name}-frame-${i+1}.png`;
      await fs.writeFile(path.join(dir,filename), renderSharePng(frameModels[i]));
      frames.push({file:filename,durationMs:i===3?3000:4000});
    }
    const params = new URLSearchParams({gold:game.homeId,blue:game.awayId,entry:'watch'});
    const card = {scheduledGameId:game.id,homeId:game.homeId,awayId:game.awayId,tipoffET:game.tipoffET,score:model.score,png,frames,revealDurationMs:15000,resultFile:`${name}.json`,matchupUrl:`${base}${game.pairing.path}`,watchUrl:`${base}/clash/franchise?${params}`};
    cards.push(card);
  }
  const manifest = {date,engine,ranked:false,kind:'all-time-content',sourceUrl:SCHEDULE_METADATA.sourceUrl,sourceAsOf:SCHEDULE_METADATA.sourceAsOf,scheduleStatus:SCHEDULE_METADATA.status,unscheduledCupGames:SCHEDULE_METADATA.remainingGames,franchiseDataVersion:FRANCHISE_DATA_VERSION,neutralNaming,count:cards.length,cards,videoStatus:'PNG_FRAME_SEQUENCE_ONLY',note:'Four timed PNG frames form a 15-second reveal plan. This command does not render a video, send notifications, store ranked records, or deploy.'};
  await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  const e = htmlEscape;
  await fs.writeFile(path.join(dir,'index.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tonight’s Clash · ${e(date)}</title></head><body><main><h1>Tonight’s Clash · ${e(date)}</h1><p>All-time simulations using the official released schedule. These are generated simulation scores.</p>${cards.length ? cards.map(c => `<article><h2>${e(franchiseDisplayName(c.awayId,{neutralNaming}))} at ${e(franchiseDisplayName(c.homeId,{neutralNaming}))}</h2><p>${e(c.tipoffET)} ET</p><img src="${e(c.png)}" width="1200" height="630" style="max-width:100%;height:auto" alt="All-time simulation ${e(c.score.gold)} to ${e(c.score.blue)}"><p><a href="${e(c.watchUrl)}">Watch this Clash</a> · <a href="${e(c.matchupUrl)}">View the matchup</a></p></article>`).join('') : '<p>No assigned games on this date. Cup-dependent games may still be unassigned.</p>'}<footer><a href="${base}/privacy">Privacy</a> · <a href="${base}/terms">Terms</a><p>Not affiliated with, endorsed by, or sponsored by any professional basketball league or team.</p></footer></main></body></html>\n`);
  return {count:cards.length,date,output:dir,engine,manifest:path.join(dir,'manifest.json')};
}
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args=process.argv.slice(2), value=flag=>{const i=args.indexOf(flag);return i>=0?args[i+1]:undefined;};
  console.log(JSON.stringify(await generateTonight({date:value('--date') || scheduleDateKey(),output:value('--output') || 'artifacts/loop/tonight',origin:value('--origin') || process.env.PUBLIC_SITE_ORIGIN,neutralNaming:args.includes('--neutral') || neutralTeamNaming(process.env),engine:value('--engine') || activeTonightEngine()})));
}
