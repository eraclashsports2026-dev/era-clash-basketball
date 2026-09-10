import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { LEGAL_DOCUMENTS, LEGAL_STATUS, OWNER_DECISIONS, unresolvedPlaceholders, legalDocumentFor } from "../src/legal/documents.js";
import { isKnownRoute, LEGAL_ROUTES } from "../src/navigation.js";

const read = (p) => readFileSync(p, "utf8");

// Workstream 4 (2026-09-10): Privacy Notice and Terms of Use as data, one page
// component, reachable signed out by address and after refresh, linked from the
// footer and the sign-in dialog — and never published with an owner decision
// still marked in brackets.
describe("legal documents", () => {
  it("cover the sections the data inventory requires", () => {
    const h = (d) => d.sections.map((s) => s.h.toLowerCase());
    for (const k of ["who operates", "without an account", "create an account", "public visibility", "analytics and logs", "who processes", "your controls", "deletion", "age", "changes"]) expect(h(LEGAL_DOCUMENTS.privacy).some((x) => x.includes(k)), k).toBe(true);
    for (const k of ["agreeing with", "the service", "your account", "fair play", "challenges", "player names", "disclaimers", "governing law", "changes"]) expect(h(LEGAL_DOCUMENTS.terms).some((x) => x.includes(k)), k).toBe(true);
  });
  it("make no unsupported promise", () => {
    const text = JSON.stringify(LEGAL_DOCUMENTS).toLowerCase();
    for (const bad of ["only your email", "never share any", "deleted immediately", "all information is anonymous", "fully compliant", "reviewed by counsel", "gdpr compliant", "ccpa compliant"]) expect(text.includes(bad), bad).toBe(false);
    expect(text).toContain("pseudonymous"); // retained rating/challenge history is named for what it is
    // no invented commerce: the Terms may SAY there are no prizes or purchases, but must not describe any
    expect(text).not.toMatch(/subscription fee|refund policy|win a prize|cash prize|purchase a|buy a/);
  });
  it("name every owner decision as a bracketed placeholder while unapproved, and none once approved", () => {
    const pending = [...new Set([...unresolvedPlaceholders(LEGAL_DOCUMENTS.privacy), ...unresolvedPlaceholders(LEGAL_DOCUMENTS.terms)])];
    if (!LEGAL_STATUS.approved) {
      expect(pending.length).toBeGreaterThan(0);
      for (const [token] of OWNER_DECISIONS) expect(pending.includes(token) || token === "[[EFFECTIVE_DATE]]", token).toBe(true);
    } else {
      expect(pending, "an approved document may not carry a placeholder").toEqual([]);
      expect(LEGAL_STATUS.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
  it("live at /privacy and /terms, known to the router, rewritten and gated like every other page", () => {
    expect(LEGAL_ROUTES).toEqual(["/privacy", "/terms"]);
    for (const r of LEGAL_ROUTES) { expect(isKnownRoute(r)).toBe(true); expect(legalDocumentFor(r)?.route).toBe(r); }
    const rewrites = JSON.parse(read("vercel.json")).rewrites.map((r) => r.source);
    expect(rewrites).toContain("/privacy"); expect(rewrites).toContain("/terms");
    expect(read("middleware.js")).toMatch(/"\/privacy", "\/terms"/);
  });
  it("are linked from the footer and from the sign-in dialog, as acceptance of Terms and acknowledgement of the Privacy Notice", () => {
    const app = read("src/App.jsx"); const dialog = read("src/components/accounts/AccountDialog.jsx");
    expect(app).toMatch(/href="\/privacy"[\s\S]{0,200}Privacy<\/a>/); expect(app).toMatch(/href="\/terms"[\s\S]{0,200}Terms<\/a>/);
    expect(app).toMatch(/LEGAL_ROUTES\.includes\(route\) \? \(/);
    expect(dialog).toMatch(/agree to the <a href="\/terms"/); expect(dialog).toMatch(/acknowledge the <a href="\/privacy"/);
    expect(dialog).not.toMatch(/marketing|newsletter/i);
  });
});
