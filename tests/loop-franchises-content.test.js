import { describe, it, expect, vi, afterEach } from 'vitest';
import { FRANCHISE_PAIRINGS, getTonightGames } from '../src/loop/franchises.js';
import { buildFranchiseManifest, buildFranchiseSitemap, renderFranchiseHtml, validatedOrigin } from '../scripts/loop/franchise-pages.mjs';
import { activeTonightEngine, tonightSeed, createTonightResult, tonightCardModel } from '../scripts/loop/tonight.mjs';
import { renderSharePng } from '../api/_lib/loopShareImage.js';

const origin='https://preview.example.invalid';
describe('programmatic content manifest, markup and crawler images',()=>{
  it('builds 435 canonical HTML pages with absolute social tags and internal play links',()=>{
    const pages=buildFranchiseManifest({origin});
    expect(pages).toHaveLength(435);
    for(const page of pages){
      const html=renderFranchiseHtml(page);
      expect(html).toContain(`<link rel="canonical" href="${page.canonical}">`);
      expect(html).toContain(`<meta property="og:image" content="${page.imageUrl}">`);
      expect(html).toContain('summary_large_image');
      expect(html).toContain('entry=watch');expect(html).toContain('entry=control');
      expect(html).toContain('href="/privacy"');expect(html).toContain('href="/terms"');
      expect((html.match(/href="\/clash\/all-time\//g)||[])).toHaveLength(56);
      expect(html).not.toContain('NBA');
      expect(page.model.score).toBeUndefined();
      expect(page.model.players.gold).toHaveLength(5);expect(page.model.players.blue).toHaveLength(5);
    }
    const sitemap=buildFranchiseSitemap(pages);
    expect((sitemap.match(/<loc>/g)||[])).toHaveLength(435);
    expect(sitemap).toContain('http://www.sitemaps.org/schemas/sitemap/0.9');
    expect(()=>buildFranchiseSitemap(pages.slice(0,434))).toThrow('435');
  });
  it('neutral naming reaches titles, rosters and social metadata without logos',()=>{
    const page=buildFranchiseManifest({origin,neutralNaming:true}).find(p=>p.slug==='la-clippers-vs-la-lakers');
    const html=renderFranchiseHtml(page,{neutralNaming:true});
    expect(html).toContain('Los Angeles Gold · All-time');expect(html).toContain('Los Angeles Blue · All-time');
    expect(html).not.toMatch(/Lakers|Clippers|Celtics|logo/);
  });
  it('rejects origins that could create incorrect canonicals or credential leaks',()=>{
    for(const bad of [undefined,'https://preview.example/a','javascript:alert(1)','https://user:secret@example.com','https://example.com?x=1','https://example.com/#x'])expect(()=>validatedOrigin(bad)).toThrow();
    expect(validatedOrigin('http://localhost:4173')).toBe('http://localhost:4173');
  });
  it('renders ten independently sampled images as PNG 1200×630 under one megabyte',()=>{
    const pages=buildFranchiseManifest({origin});
    for(const index of [0,12,49,88,133,177,220,265,321,434]){
      const png=renderSharePng(pages[index].model);
      expect(png.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(png.readUInt32BE(16)).toBe(1200);expect(png.readUInt32BE(20)).toBe(630);
      expect(png.length).toBeLessThan(1_000_000);
    }
  });
});
describe('nightly content uses deterministic actual engine scores',()=>{
  afterEach(()=>vi.unstubAllEnvs());
  it('follows the same preview flag as the public path and rejects a mismatched engine',async()=>{
    const game=getTonightGames('2026-10-20')[0];
    vi.stubEnv('PREVIEW_SIM_ENGINE_ENABLED','true');
    expect(activeTonightEngine()).toBe('preview');
    await expect(createTonightResult(game,{engine:'production'})).rejects.toThrow('active PREVIEW_SIM_ENGINE_ENABLED');
    const result=await createTonightResult(game);
    expect(result.preview).toBe(true);
    expect(result.candidate?.candidateId).toBeTruthy();
    vi.stubEnv('PREVIEW_SIM_ENGINE_ENABLED','false');
    expect(activeTonightEngine()).toBe('production');
    await expect(createTonightResult(game,{engine:'preview'})).rejects.toThrow('active PREVIEW_SIM_ENGINE_ENABLED');
  });
  it('seeds all three opening games reproducibly with separate engine namespaces',()=>{
    const games=getTonightGames('2026-10-20');
    expect(new Set(games.map(g=>tonightSeed(g))).size).toBe(3);
    for(const game of games){expect(tonightSeed(game)).toBe(tonightSeed({...game}));expect(tonightSeed(game,'preview')).not.toBe(tonightSeed(game,'production'));}
  });
  it('reconciles a generated card with engine box scores and marks content unranked',async()=>{
    const game=getTonightGames('2026-10-20')[0], result=await createTonightResult(game);
    const model=tonightCardModel(game,result);
    expect(result.ranked).toBe(false);expect(result.officialResult).toBe(false);
    expect(model.score.gold).toBe(result.core.teamAStats.reduce((sum,p)=>sum+p.pts,0));
    expect(model.score.blue).toBe(result.core.teamBStats.reduce((sum,p)=>sum+p.pts,0));
    expect(result.coachIds).toEqual({gold:'neutral',blue:'neutral'});
    expect(result.eraId).toBe('2020s');
    expect(model.footer).toContain('Simulated');
    expect(FRANCHISE_PAIRINGS.some(p=>p.slug===game.pairing.slug)).toBe(true);
  });
});
