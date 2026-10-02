import { describe, it, expect } from 'vitest';
import { buildRouteInventory, classifyInteraction, parseArguments, parseHtmlMetadata, PROFILE_DEFINITIONS } from '../scripts/loop/fullBrowserAudit.mjs';
import { FRANCHISE_PAIRINGS } from '../src/loop/franchises.js';
import { resolveSitemapOrigin, buildPublicFranchiseSitemap, transformHomeMetadata } from '../scripts/loop/sitemap.mjs';

describe('Full browser audit evidence boundaries',()=>{
  it('covers all 435 pairing identities and actual public navigation paths',async()=>{
    const inventory=await buildRouteInventory(),paths=new Set(inventory.routes.map(row=>row.path));
    expect(inventory.routes.filter(row=>row.kind==='programmatic')).toHaveLength(435);
    expect(FRANCHISE_PAIRINGS.every(pairing=>paths.has(pairing.path))).toBe(true);
    for(const route of ['/','/play','/clash/modes','/clash/daily','/clash/filters','/clash/rooms','/clash/one-per-era','/privacy','/terms','/support','/leaderboard','/my-eraclash','/challenges'])expect(paths.has(route)).toBe(true);
    expect(inventory.sitemap.status).toBe('PASS');
  });
  it('requires an explicit execution environment and refuses overwrite-prone labels',()=>{
    expect(()=>parseArguments(['--label','../../run2'])).toThrow();
    expect(()=>parseArguments(['--label','run2'])).toThrow(/environment/);
    expect(parseArguments(['--label','prepare','--inventory-only']).inventoryOnly).toBe(true);
    expect(parseArguments(['--label','sample','--environment','local','--profiles','desktop']).scope).toBe('partial');
    expect(parseArguments(['--label','sample','--environment','local','--profiles','desktop,desktop,desktop,desktop,desktop']).scope).toBe('partial');
    expect(PROFILE_DEFINITIONS.filter(profile=>profile.mobile)).toHaveLength(4);
  });
  it('records blocked provider and stateful actions as unverified, never passed',()=>{
    for(const name of ['Send sign-in code','Delete my account','Create room','Watch this matchup','Roll 2 · keep held picks','Start the Gauntlet'])expect(classifyInteraction({name,tag:'button'}).status).toBe('UNVERIFIED');
    expect(classifyInteraction({name:'Choose your coach',tag:'select'}).status).toBe('PROBE');
    expect(classifyInteraction({name:'Play',tag:'button',disabled:true}).status).toBe('N/A');
    expect(classifyInteraction({name:'Play',href:'/clash/franchise'}).status).toBe('LINK');
  });
  it('reads HTML social metadata and HTML-decodes an actual canonical query URL',()=>{
    const model=parseHtmlMetadata('<html><head><title>Gold &amp; Blue</title><link rel="canonical" href="https://example.test/card/abc"><meta property="og:image" content="https://example.test/api/share-page?id=abc&amp;format=png"><meta name="twitter:card" content="summary_large_image"></head><body><a href="/clash/franchise?gold=boston&amp;entry=watch">Watch</a></body></html>');
    expect(model.title).toBe('Gold & Blue');expect(model.canonical).toBe('https://example.test/card/abc');expect(model.metas['og:image']).toBe('https://example.test/api/share-page?id=abc&format=png');expect(model.links[0]).toBe('/clash/franchise?gold=boston&entry=watch');
  });
  it('generates deployment sitemap URLs from actual supplied environment values and rejects unsafe hosted fallbacks',()=>{
    expect(resolveSitemapOrigin({VERCEL:'1',VERCEL_PROJECT_PRODUCTION_URL:'actual-owner-domain.test',VERCEL_URL:'actual-preview.test'}).origin).toBe('https://actual-owner-domain.test');
    expect(resolveSitemapOrigin({VERCEL:'1',VERCEL_URL:'actual-preview.test'}).origin).toBe('https://actual-preview.test');
    expect(()=>resolveSitemapOrigin({VERCEL:'1'},{allowLocal:true})).toThrow();
    expect(()=>resolveSitemapOrigin({VERCEL:'1',PUBLIC_SITE_ORIGIN:'http://localhost:4320'})).toThrow();
    expect(resolveSitemapOrigin({},{allowLocal:true}).localOnly).toBe(true);
    const xml=buildPublicFranchiseSitemap('https://actual-owner-domain.test');expect((xml.match(/<loc>/g)||[])).toHaveLength(435);expect(xml).not.toContain('localhost');
  });
  it('binds home social/canonical URLs to the configured origin without changing simulation copy',()=>{
    const html='<html><head><title>EraClash</title><meta name="description" content="An era-aware possession simulation."><meta property="og:url" content="https://stale.test"><meta property="og:image" content="__ERACLASH_SITE_ORIGIN__/og-home.png"><meta name="twitter:image" content="https://stale.test/og-home.png"></head></html>';
    const result=transformHomeMetadata(html,'https://verified-owner-domain.test');
    expect(result).toContain('era-aware possession simulation');expect(result).not.toContain('stale.test');expect(result).not.toContain('__ERACLASH_SITE_ORIGIN__');
    const parsed=parseHtmlMetadata(result);expect(parsed.canonical).toBe('https://verified-owner-domain.test/');expect(parsed.metas['og:url']).toBe(parsed.canonical);expect(parsed.metas['og:image']).toBe('https://verified-owner-domain.test/og-home.png');expect(parsed.metas['twitter:image']).toBe(parsed.metas['og:image']);
  });
});
