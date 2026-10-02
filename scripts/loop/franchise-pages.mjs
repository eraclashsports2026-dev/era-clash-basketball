import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRANCHISES, FRANCHISE_PAIRINGS, getFranchise, FRANCHISE_DATA_VERSION } from '../../src/loop/franchises.js';
import { neutralTeamNaming } from '../../src/loop/rights.js';
import { renderSharePng } from '../../api/_lib/loopShareImage.js';
import { franchiseShareModel, franchiseSharePage } from '../../api/share-page.js';

export const htmlEscape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
export function validatedOrigin(value) {
  if (!value) throw new Error('Supply --origin or PUBLIC_SITE_ORIGIN for canonical URLs.');
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw new Error('Origin must be an http(s) origin without a path, query, credentials, or fragment.');
  return parsed.origin;
}
export function franchisePageModel(pairing, { neutralNaming = false } = {}) {
  if (!getFranchise(pairing.goldId) || !getFranchise(pairing.blueId)) throw new Error('Unknown franchise pairing');
  return franchiseShareModel(pairing, {neutralNaming});
}
export function buildFranchiseManifest({ origin, neutralNaming = false } = {}) {
  const base = validatedOrigin(origin);
  return FRANCHISE_PAIRINGS.map(pairing => ({ ...pairing, canonical:`${base}${pairing.path}`, imagePath:`/og/franchise/${pairing.slug}.png`, imageUrl:`${base}/og/franchise/${pairing.slug}.png`, model:franchisePageModel(pairing, {neutralNaming}) }));
}
export function renderFranchiseHtml(page, { neutralNaming = false } = {}) {
  return franchiseSharePage(page, {origin:new URL(page.canonical).origin,image:page.imagePath,neutralNaming});
}
export function buildFranchiseSitemap(manifest) {
  if (manifest.length !== 435 || new Set(manifest.map(p => p.canonical)).size !== 435) throw new Error('Franchise sitemap must contain exactly 435 unique pairings.');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${manifest.map(p => `  <url><loc>${htmlEscape(p.canonical)}</loc></url>`).join('\n')}\n</urlset>\n`;
}
export async function generateFranchisePages({ origin, output, neutralNaming = false } = {}) {
  if (!output) throw new Error('Supply an output directory.');
  const manifest = buildFranchiseManifest({origin, neutralNaming});
  const target = path.resolve(output);
  await fs.mkdir(path.join(target, 'og/franchise'), {recursive:true});
  for (const page of manifest) {
    const dir = path.join(target, page.path.slice(1));
    await fs.mkdir(dir, {recursive:true});
    await fs.writeFile(path.join(dir, 'index.html'), renderFranchiseHtml(page, {neutralNaming}));
    await fs.writeFile(path.join(target, page.imagePath.slice(1)), renderSharePng(page.model));
  }
  await fs.writeFile(path.join(target, 'franchise-sitemap.xml'), buildFranchiseSitemap(manifest));
  await fs.writeFile(path.join(target, 'franchise-pages.json'), JSON.stringify({version:FRANCHISE_DATA_VERSION, neutralNaming, count:manifest.length, franchises:FRANCHISES.map(f => f.id), pages:manifest.map(({model,...p}) => p)}, null, 2)+'\n');
  return {count:manifest.length, output:target, sitemap:path.join(target,'franchise-sitemap.xml')};
}
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2), value = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i+1] : undefined; };
  const result = await generateFranchisePages({origin:value('--origin') || process.env.PUBLIC_SITE_ORIGIN, output:value('--output') || 'artifacts/loop/franchise-pages', neutralNaming:args.includes('--neutral') || neutralTeamNaming(process.env)});
  console.log(JSON.stringify(result));
}
