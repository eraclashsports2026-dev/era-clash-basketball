import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRANCHISE_PAIRINGS } from '../../src/loop/franchises.js';

export function resolveSitemapOrigin(environment={}, {explicit,allowLocal=false}={}) {
  const hosted=environment.VERCEL==='1'||environment.VERCEL_ENV==='production';
  const supplied=explicit||environment.PUBLIC_SITE_ORIGIN;
  const vercelHost=environment.VERCEL_PROJECT_PRODUCTION_URL||environment.VERCEL_URL;
  let value=supplied||(vercelHost?(vercelHost.includes('://')?vercelHost:`https://${vercelHost}`):undefined);
  if(!value&&allowLocal&&!hosted)value=environment.ECLASH_LOCAL_SITE_ORIGIN||'http://localhost:4320';
  if(!value)throw new Error('Sitemap needs PUBLIC_SITE_ORIGIN, VERCEL_PROJECT_PRODUCTION_URL or VERCEL_URL. Local verification must use --local.');
  const parsed=new URL(value),local=['localhost','127.0.0.1','[::1]'].includes(parsed.hostname);
  if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/')throw new Error('Sitemap origin must be a plain http(s) origin.');
  if(hosted&&(local||parsed.protocol!=='https:'))throw new Error('Hosted builds require a public HTTPS sitemap origin, never localhost.');
  return {origin:parsed.origin,localOnly:local,source:supplied?'explicit-or-PUBLIC_SITE_ORIGIN':vercelHost?'vercel-system-url':'local-verification'};
}
export function buildPublicFranchiseSitemap(origin) {
  const resolved=resolveSitemapOrigin({}, {explicit:origin});
  const urls=FRANCHISE_PAIRINGS.map(pairing=>resolved.origin+pairing.path);
  if(urls.length!==435||new Set(urls).size!==435)throw new Error('Expected 435 distinct franchise pairing URLs.');
  const escape=value=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url=>`  <url><loc>${escape(url)}</loc></url>`).join('\n')}\n</urlset>\n`;
}
export function transformHomeMetadata(html,origin) {
  const base=resolveSitemapOrigin({}, {explicit:origin}).origin;
  let transformed=html.replaceAll('__ERACLASH_SITE_ORIGIN__',base);
  transformed=transformed.replace(/<meta\b[^>]*>/gi,tag=>{
    const name=tag.match(/\b(?:property|name)=["']([^"']+)["']/i)?.[1];
    const content=name==='og:url'?`${base}/`:['og:image','twitter:image'].includes(name)?`${base}/og-home.png`:null;
    return content?tag.replace(/\bcontent=["'][^"']*["']/i,`content="${content}"`):tag;
  });
  const canonical=`<link rel="canonical" href="${base}/" />`;
  if(/<link\b[^>]*\brel=["']canonical["']/i.test(transformed))transformed=transformed.replace(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/gi,canonical);
  else transformed=transformed.replace(/<\/head>/i,`    ${canonical}\n  </head>`);
  return transformed;
}
export function franchiseSitemapPlugin(environment=process.env) {
  let resolved;
  return {name:'eraclash-franchise-sitemap',apply:'build',buildStart(){
    resolved=resolveSitemapOrigin(environment,{allowLocal:true});
    if(resolved.localOnly)this.warn(`LOCAL VERIFICATION ONLY: sitemap origin ${resolved.origin}; set PUBLIC_SITE_ORIGIN before public deployment.`);
  },transformIndexHtml:{order:'pre',handler(html){resolved ||= resolveSitemapOrigin(environment,{allowLocal:true});return transformHomeMetadata(html,resolved.origin);}},generateBundle(){this.emitFile({type:'asset',fileName:'sitemap.xml',source:buildPublicFranchiseSitemap(resolved.origin)});}};
}

export async function writePublicFranchiseSitemap({origin,output='dist/sitemap.xml'}={}) {
  const resolved=resolveSitemapOrigin({}, {explicit:origin}),xml=buildPublicFranchiseSitemap(resolved.origin),target=path.resolve(output);
  await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,xml);
  return {count:435,origin:resolved.origin,output:target,localOnly:resolved.localOnly};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),value=flag=>{const i=args.indexOf(flag);return i>=0?args[i+1]:undefined;};
  const resolved=resolveSitemapOrigin(process.env,{explicit:value('--origin'),allowLocal:args.includes('--local')});
  console.log(JSON.stringify(await writePublicFranchiseSitemap({origin:resolved.origin,output:value('--output')||'dist/sitemap.xml'})));
}
