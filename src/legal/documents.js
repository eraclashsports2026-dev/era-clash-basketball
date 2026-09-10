// ── Legal documents: Privacy Notice and Terms of Use ─────────────────────────
// Content lives here as data so the page component, the footer/dialog links and
// the tests share one source. Every factual statement was checked against the
// code, schema and provider settings on 2026-09-10 (docs/legal/privacy-data-
// inventory.md). Bracketed tokens like [[OPERATOR_LEGAL_NAME]] are OWNER
// DECISIONS that must be filled in before `approved` becomes true; the test
// suite refuses an approved document that still carries one, and the app does
// not link to an unapproved document.
export const LEGAL_STATUS = Object.freeze({
  approved: false,             // set true only when the owner has approved the exact text
  version: "draft-2026-09-10",
  effectiveDate: "[[EFFECTIVE_DATE]]", // the day the approved text is published — never backdated
});

export const OWNER_DECISIONS = Object.freeze([
  ["[[OPERATOR_LEGAL_NAME]]", "the legal name of the person or business operating EraClash Basketball"],
  ["[[OPERATOR_LOCATION]]", "the country (and state/province where relevant) the operator is based in"],
  ["[[CONTACT_EMAIL]]", "a monitored email address for privacy and support requests"],
  ["[[AGE_POLICY]]", "the minimum age to use the service and how minors are handled"],
  ["[[GOVERNING_LAW]]", "governing law / venue, or a decision to leave it out pending legal review"],
  ["[[EFFECTIVE_DATE]]", "the publication date of the approved text"],
]);

const PRIVACY = {
  id: "privacy", route: "/privacy", title: "Privacy Notice", kicker: "PRIVACY",
  summary: "What EraClash Basketball collects, why, who processes it, and the controls you have.",
  sections: [
    { h: "Who operates EraClash Basketball", p: [
      "EraClash Basketball (\"EraClash\", \"we\") is operated by [[OPERATOR_LEGAL_NAME]], based in [[OPERATOR_LOCATION]]. For anything in this notice, contact [[CONTACT_EMAIL]].",
      "EraClash is an independent fan-made game. It is not affiliated with or endorsed by the NBA or any team or player.",
    ] },
    { h: "Playing without an account", p: [
      "You can play Chaos Clash and the Daily without creating an account. To do that, our server sets one cookie, ec_session, holding a random device session id. It lets us connect a device to the Chaos runs it started, resume a run after a reload, and count the three guest runs a device gets before an account is needed. It is HttpOnly, sent only to our own domain, and lasts up to one year unless you clear it.",
      "Your browser also keeps a few things locally: the current run id, your last finished Clash, a first-visit flag, an on-device career (a name you may type, your record and badges) and a random analytics session id. These stay on your device; clearing site data removes them.",
    ] },
    { h: "Information you give us when you create an account", p: [
      "Accounts sign in with an email address and a one-time code or link. We store your email address in our authentication provider (Supabase) so we can sign you in; it is never shown to other players and is not copied into your game records.",
      "You choose a display name (default \"Coach\", up to 24 characters). Your display name is the only identity other players can see, and only where you turn on public visibility (below).",
    ] },
    { h: "What an account stores", p: [
      "Career records of Clashes you saved, saved rosters (player ids, names and positions), UI preferences, Challenges you created or attempted and their results, XP, level and achievement unlocks, and — if you have played rated Challenges — your Challenge Rating and its event ledger.",
      "Game results are computed on our server from the historical player data in the game; the record we store describes the game, not you.",
    ] },
    { h: "Public visibility is off by default", p: [
      "Your profile and your leaderboard placement are private unless you switch them on in your account settings, independently of each other. A public profile is reached by an opaque link and shows your display name, rating and record, featured achievements and public results — never your email. You can switch either setting back off at any time.",
    ] },
    { h: "Analytics and logs", p: [
      "We record product events (for example that a roll happened, a Clash finished, or a screen was shown) with the event name, the build, timing and a random analytics session id. We do not use third-party analytics, advertising or social plugins. The raw event log is kept for 14 days and daily counts for about 13 months.",
      "Like any web service, our hosting provider records requests (including your IP address and browser type) in server logs, and our server uses your IP address for short-lived rate limiting (60-second windows). Game runs in progress and unsaved results are kept for a few hours in our game store and then expire.",
    ] },
    { h: "Who processes information for us", p: [
      "Vercel hosts the site and runs our server code (requests, logs). Supabase provides authentication and the account database (our production project is in the United States, us-west-1). Upstash provides the short-term game store and counters. When a finished game is narrated, the game facts only — era, historical player names, lineups, box scores and key moments — are sent to Anthropic to write the recap; nothing about you or your device is included, and a written recap from our own engine is used when that service is unavailable. Sign-in emails are delivered by [[EMAIL_PROVIDER]].",
      "We do not sell personal information, and we do not share it with advertisers.",
    ] },
    { h: "Your controls", p: [
      "Change your display name and your visibility settings at any time. Export everything in your account as one file from Account → Export my data. Delete your account from Account → Delete my account; you will be asked to sign in again if your session is old, and to type DELETE to confirm.",
    ] },
    { h: "What deletion removes, and what it keeps", p: [
      "Deleting your account removes your sign-in identity, profile, saved Clashes, rosters, preferences, progression and public profile.",
      "Two kinds of records stay, without your identity: entries in the Challenge Rating ledger keep the other player's side and mark yours as removed, so that player's rating history stays verifiable; and Challenge history is anonymised the same way. These records are pseudonymous — they still describe a game and an opponent — and are kept for the integrity of other players' records. A Clash another player saved from a shared Challenge belongs to their account. Provider backups are retained for a limited period under the providers' own policies.",
    ] },
    { h: "Age", p: [ "[[AGE_POLICY]]" ] },
    { h: "Changes to this notice", p: [
      "When this notice changes, the effective date below changes with it. Material changes will be announced in the product before they take effect.",
    ] },
  ],
};

