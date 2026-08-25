// ── Player source manifest ────────────────────────────────────────────────────
// Wave 1 = the 44 REPRESENTATIVE_PRIME cards, the known-biased set and the
// first verification priority. Keyed by personId (physical data belongs to the
// human) with the card ids that depend on each person recorded alongside.
//
// SOURCE TIERS: 1 official NBA/team · 2 Hall of Fame · 3 established
// statistical reference (Basketball-Reference, or Wikipedia where it mirrors
// it — b-ref blocks automated reads) · 4 reputable historical source.
const wiki = (title) => `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
const article = (title) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;

const P = (personId, title, cardIds, { tier = 3 } = {}) => ({
  personId, cardIds,
  sources: [
    { url: wiki(title), title, publisher: "Wikipedia REST summary (mirrors Basketball-Reference)", tier, kind: "summary" },
    { url: article(title), title, publisher: "Wikipedia career statistics table", tier, kind: "career-table" },
  ],
});

/** Wave 1 — the 44 prime-form cards. */
export const WAVE_1 = [
  P("paul-arizin", "Paul Arizin", ["arizin-60s", "arizin-50s"]),
  P("guy-rodgers", "Guy Rodgers", ["rodgers-60s"]),
  P("zelmo-beaty", "Zelmo Beaty", ["beaty-60s"]),
  P("richie-guerin", "Richie Guerin", ["guerin-60s"]),
  P("rick-barry", "Rick Barry", ["barry-60s", "rick-70s"]),
  P("earl-monroe", "Earl Monroe", ["monroe-70s"]),
  P("calvin-murphy", "Calvin Murphy", ["murphy-70s"]),
  P("paul-westphal", "Paul Westphal", ["westphal-70s"]),
  P("marques-johnson", "Marques Johnson", ["marques-70s"]),
  P("lou-hudson", "Lou Hudson", ["hudson-70s"]),
  P("sidney-wicks", "Sidney Wicks", ["wicks-70s"]),
  P("maurice-lucas", "Maurice Lucas", ["lucas-m-70s"]),
  P("sidney-moncrief", "Sidney Moncrief", ["moncrief-80s"]),
  P("bernard-king", "Bernard King", ["king-80s"]),
  P("michael-cooper", "Michael Cooper", ["cooper-80s"]),
  P("andrew-toney", "Andrew Toney", ["toney-80s"]),
  P("micheal-ray-richardson", "Micheal Ray Richardson", ["sugar-80s"]),
  P("rolando-blackman", "Rolando Blackman", ["blackman-80s"]),
  P("mookie-blaylock", "Mookie Blaylock", ["mookie-90s"]),
  P("jeff-hornacek", "Jeff Hornacek", ["hornacek-90s"]),
  P("charles-oakley", "Charles Oakley", ["oakley-90s"]),
  P("latrell-sprewell", "Latrell Sprewell", ["spree-90s"]),
  P("glenn-robinson", "Glenn Robinson", ["bigdog-90s"]),
  P("toni-kukoc", "Toni Kukoč", ["kukoc-90s"]),
  P("dan-majerle", "Dan Majerle", ["majerle-90s"]),
  P("rasheed-wallace", "Rasheed Wallace", ["sheed-2ks"]),
  P("jermaine-o-neal", "Jermaine O'Neal", ["jermaine-2ks"]),
  P("andrei-kirilenko", "Andrei Kirilenko", ["ak47-2ks"]),
  P("ron-artest", "Metta Sandiford-Artest", ["artest-2ks"]),
  P("bruce-bowen", "Bruce Bowen", ["bowen-2ks"]),
  P("marcus-camby", "Marcus Camby", ["camby-2ks"]),
  P("deron-williams", "Deron Williams", ["deron-2ks"]),
  P("sam-cassell", "Sam Cassell", ["cassell-2ks"]),
  P("kyle-lowry", "Kyle Lowry", ["lowry-2010s"]),
  P("john-wall", "John Wall", ["wall-2010s"]),
  P("demar-derozan", "DeMar DeRozan", ["demar-2010s", "demar-20s"]),
  P("demarcus-cousins", "DeMarcus Cousins", ["boogie-2010s"]),
  P("serge-ibaka", "Serge Ibaka", ["ibaka-2010s"]),
  P("andre-drummond", "Andre Drummond", ["drummond-2010s"]),
  P("jrue-holiday", "Jrue Holiday", ["jrue-20s"]),
  P("jaren-jackson-jr", "Jaren Jackson Jr.", ["jjj-20s"]),
  P("zion-williamson", "Zion Williamson", ["zion-20s"]),
  P("marcus-smart", "Marcus Smart", ["smart-20s"]),
  P("pascal-siakam", "Pascal Siakam", ["siakam-20s"]),
];

export const ALL_PLAYER_SOURCES = [...WAVE_1];
export const playerSources = (personId) => ALL_PLAYER_SOURCES.find((p) => p.personId === personId) || null;
