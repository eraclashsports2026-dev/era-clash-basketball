export const neutralTeamNaming = (env = import.meta.env || {}) => ['true', '1', 'on', 'yes'].includes(String(env.NEUTRAL_TEAM_NAMING ?? env.VITE_NEUTRAL_TEAM_NAMING ?? '').toLowerCase());
const cities = { ATL: 'Atlanta', BOS: 'Boston', BKN: 'Brooklyn', BRK: 'Brooklyn', CHA: 'Charlotte', CHI: 'Chicago', CLE: 'Cleveland', DAL: 'Dallas', DEN: 'Denver', DET: 'Detroit', GSW: 'Golden State', HOU: 'Houston', IND: 'Indiana', LAC: 'Los Angeles West', LAL: 'Los Angeles Gold', MEM: 'Memphis', MIA: 'Miami', MIL: 'Milwaukee', MIN: 'Minnesota', NOP: 'New Orleans', NOH: 'New Orleans', NYK: 'New York', OKC: 'Oklahoma City', ORL: 'Orlando', PHI: 'Philadelphia', PHX: 'Phoenix', POR: 'Portland', SAC: 'Sacramento', SAS: 'San Antonio', TOR: 'Toronto', UTA: 'Utah', WAS: 'Washington', SEA: 'Seattle', NJN: 'New Jersey' };
const catalogCities = { '76ers':'Philadelphia', Blazers:'Portland', Bobcats:'Charlotte', Braves:'Buffalo', Bucks:'Milwaukee', Bullets:'Baltimore / Washington', Bulls:'Chicago', Cavaliers:'Cleveland', Celtics:'Boston', Clippers:'Los Angeles West', Grizzlies:'Memphis', Hawks:'Atlanta', Heat:'Miami', Hornets:'Charlotte', Jazz:'Utah', Kings:'Sacramento', Knicks:'New York', Lakers:'Los Angeles Gold', Magic:'Orlando', Mavericks:'Dallas', Nationals:'Syracuse', Nets:'Brooklyn', Nuggets:'Denver', Pacers:'Indiana', Pelicans:'New Orleans', Pistons:'Detroit', Raptors:'Toronto', Rockets:'Houston', Royals:'Rochester / Cincinnati', Sonics:'Seattle', Spurs:'San Antonio', Suns:'Phoenix', Thunder:'Oklahoma City', Timberwolves:'Minnesota', Warriors:'Golden State', Wizards:'Washington', Wolves:'Minnesota' };
// Text projection only: never pass this output to the engine, catalog, filters,
// IDs, result record, source URLs or calibration. Historical sources stay intact.
export function leagueCopy(value, { neutral = neutralTeamNaming() } = {}) {
  if (value == null) return value;
  const copy = String(value)
    .replace(/\b(?:ABA[-–]NBA|NBA[-–]ABA)\b/gi, 'professional league')
    .replace(/\bBAA\/NBA\b/gi, 'pro basketball')
    .replace(/\bNational Basketball Association\b/gi, 'pro basketball')
    .replace(/\bNBA\.com\b/gi, 'official basketball site')
    .replace(/\bNBA(?=\b|_)/gi, 'pro basketball')
    .replace(/\b(?:ABA|BAA|NBL|ABL)\b/g, 'earlier pro league');
  return neutral ? neutralTeamCopy(copy) : copy;
}
const catalogCity = (label, era) => {
  // Broad city-lineage labels where a decade slice can span relocations. They
  // do not assert the exact club/season of each stat in the protected slice.
  if (label === 'Lakers' && era === '1950s') return 'Minneapolis';
  if (label === 'Hawks' && era === '1950s') return 'Milwaukee / St. Louis';
  if (label === 'Hawks' && era === '1960s') return 'St. Louis / Atlanta';
  if (label === 'Warriors' && era === '1950s') return 'Philadelphia';
  if (label === 'Warriors' && era === '1960s') return 'Philadelphia / San Francisco';
  if (label === 'Jazz' && era === '1970s') return 'New Orleans / Utah';
  if (label === 'Kings' && era === '1960s') return 'Cincinnati';
  if (label === 'Kings' && era === '1970s') return 'Kansas City / Omaha';
  if (label === 'Kings' && era === '1980s') return 'Kansas City / Sacramento';
  if (label === 'Clippers' && era === '1980s') return 'San Diego / Los Angeles West';
  if (label === 'Nets' && ['1970s','1980s','1990s','2000s'].includes(era)) return 'New York / New Jersey';
  if (label === 'Grizzlies' && era === '1990s') return 'Vancouver';
  if (label === 'Hornets' && ['1990s','2000s','2010s'].includes(era)) return 'Charlotte / New Orleans';
  return catalogCities[label] || cities[label] || label;
};
export function teamDisplayName(team, era = 'All-time', neutral = neutralTeamNaming()) {
  if (!neutral) return leagueCopy(String(team || 'All-time'), { neutral: false });
  const labels = String(team || '').split('/').flatMap(label => catalogCity(label.trim(), era).split('/').map(city => city.trim()));
  return `${[...new Set(labels)].join(' / ') || 'All-time'} · ${era}`;
}