const TERMS = {
  id: "terms", route: "/terms", title: "Terms of Use", kicker: "TERMS",
  summary: "The rules for using EraClash Basketball, its accounts and its shared Challenges.",
  sections: [
    { h: "Who you are agreeing with", p: [
      "These Terms are between you and [[OPERATOR_LEGAL_NAME]] (\"EraClash\", \"we\"), the operator of EraClash Basketball at www.eraclashbasketball.com. By creating an account you agree to these Terms. Playing as a guest is also subject to them.",
    ] },
    { h: "The service", p: [
      "EraClash is a free basketball simulation game built from historical player and team statistics. Results are produced by our game engine and are fiction for entertainment; they are not predictions, and nothing here is a wager, a prize, or a purchase. There are no paid plans, subscriptions or refunds today; if that changes, these Terms will change first.",
    ] },
    { h: "Your account", p: [
      "You sign in with an email address you control. Keep your sign-in codes to yourself; anyone with access to your email can sign in as you. Choose a display name that is not offensive, misleading, or someone else's; we may change a display name that breaks this rule.",
      "You may delete your account at any time from your account settings. We may suspend or close an account that breaks these Terms, and we may close the service or a feature with reasonable notice.",
    ] },
    { h: "Fair play", p: [
      "Do not tamper with the game, its server or its rules: no automated play, no exploiting bugs, no forging results, no interfering with other players' Challenges or ratings, and no attempts to access other accounts or non-public parts of the service. Rated Challenges are governed by the server; results that were obtained unfairly may be voided.",
    ] },
    { h: "Challenges and public identity", p: [
      "A Challenge link lets another player play your exact scenario. Share links only with people you want to play against. If you turn on a public profile or leaderboard placement, your display name, rating and record become visible to anyone; you can turn them back off at any time.",
    ] },
    { h: "Player names, statistics and images", p: [
      "Historical player names and statistics are used as factual references. Player portraits in the game are generated, non-identifying archetypes and are not likenesses of real people. EraClash is not affiliated with or endorsed by the NBA, any team, or any player. The EraClash name, logo and game design belong to the operator.",
    ] },
    { h: "Disclaimers and limits", p: [
      "The service is provided as is. We do not promise that it will be available at all times or free of errors, and we may change the game, its ratings, its rules and its features. To the extent permitted by law, we are not liable for indirect or consequential loss arising from use of a free game.",
    ] },
    { h: "Governing law", p: [ "[[GOVERNING_LAW]]" ] },
    { h: "Changes and contact", p: [
      "When these Terms change, the effective date below changes with it and material changes are announced in the product. Questions: [[CONTACT_EMAIL]].",
    ] },
  ],
};

export const LEGAL_DOCUMENTS = Object.freeze({ privacy: PRIVACY, terms: TERMS });
export const legalDocumentFor = (route) => Object.values(LEGAL_DOCUMENTS).find((d) => d.route === String(route || "").replace(/\/+$/, "")) || null;
export const unresolvedPlaceholders = (doc) => {
  const text = JSON.stringify(doc) + LEGAL_STATUS.effectiveDate;
  return [...new Set(text.match(/\[\[[A-Z_]+\]\]/g) || [])];
};
