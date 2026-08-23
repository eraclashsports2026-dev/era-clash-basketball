// ── MY ERACLASH — career dashboard ─────────────────────────────────────────────
// A basketball gaming profile, not an account settings page. Guests see their
// local career; "Save your EraClash career" claims a display name and syncs
// everything to the cloud (the claim migrates existing local progress).
import { useState } from "react";
import { T, card } from "../theme.js";
import { PLAYERS } from "../players.js";
import { DECADE_COLORS } from "../players.js";
import { favoritePlayers, claimCareer } from "../career.js";
import { getDisplayName, setDisplayName } from "../identity.js";

const StatBox = ({ label, v, accent }) => (
  <div style={{ padding: 12, background: T.bgCardHover, borderRadius: 9, textAlign: "center" }}>
    <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 1 }}>{label}</div>
    <div style={{ fontSize: 21, fontWeight: 900, color: accent || T.text }}>{v}</div>
  </div>
);

const MODE_LABEL = { single: "Single Game", best7: "Best of 7", "82": "Win 82", daily: "Daily", challenge: "Friend Challenge", tournament: "Tournament" };

export default function Profile({ career, badges, BADGES, saved, daily, onLoadTeam }) {
  const s = career.stats;
  const [name, setName] = useState(getDisplayName());
  const [claimed, setClaimed] = useState(!!getDisplayName());
  const favs = favoritePlayers(career, 3).map(([id, n]) => ({ p: PLAYERS.find((x) => x.id === id), n })).filter((x) => x.p);

  const claim = () => {
    const clean = name.trim().slice(0, 24);
    if (!clean) return;
    setDisplayName(clean);
    setClaimed(true);
    claimCareer(career, { badges, savedTeams: saved.map((t) => ({ name: t.name, ids: t.ids, rating: t.rating })), daily });
  };

  return (
    <div>
      {/* Header / claim */}
      <div style={{ ...card, padding: 20, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 3, color: T.textDim, fontWeight: 800 }}>MY ERACLASH</div>
            <div style={{ fontSize: 26, fontWeight: 900, fontStyle: "italic" }}>
              {claimed ? getDisplayName() : "Unnamed Baller"}
            </div>
          </div>
          {claimed && <span style={{ fontSize: 11, color: T.green, fontWeight: 700 }}>☁️ Career saved</span>}
        </div>
        {!claimed && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 9, background: "#2b230a", border: `1px solid ${T.gold}` }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: T.gold }}>💾 Save your EraClash career</div>
            <div style={{ fontSize: 12, color: T.textDim, margin: "4px 0 8px" }}>
              Pick a name to keep your records, streaks and badges — everything you've already earned comes with you.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your baller name" maxLength={24}
                aria-label="Display name"
                style={{ flex: 1, padding: 10, fontSize: 13, background: T.bg, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8, minWidth: 0 }} />
              <button onClick={claim} style={{ padding: "10px 18px", fontSize: 13, fontWeight: 800, border: "none", borderRadius: 8, background: T.gold, color: "#111", cursor: "pointer" }}>
                Save
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Records */}
      <div style={{ ...card, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.textDim, marginBottom: 10 }}>CAREER RECORDS</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8 }}>
          <StatBox label="GAMES" v={s.gamesPlayed} />
          <StatBox label="RECORD" v={`${s.wins}–${s.losses}`} accent={s.wins >= s.losses ? T.green : T.red} />
          <StatBox label="WIN 82 BEST" v={s.bestWin82 ? `${s.bestWin82}–${82 - s.bestWin82}` : "—"} accent={T.gold} />
          <StatBox label="BEST-OF-7" v={`${s.best7Wins}–${s.best7Losses}`} />
          <StatBox label="CHALLENGES" v={`${s.challengeWins}–${s.challengeLosses}`} />
          <StatBox label="TITLES" v={s.tournamentWins} accent={s.tournamentWins > 0 ? T.gold : T.text} />
          <StatBox label="DAILY STREAK" v={s.dailyStreak > 0 ? `🔥 ${s.dailyStreak}` : "0"} />
          <StatBox label="LONGEST STREAK" v={s.longestDailyStreak} />
        </div>
      </div>

      {/* Favorite players */}
      {favs.length > 0 && (
        <div style={{ ...card, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.textDim, marginBottom: 10 }}>MOST DRAFTED</div>
          <div style={{ display: "grid", gap: 8 }}>
            {favs.map(({ p, n }, i) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontWeight: 900, color: i === 0 ? T.gold : T.textDim, width: 18 }}>{i + 1}</span>
                <div style={{ width: 34, height: 34, borderRadius: 7, background: DECADE_COLORS[p.decade], display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 12, color: "#fff" }}>
                  {p.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: T.textDim }}>{p.decade} · drafted {n}×</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent games */}
      <div style={{ ...card, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.textDim, marginBottom: 10 }}>RECENT GAMES</div>
        {career.recentGames.length === 0 ? (
          <div style={{ fontSize: 12.5, color: T.textDim }}>No games yet — run your first sim and it shows up here.</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {career.recentGames.slice(0, 10).map((g, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", background: T.bgCardHover, borderRadius: 8, fontSize: 12 }}>
                <span style={{ fontWeight: 900, color: g.w ? T.green : T.red, width: 16 }}>{g.w ? "W" : "L"}</span>
                <span style={{ fontWeight: 700 }}>{g.score || "—"}</span>
                <span style={{ color: T.textDim }}>{MODE_LABEL[g.mode] || g.mode}</span>
                {g.vs && <span style={{ color: T.textDim }}>vs {g.vs}</span>}
                {g.mvp && <span style={{ marginLeft: "auto", color: T.gold, fontSize: 11 }}>⭐ {g.mvp.split(" ").slice(-1)[0]}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Badges */}
      <div style={{ ...card, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.textDim, marginBottom: 10 }}>
          🏅 BADGES ({badges.length}/{Object.keys(BADGES).length})
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 6 }}>
          {Object.entries(BADGES).map(([k, b]) => (
            <div key={k} style={{ display: "flex", gap: 8, alignItems: "center", opacity: badges.includes(k) ? 1 : 0.3, fontSize: 12 }}>
              <span>{b.icon}</span><b>{b.name}</b><span style={{ color: T.textDim, fontSize: 11 }}>· {b.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Saved teams */}
      {saved.length > 0 && (
        <div style={{ ...card, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.textDim, marginBottom: 10 }}>💾 SAVED SQUADS</div>
          <div style={{ display: "grid", gap: 6 }}>
            {saved.map((t) => (
              <button key={t.id} onClick={() => onLoadTeam(t.ids)} style={{ textAlign: "left", padding: "8px 10px", background: T.bgCardHover, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, cursor: "pointer", fontSize: 12.5, fontWeight: 700 }}>
                {t.name} <span style={{ color: T.gold }}>({t.rating})</span>
                <span style={{ display: "block", fontSize: 11, color: T.textDim, fontWeight: 400, marginTop: 2 }}>
                  {t.ids.map((id) => PLAYERS.find((p) => p.id === id)?.name.split(" ").slice(-1)[0]).filter(Boolean).join(" · ")}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