// Curated text replacements, applied only at display boundaries. Exact city
// names win before nickname replacement; Magic Johnson's name is preserved.
export function neutralTeamCopy(value) {
  const fullNames = { 'Boston Celtics':'Boston', 'Los Angeles Lakers':'Los Angeles Gold', 'Minneapolis Lakers':'Minneapolis', 'Los Angeles Clippers':'Los Angeles West', 'San Diego Clippers':'San Diego', 'Golden State Warriors':'Golden State', 'San Francisco Warriors':'San Francisco', 'Philadelphia Warriors':'Philadelphia', 'St. Louis Hawks':'St. Louis', 'Milwaukee Hawks':'Milwaukee', 'New Orleans Jazz':'New Orleans', 'Utah Jazz':'Utah', 'New York Knicks':'New York', 'New York Nets':'New York', 'New Jersey Nets':'New Jersey', 'Brooklyn Nets':'Brooklyn', 'Seattle SuperSonics':'Seattle', 'Seattle Supersonics':'Seattle', 'Oklahoma City Thunder':'Oklahoma City', 'New Orleans Hornets':'New Orleans', 'Charlotte Hornets':'Charlotte', 'Charlotte Bobcats':'Charlotte', 'Rochester Royals':'Rochester', 'Cincinnati Royals':'Cincinnati', 'Kansas City Kings':'Kansas City', 'Sacramento Kings':'Sacramento', 'Buffalo Braves':'Buffalo', 'Vancouver Grizzlies':'Vancouver', 'Washington Bullets':'Washington', 'Baltimore Bullets':'Baltimore', 'Syracuse Nationals':'Syracuse' };
  for (const [nickname, city] of Object.entries(catalogCities)) {
    if (!city.includes(' / ')) fullNames[`${city} ${nickname}`] = city;
  }
  let copy = String(value || '');
  for (const [name, city] of Object.entries(fullNames).sort((a, b) => b[0].length - a[0].length)) copy = copy.split(name).join(city);
  const pattern = /\b(76ers|Blazers|Bobcats|Braves|Bucks|Bullets|Bulls|Cavaliers|Celtics|Clippers|Grizzlies|Hawks|Heat|Hornets|Jazz|Kings|Knicks|Lakers|Magic(?!\s+Johnson)|Mavericks|Nationals|Nets|Nuggets|Pacers|Pelicans|Pistons|Raptors|Rockets|Royals|Sonics|Spurs|Suns|Thunder|Timberwolves|Warriors|Wizards|Wolves)\b/g;
  return copy.replace(pattern, nickname => catalogCities[nickname] || nickname);
}
