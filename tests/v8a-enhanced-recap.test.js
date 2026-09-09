// ── Phase 8A / Workstream 17: enhanced recap state machine ───────────────────
import { describe, it, expect, vi } from "vitest";
import { runNarrative, toViewStatus, classifyFailure, MAX_POLLS } from "../src/narrativeMachine.js";

const collect = () => { const seen = []; return { seen, onState: (s) => seen.push(s.state) }; };

describe("enhanced recap — every path reaches a terminal state", () => {
  it("returns the recap on an immediate cache hit", async () => {
    const { seen, onState } = collect();
    const r = await runNarrative({ onState, doFetch: async () => ({ status: 200, body: { narrative: { headline: "x" } } }) });
    expect(r.state).toBe("READY");
    expect(seen).toEqual(["REQUESTING", "READY"]);
  });

  it("polls a 202 through to READY instead of reporting success with nothing", async () => {
    let n = 0;
    const { seen, onState } = collect();
    const r = await runNarrative({
      onState,
      doFetch: async () => (++n < 3 ? { status: 202, body: { status: "pending" } } : { status: 200, body: { narrative: { headline: "done" } } }),
    });
    expect(r.state).toBe("READY");
    expect(r.data.headline).toBe("done");
    expect(seen.filter((s) => s === "PENDING").length).toBe(2);
  });

  it("gives up after a finite number of polls — the spinner can never hang", async () => {
    const { onState } = collect();
    const r = await runNarrative({ onState, doFetch: async () => ({ status: 202, body: { status: "pending" } }) });
    expect(r.state).toBe("FAILED_RETRYABLE");
    expect(r.code).toBe("PENDING_TIMEOUT");
  }, 30_000);

  it("treats a 200 with no narrative as a failure, not a success", async () => {
    const r = await runNarrative({ onState: () => {}, doFetch: async () => ({ status: 200, body: { status: "pending" } }) });
    expect(r.state).toBe("FAILED_RETRYABLE");
    expect(r.code).toBe("EMPTY_NARRATIVE");
  });

  it("separates a retryable failure from one that will never succeed", async () => {
    const a = await runNarrative({ onState: () => {}, doFetch: async () => ({ status: 500, body: { code: "ENGINE_FAILURE" } }) });
    expect(a.state).toBe("FAILED_RETRYABLE");
    const b = await runNarrative({ onState: () => {}, doFetch: async () => ({ status: 503, body: { code: "FEATURE_DISABLED" } }) });
    expect(b.state).toBe("FAILED_UNAVAILABLE");
    expect(classifyFailure("AI_BUDGET_EXCEEDED")).toBe("FAILED_UNAVAILABLE");
  });

  it("succeeds on a retry after a failure", async () => {
    let first = true;
    const doFetch = async () => (first ? ((first = false), { status: 500, body: { code: "ENGINE_FAILURE" } }) : { status: 200, body: { narrative: { headline: "second" } } });
    expect((await runNarrative({ onState: () => {}, doFetch })).state).toBe("FAILED_RETRYABLE");
    expect((await runNarrative({ onState: () => {}, doFetch })).state).toBe("READY");
  });

  it("stops polling when the component unmounts and emits nothing after abort", async () => {
    const ctrl = new AbortController();
    const seen = [];
    const p = runNarrative({
      onState: (s) => seen.push(s.state), signal: ctrl.signal,
      doFetch: async () => ({ status: 202, body: { status: "pending" } }),
    });
    setTimeout(() => ctrl.abort(), 50);
    const r = await p;
    expect(r.state).toBe("ABORTED");
    expect(seen).not.toContain("READY");
  });

  it("makes exactly one provider call per attempt — a poll never duplicates work", async () => {
    const spy = vi.fn(async () => ({ status: 200, body: { narrative: { headline: "one" } } }));
    await runNarrative({ onState: () => {}, doFetch: spy });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("maps machine states onto what the Postgame renders", () => {
    expect(toViewStatus("READY")).toBe("complete");
    expect(toViewStatus("PENDING")).toBe("pending");
    expect(toViewStatus("REQUESTING")).toBe("pending");
    expect(toViewStatus("FAILED_RETRYABLE")).toBe("failed");
    expect(toViewStatus("FAILED_UNAVAILABLE")).toBe("unavailable");
  });
});
