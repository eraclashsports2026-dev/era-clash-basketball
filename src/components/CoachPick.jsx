// ── Coach pick — the compact in-page control that opens the modal ────────────
// The stage shows either "Choose Coach" or a one-line summary of the selection.
// The long scouting detail lives in the modal, where it can be read on demand.
import { useEffect, useState } from "react";
import { T, S, R, FONT, teamAccent } from "../theme.js";
import { v3meta } from "../v3meta.js";
import CoachModal, { CoachAvatar } from "./CoachModal.jsx";

export default function CoachPick({ side, teamIds, eraStyleId, eraLabel, selected, onSelect, allCoaches }) {
  const accent = teamAccent(side);
  const [open, setOpen] = useState(false);
  const [recommended, setRecommended] = useState(null);

  useEffect(() => {
    let alive = true;
    setRecommended(null);
    if (!teamIds?.length) return;
    v3meta({ goldIds: teamIds, eraStyleId: eraStyleId || undefined })
      .then((d) => { if (alive && d) setRecommended(d.recommended); });
    return () => { alive = false; };
  }, [JSON.stringify(teamIds), eraStyleId]); // eslint-disable-line

  const top = recommended?.[0];
  const recForSelected = (recommended ?? []).find((r) => r.id === selected?.id);

  return (
    <div style={{ marginTop: 12 }}>
      {selected ? (
        <div style={{ padding: "12px 14px", borderRadius: R.md, background: T.bgCardHover, border: `1px solid ${accent}` }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <CoachAvatar name={selected.name} accent={accent} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 15.5, fontWeight: 900, fontFamily: FONT.display, color: T.text }}>{selected.name}</div>
              <div style={{ fontSize: 12.5, color: T.textDim }}>{selected.span}</div>
              <div style={{ fontSize: 12.5, color: T.text, marginTop: 3 }}>{(selected.systemTags ?? []).slice(0, 3).join(" • ")}</div>
              {recForSelected?.teamFit && (
                <div style={{ fontSize: 12, fontWeight: 800, color: recForSelected.teamFit === "POOR" ? T.red : T.green, marginTop: 3 }}>
                  Roster fit: {recForSelected.teamFit}
                </div>
              )}
            </div>
          </div>
          <button onClick={() => setOpen(true)} style={{
            marginTop: 10, width: "100%", padding: "9px 12px", fontSize: 13, fontWeight: 700, minHeight: 42,
            borderRadius: R.sm, border: `1px solid ${T.borderStrong}`, background: T.bgCard, color: T.text, cursor: "pointer",
          }}>Change coach</button>
        </div>
      ) : (
        <div style={{ padding: "14px", borderRadius: R.md, background: T.bgCardHover, border: `1px dashed ${T.borderStrong}` }}>
          <div style={{ fontSize: 13.5, color: T.textDim, marginBottom: 10, lineHeight: 1.5 }}>
            {top ? <>Recommended for this roster: <b style={{ color: T.text }}>{top.name}</b></> : "Pick the staff that runs this five."}
          </div>
          <button onClick={() => setOpen(true)} style={{
            width: "100%", padding: "12px 14px", fontSize: 14, fontWeight: 800, minHeight: 46,
            borderRadius: R.sm, border: "none", background: accent, color: T.onGold, cursor: "pointer",
          }}>Choose Coach</button>
        </div>
      )}
      {open && (
        <CoachModal side={side} coaches={allCoaches} recommended={recommended} selectedId={selected?.id}
          eraStyleId={eraStyleId} eraLabel={eraLabel}
          onSelect={(c) => { onSelect(c); setOpen(false); }} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}
