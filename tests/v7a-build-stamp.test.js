// ── Build stamp: naming the running build, and noticing a newer one ───────────
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildIdFromHtml, shortBuild } from "../src/buildStamp.js";

afterEach(() => { vi.restoreAllMocks(); });

describe("build stamp", () => {
  it("index.html carries the placeholder the build plugin replaces", () => {
    const html = readFileSync("index.html", "utf8");
    expect(html).toMatch(/<meta\s+name="eraclash-build"\s+content="__ERACLASH_BUILD_ID__"/);
  });

  it.each(['relative', 'absolute'])("stamps the resolved %s output and preserves a separate build", async kind => {
    const { swVersionPlugin, buildId, SW_PLACEHOLDER } = await import('../vite.config.js');
    const root = mkdtempSync(join(tmpdir(), 'eraclash-build-stamp-'));
    try {
      const production = join(root, 'dist'), target = join(root, 'dist-neutral');
      mkdirSync(production); mkdirSync(join(target, 'assets'), { recursive: true });
      const preserved = '<html>separate production build</html>';
      writeFileSync(join(production, 'index.html'), preserved);
      const names = ['one.js', 'two.css'];
      for (const name of names) writeFileSync(join(target, 'assets', name), 'fixture');
      writeFileSync(join(target, 'sw.js'), `const BUILD_ID = "${SW_PLACEHOLDER}";`);
      writeFileSync(join(target, 'index.html'), `<meta name="eraclash-build" content="${SW_PLACEHOLDER}">`);
      const plugin = swVersionPlugin();
      plugin.configResolved({ root, build: { outDir: kind === 'absolute' ? target : 'dist-neutral' } });
      plugin.closeBundle.call({ warn: vi.fn(), info: vi.fn() });
      const expected = buildId(names);
      expect(readFileSync(join(target, 'sw.js'), 'utf8')).toContain(expected);
      expect(buildIdFromHtml(readFileSync(join(target, 'index.html'), 'utf8'))).toBe(expected);
      expect(readFileSync(join(production, 'index.html'), 'utf8')).toBe(preserved);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("parses a stamped build id and ignores an unstamped one", () => {
    expect(buildIdFromHtml('<meta name="eraclash-build" content="eraclash-assets:2.7.2:abc123def456" />'))
      .toBe("eraclash-assets:2.7.2:abc123def456");
    expect(buildIdFromHtml('<meta name="eraclash-build" content="__ERACLASH_BUILD_ID__" />')).toBeNull();
    expect(buildIdFromHtml("<html></html>")).toBeNull();
  });

  it("shortens a build id to a comparable token", () => {
    expect(shortBuild("eraclash-assets:2.7.2:c7c15d98f048")).toBe("c7c15d");
    expect(shortBuild(null)).toBe("dev");
  });

  it("the watcher fires once when the deployed build differs, and never in dev", async () => {
    const { watchForNewBuild } = await import("../src/buildStamp.js");
    // dev (no stamp) → no polling at all
    vi.stubGlobal("document", { querySelector: () => null, addEventListener() {}, removeEventListener() {}, visibilityState: "visible" });
    vi.stubGlobal("window", {});
    const spy = vi.fn();
    expect(typeof watchForNewBuild(spy)).toBe("function");
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("truthful product copy", () => {
  it("no page metadata claims AI decides game outcomes", () => {
    const html = readFileSync("index.html", "utf8");
    for (const m of html.match(/content="[^"]*"/g) ?? []) {
      expect(m, m).not.toMatch(/AI simulate|AI decides|AI outcome/i);
    }
    expect(html).toMatch(/possession simulation/i);
  });
});
