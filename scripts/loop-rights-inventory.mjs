#!/usr/bin/env node
// Read-only source/asset inventory; never changes the protected catalog.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PLAYERS } from '../src/players.js';
import coaches from '../src/v3/data/coaches.js';
import approved from '../src/images/approved.json' with { type: 'json' };
import placeholders from '../src/images/placeholders.json' with { type: 'json' };
const destination = 'docs/rights-exposure';
mkdirSync(destination, { recursive: true });
const files = execFileSync('rg', ['--files', 'src', 'api', 'public', 'data/schedule'], { encoding: 'utf8' }).trim().split('\n').sort();
const leagueReferences = [], teamLabelConsumers = [], imageryConsumers = [];
for (const file of files.filter(path => /\.(?:m?js|jsx|html|json|svg|css)$/.test(path))) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((text, index) => {
    const location = { file, line: index + 1, excerpt: text.trim().slice(0, 220) };
    if (/\b(?:NBA|ABA|BAA|NBL|ABL)\b|National Basketball Association/i.test(text)) leagueReferences.push(location);
    if (/teamDisplayName|franchiseDisplayName|\.team\b|\.teams\b|franchise\.notes/.test(text)) teamLabelConsumers.push(location);
    if (/PlayerImage|PortraitStage|resolvePortrait|resolvePlaceholderArt|approved\.json|eraclash-logo|\/players\/|coach-figure/.test(text)) imageryConsumers.push(location);
  });
}
const assets = files.filter(file => /\.(?:png|jpe?g|webp|gif|avif|svg)$/.test(file)).map(file => ({
  file, bytes: readFileSync(file).length, sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
  category: file.includes('/placeholders/') ? 'generated non-identifying archetype' : file.includes('/time-arena/assets/') ? 'arena illustration' : 'EraClash brand or original sharing graphic',
}));
const protectedFiles = ['src/players.js', 'src/v3/data/coaches.js', 'src/v3/data/eras.js'];
const protectedSourceHashes = protectedFiles.map(file => {
  const data = readFileSync(file), source = execFileSync('git', ['show', `16ea908:${file}`]);
  return { file, sourceCommit: '16ea9085a9f864c607cad226e6577177004268e1', sha256: createHash('sha256').update(data).digest('hex'), unchangedFromSource: data.equals(source) };
});
const inventory = {
  scope: 'Basketball only; exposure inventory, not rights clearance', generatedAt: new Date().toISOString(),
  namingFlag: 'NEUTRAL_TEAM_NAMING, default OFF; presentation projection only',
  catalogTeams: [...new Set(PLAYERS.flatMap(player => player.team.split('/').map(team => team.trim())))].sort(),
  catalogLocations: ['src/players.js', 'src/v3/data/coaches.js', 'src/loop/franchises.js', 'data/schedule/2026-27.json'],
  coachTeamReferences: coaches.coaches.map(coach => ({ id: coach.id, teams: coach.teams })),
  imageRegistry: { file: 'src/images/approved.json', entries: approved.images.length, productEnabled: approved.images.filter(image => image.approved_for_product).length },
  archetypes: { file: 'src/images/placeholders.json', entries: placeholders.images.length, declaredPolicy: placeholders.policy, images: placeholders.images.map(image => ({ id: image.id, path: image.path, thumb: image.thumb, generator: image.generator, nonIdentifyingDeclared: image.non_identifying })) },
  assets, leagueReferences, teamLabelConsumers, imageryConsumers, protectedSourceHashes,
  limitations: ['Source URLs, research data, catalog fields and comments retain exact historical attribution.', 'Names, statistics and source attribution remain public; neutral naming is not a rights license.', 'The image registry approval flag is an internal release control, not independent evidence of a legal license.', 'All asset paths are enumerated; only the brand wordmark, icon-192 and 1980s-wing placeholder received a fresh manual visual spot check in this inventory pass.'],
};
writeFileSync(`${destination}/inventory.json`, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(JSON.stringify({ assets: assets.length, approvedPortraits: inventory.imageRegistry.productEnabled, archetypes: inventory.archetypes.entries, teamLabels: inventory.catalogTeams.length, protectedSourceHashes }, null, 2));
