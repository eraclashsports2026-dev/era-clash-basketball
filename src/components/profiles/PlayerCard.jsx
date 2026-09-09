// ── The EraClash PLAYER CARD ──────────────────────────────────────────────────
// Phase 9F. A broadcast identity card on the editorial reading surface: the
// name, then the Competitive Rating as the dominant competitive metric, then
// the record and rank as clearly secondary, then Career Level kept visibly
// apart from the rating, then up to three featured achievements.
//
// The card RENDERS what the server sent and decides nothing. A provisional
// profile arrives with no rating and no rank at all (Phase 9E keeps both
// private until placement), so there is nothing here to leak and no "would be
// #X" to compute. Status is always said in words, never by colour alone.
import { PROFILE_STATE_COPY, announceProfile, announceFeatured, fmt } from "../../profiles/contract.js";
import { ACHIEVEMENTS } from "../../progression/contract.js";
import AchievementIcon from "../progression/AchievementIcon.jsx";

const byId = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** A metric, labelled for a screen reader as well as for the eye. */
const Metric = ({ label, value, sub = null, size = "md" }) => (
  <div className="ec-pp-metric" data-size={size}>
    <dt className="ec-pp-metric-k">{label}</dt>
    <dd className="ec-pp-metric-v">{value}{sub ? <span className="ec-pp-metric-sub">{sub}</span> : null}</dd>
  </div>
);

export default function PlayerCard({ profile, variant = "public" }) {
  if (!profile) return null;
  const p = profile;
  const placed = p.state === "placed";
  const featured = (p.featured || []).map((id) => byId.get(id)).filter(Boolean);

  return (
    <article className="ec-pp-card" data-state={p.state} data-variant={variant} aria-labelledby="ec-pp-name">
      {/* one sentence carrying the whole card, so a screen reader is not made to walk the grid */}
      <p className="ec-pp-sr">{announceProfile(p)}</p>

      <header className="ec-pp-head">
        <span className="ec-pp-avatar" aria-hidden="true">{p.initials}</span>
        <div className="ec-pp-ident">
          <div className="ec-pp-kicker">ERACLASH COMPETITIVE IDENTITY</div>
          <h1 id="ec-pp-name" className="ec-pp-name">{p.displayName}</h1>
        </div>
      </header>

      {placed ? (
        <dl className="ec-pp-metrics">
          <Metric label="COMPETITIVE RATING" value={fmt(p.rating)} size="xl" />
          <Metric label="RECORD" value={`${p.wins}–${p.losses}–${p.ties}`} sub={p.winPct == null ? null : ` · ${p.winPct}%`} />
          {p.rank ? <Metric label="GLOBAL RANK" value={`#${p.rank}`} /> : null}
          {p.level != null ? <Metric label="CAREER LEVEL" value={p.level} /> : null}
        </dl>
      ) : (
        <div className="ec-pp-prov" role="group" aria-label="Competitive status">
          <div className="ec-pp-prov-k">{PROFILE_STATE_COPY[p.state]}</div>
          {p.state === "provisional" ? (
            <>
              <div className="ec-pp-prov-row"><b>{p.placement.matches} / {p.placement.matchesTarget}</b> RATED MATCHES</div>
              <div className="ec-pp-prov-row"><b>{p.placement.opponents} / {p.placement.opponentsTarget}</b> UNIQUE OPPONENTS</div>
              <p className="ec-pp-muted">A Competitive Rating becomes public after placement — five rated matches against three different opponents.</p>
            </>
          ) : (
            <p className="ec-pp-muted">No rated Challenges yet. A Competitive Rating begins with an official Challenge against another account.</p>
          )}
          {p.level != null ? (
            <dl className="ec-pp-metrics" data-compact="true"><Metric label="CAREER LEVEL" value={p.level} /></dl>
          ) : null}
        </div>
      )}

      {featured.length > 0 && (
        <section className="ec-pp-featured" aria-labelledby="ec-pp-featured-title">
          <h2 id="ec-pp-featured-title" className="ec-pp-section">FEATURED ACHIEVEMENTS</h2>
          <p className="ec-pp-sr">{announceFeatured(featured.map((a) => a.name))}</p>
          <ul className="ec-pp-featured-list">
            {featured.map((a) => (
              <li key={a.id} className="ec-pp-featured-item">
                <AchievementIcon icon={a.icon} size={26} />
                <span className="ec-pp-featured-name">{a.name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="ec-pp-foot">
        <span className="ec-pp-mark">ERACLASH</span>
        <span className="ec-pp-foot-note">Competitive Rating comes from official Challenges between accounts. Career Level is separate and never ranks anyone.</span>
      </footer>
    </article>
  );
}
