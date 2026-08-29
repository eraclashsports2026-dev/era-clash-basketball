// ── Phase 8A: component reference integrity ──────────────────────────────────
// A live regression guard, added because a real defect got past the build and
// the whole vitest suite: an edit deleted `function AuthoritativeBox` while
// leaving `<AuthoritativeBox />` in the tree. Vite compiles that happily (it is
// valid JavaScript — an unresolved identifier), no test rendered the Box Score
// tab, and the crash only appeared when a human opened it in a browser.
//
// Every capitalised JSX element must be defined in its file or imported into it.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const files = () => [
  ...readdirSync("src/components").filter((f) => f.endsWith(".jsx")).map((f) => `src/components/${f}`),
  ...readdirSync("src/components/chaos").filter((f) => f.endsWith(".jsx")).map((f) => `src/components/chaos/${f}`),
  "src/App.jsx",
];

/** Capitalised JSX tags used in the file — i.e. component references. */
const usedComponents = (src) => {
  const out = new Set();
  for (const m of src.matchAll(/<([A-Z][A-Za-z0-9_]*)[\s/>]/g)) out.add(m[1]);
  return [...out];
};

/** Names the file defines or imports. */
const definedNames = (src) => {
  const out = new Set();
  for (const m of src.matchAll(/\bfunction\s+([A-Za-z0-9_]+)/g)) out.add(m[1]);
  for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=/g)) out.add(m[1]);
  for (const m of src.matchAll(/import\s+([A-Za-z0-9_]+)\s+from/g)) out.add(m[1]);
  // Named bindings, including the mixed form `import Default, { A, B } from`.
  for (const m of src.matchAll(/import\s+(?:[A-Za-z0-9_]+\s*,\s*)?\{([^}]+)\}\s*from/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) out.add(name);
    }
  }
  for (const m of src.matchAll(/import\s+([A-Za-z0-9_]+)\s*,\s*\{/g)) out.add(m[1]);
  return out;
};

describe("every referenced component resolves", () => {
  for (const file of files()) {
    it(`${file} references no undefined component`, () => {
      const src = readFileSync(file, "utf8");
      const defined = definedNames(src);
      const missing = usedComponents(src).filter((c) => !defined.has(c) && !/^(Fragment|React)$/.test(c));
      expect(missing, `${file} uses <${missing.join(">, <")}> but neither defines nor imports ${missing.length === 1 ? "it" : "them"}`).toEqual([]);
    });
  }
});
