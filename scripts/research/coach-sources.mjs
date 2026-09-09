// ── Coach source manifest ─────────────────────────────────────────────────────
// One entry per coach: the sources the research runner is allowed to read, in
// documented priority order.
//
// SOURCE TIERS (lower is stronger):
//   1  Official NBA history / official team or league profile
//   2  Naismith Basketball Hall of Fame
//   3  Established statistical reference (Basketball-Reference, or Wikipedia
//      where it mirrors it — b-ref blocks automated reads)
//   4  Reputable historical or tactical reporting
//
// The runner reads the Wikipedia REST summary endpoint, which returns clean
// JSON rather than a scraped page. That is deliberate: parsing article HTML is
// fragile and re-parsing it after every upstream markup change would make
// research irreproducible.
const wiki = (title) => `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;

const C = (id, title, { tier = 3, publisher = "Wikipedia (mirrors Basketball-Reference)" } = {}) =>
  ({ id, sources: [{ url: wiki(title), title, publisher, tier }] });

/** Coaches already in the pool. */
export const EXISTING_COACHES = [
  C("red-auerbach", "Red Auerbach"),
  C("john-kundla", "John Kundla"),
  C("red-holzman", "Red Holzman"),
  C("bill-sharman", "Bill Sharman"),
  C("tom-heinsohn", "Tom Heinsohn"),
  C("jack-ramsay", "Jack Ramsay"),
  C("billy-cunningham", "Billy Cunningham"),
  C("kc-jones", "K. C. Jones"),
  C("pat-riley", "Pat Riley"),
  C("chuck-daly", "Chuck Daly"),
  C("lenny-wilkens", "Lenny Wilkens"),
  C("don-nelson", "Don Nelson"),
  C("jerry-sloan", "Jerry Sloan"),
  C("phil-jackson", "Phil Jackson"),
  C("larry-brown", "Larry Brown (basketball)"),
  C("rudy-tomjanovich", "Rudy Tomjanovich"),
  C("gregg-popovich", "Gregg Popovich"),
  C("rick-adelman", "Rick Adelman"),
  C("george-karl", "George Karl"),
  C("rick-carlisle", "Rick Carlisle"),
  C("mike-dantoni", "Mike D'Antoni"),
  C("doc-rivers", "Doc Rivers"),
  C("steve-kerr", "Steve Kerr"),
  C("erik-spoelstra", "Erik Spoelstra"),
  C("nick-nurse", "Nick Nurse"),
];

/**
 * Candidates evaluated for addition. Chosen for TACTICAL DIVERSITY the existing
 * pool cannot express, not for fame — see docs/simulation-v3/coach-pool-decision.md.
 */
export const CANDIDATE_COACHES = [
  C("doug-moe", "Doug Moe"),
  C("hubie-brown", "Hubie Brown"),
  C("tom-thibodeau", "Tom Thibodeau"),
  C("stan-van-gundy", "Stan Van Gundy"),
  C("mike-fratello", "Mike Fratello"),
  C("frank-vogel", "Frank Vogel"),
  C("nate-mcmillan", "Nate McMillan"),
];

export const ALL_COACH_SOURCES = [...EXISTING_COACHES, ...CANDIDATE_COACHES];
export const coachSources = (id) => ALL_COACH_SOURCES.find((c) => c.id === id) || null;
