// ── /privacy and /terms ───────────────────────────────────────────────────────
// One reading surface for both legal documents, in the editorial shell every
// other information page uses (membership, modes, fantasy): the compact header
// above, a Back control, a kicker, one h1, then h2 sections. Content comes from
// src/legal/documents.js. The page is reachable signed out, by direct address
// and after a refresh (vercel.json rewrites and the middleware matcher name both
// routes), and it never redirects to the lobby.
import { useEffect } from "react";
import { LEGAL_DOCUMENTS, LEGAL_STATUS, unresolvedPlaceholders } from "../../legal/documents.js";

const S = {
  wrap: { maxWidth: 820, margin: "0 auto", padding: "24px 16px 56px" },
  back: { minHeight: 44, padding: "0 14px", borderRadius: 9, cursor: "pointer", marginBottom: 16, border: "1px solid var(--ec-a-border)", background: "transparent", color: "var(--ec-a-text-secondary, #c3cddd)", fontSize: 12.5, fontWeight: 700 },
  kicker: { fontSize: 10.5, fontWeight: 900, letterSpacing: 2, color: "var(--ec-a-gold, #f2b51d)" },
  h1: { margin: "4px 0 6px", fontSize: 30, fontWeight: 900, color: "var(--ec-a-text, #f5f7fb)", lineHeight: 1.15 },
  meta: { fontSize: 12.5, color: "var(--ec-a-text-muted, #93a0b5)", margin: "0 0 18px" },
  summary: { fontSize: 15, lineHeight: 1.6, color: "var(--ec-a-text-secondary, #c3cddd)", margin: "0 0 18px" },
  toc: { margin: "0 0 22px", padding: "12px 16px", listStyle: "none", display: "grid", gap: 6 },
  tocLink: { color: "var(--ec-a-text, #f5f7fb)", fontSize: 13.5, textDecoration: "underline", textUnderlineOffset: 3, minHeight: 32, display: "inline-flex", alignItems: "center" },
  h2: { fontSize: 18, fontWeight: 900, margin: "26px 0 8px", color: "var(--ec-a-text, #f5f7fb)", scrollMarginTop: "calc(var(--ec-header-h, 57px) + 12px)" },
  p: { fontSize: 14.5, lineHeight: 1.7, color: "var(--ec-a-text-secondary, #c3cddd)", margin: "0 0 10px" },
  other: { marginTop: 30, paddingTop: 16, borderTop: "1px solid var(--ec-a-border)", fontSize: 13.5, color: "var(--ec-a-text-secondary, #c3cddd)" },
  link: { color: "var(--ec-a-text, #f5f7fb)", textDecoration: "underline", textUnderlineOffset: 3 },
};
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function LegalPage({ kind = "privacy", onBack, onNavigate }) {
  const doc = LEGAL_DOCUMENTS[kind] || LEGAL_DOCUMENTS.privacy;
  const other = kind === "privacy" ? LEGAL_DOCUMENTS.terms : LEGAL_DOCUMENTS.privacy;
  useEffect(() => { const t = document.title; document.title = `${doc.title} — EraClash Basketball`; return () => { document.title = t; }; }, [doc.title]);
  const pending = unresolvedPlaceholders(doc);
  return (
    <main className="ec-editorial-shell ec-legal-page" aria-labelledby="ec-legal-title" data-document={doc.id} data-version={LEGAL_STATUS.version}>
      <div style={S.wrap}>
        <button type="button" onClick={onBack} style={S.back}>← Back</button>
        <div style={S.kicker}>{doc.kicker}</div>
        <h1 id="ec-legal-title" style={S.h1}>{doc.title}</h1>
        <p style={S.meta}>Effective {LEGAL_STATUS.effectiveDate} · version {LEGAL_STATUS.version}{!LEGAL_STATUS.approved ? " · DRAFT — not yet approved for publication" : ""}</p>
        <p style={S.summary}>{doc.summary}</p>
        <nav aria-label="Sections"><ol className="ec-panel ec-panel-raised" style={S.toc}>
          {doc.sections.map((s) => <li key={s.h}><a href={`#${slug(s.h)}`} style={S.tocLink}>{s.h}</a></li>)}
        </ol></nav>
        {doc.sections.map((s) => (
          <section key={s.h} aria-labelledby={`h-${slug(s.h)}`}>
            <h2 id={slug(s.h)} style={S.h2}><span id={`h-${slug(s.h)}`}>{s.h}</span></h2>
            {s.p.map((para, i) => <p key={i} style={S.p}>{para}</p>)}
          </section>
        ))}
        {pending.length > 0 && (
          <p role="note" style={{ ...S.p, marginTop: 20, color: "var(--ec-a-red, #e06060)" }}>
            Draft: {pending.length} owner decision{pending.length === 1 ? "" : "s"} still marked in brackets.
          </p>
        )}
        <p style={S.other}>
          See also the <a href={other.route} style={S.link} onClick={(e) => { if (onNavigate) { e.preventDefault(); onNavigate(other.route); } }}>{other.title}</a>.
        </p>
      </div>
    </main>
  );
}
