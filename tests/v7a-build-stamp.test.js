// ── Build stamp: naming the running build, and noticing a newer one ───────────
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { buildIdFromHtml, shortBuild } from "../src/buildStamp.js";

afterEach(() => { vi.restoreAllMocks(); });

describe("build stamp", () => {
  it("index.html carries the placeholder the build plugin replaces", () => {
    const html = readFileSync("index.html", "utf8");
    expect(html).toMatch(/<meta\s+name="eraclash-build"\s+content="__ERACLASH_BUILD_ID__"/);
  });

  it("the plugin stamps the HTML as well as the service worker", () => {
    const cfg = readFileSync("vite.config.js", "utf8");
    expect(cfg).toMatch(/dist", "index\.html"/);
    expect(cfg).toMatch(/replaceAll\(SW_PLACEHOLDER, id\)/);
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
