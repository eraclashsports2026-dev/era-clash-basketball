// ── Enhanced recap state machine ─────────────────────────────────────────────
// The recap is OPTIONAL. The deterministic story is always on screen, so every
// terminal state here still leaves the user with a full account of the game.
//
// THE DEFECT THIS REPLACES
// /api/narrative answers 202 {status:"pending"} while a generation lock is held.
// HTTP 202 satisfies res.ok, so the old single-shot client returned
// `(await res.json()).narrative` — undefined — and reported SUCCESS. The recap
// never arrived, nothing retried, and the pending UI had no terminal state to
// move to. Polling 202 to a real conclusion is the fix.
export const NARRATIVE_STATES = Object.freeze([
  "IDLE", "REQUESTING", "PENDING", "READY", "FAILED_RETRYABLE", "FAILED_UNAVAILABLE",
]);

// Bounded: 6 polls over roughly 13s. A dead worker's lock expires server-side,
// so waiting longer buys nothing and stranding a spinner costs everything.
export const POLL_DELAYS_MS = Object.freeze([1200, 1800, 2200, 2600, 2600, 2600]);
export const MAX_POLLS = POLL_DELAYS_MS.length;

/** Codes that mean "asking again will not help". */
const UNAVAILABLE = new Set(["FEATURE_DISABLED", "AI_BUDGET_EXCEEDED", "AI_DISABLED", "MAINTENANCE"]);

export const classifyFailure = (code) =>
  UNAVAILABLE.has(String(code || "")) ? "FAILED_UNAVAILABLE" : "FAILED_RETRYABLE";

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(Object.assign(new Error("aborted"), { aborted: true })); }, { once: true });
  });

/**
 * Run the recap to a terminal state.
 *
 * @param onState  called with ({state, data?, code?}) at every transition
 * @param signal   AbortSignal — cancels polling on unmount or a result switch
 * @param doFetch  injected transport (tests drive it without a network)
 */
export const runNarrative = async ({ resultId, result, persisted, onState, signal, doFetch }) => {
  const emit = (s) => { if (!signal?.aborted) onState?.(s); };
  const call = doFetch || (async () => {
    const res = await fetch("/api/narrative", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(persisted && resultId ? { resultId } : { result }),
      signal,
    });
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    return { status: res.status, body };
  });

  emit({ state: "REQUESTING" });
  let polls = 0;
  try {
    for (;;) {
      if (signal?.aborted) return { state: "ABORTED" };
      const { status, body } = await call();

      // A 200 without a narrative is not a success. Treating it as one is how
      // the old client reported "complete" with nothing to show.
      if (status === 200 && body?.narrative) {
        const out = { state: "READY", data: body.narrative };
        emit(out); return out;
      }
      if (status === 200 && !body?.narrative) {
        const out = { state: "FAILED_RETRYABLE", code: "EMPTY_NARRATIVE" };
        emit(out); return out;
      }
      if (status === 202) {
        if (polls >= MAX_POLLS) {
          // Finite by construction: the spinner always reaches a terminal state.
          const out = { state: "FAILED_RETRYABLE", code: "PENDING_TIMEOUT" };
          emit(out); return out;
        }
        emit({ state: "PENDING", attempt: polls + 1, of: MAX_POLLS });
        await sleep(POLL_DELAYS_MS[polls], signal);
        polls++;
        continue;
      }
      const code = body?.code || `HTTP_${status}`;
      const out = { state: classifyFailure(code), code };
      emit(out); return out;
    }
  } catch (e) {
    if (e?.aborted || e?.name === "AbortError" || signal?.aborted) return { state: "ABORTED" };
    const out = { state: classifyFailure(e?.code), code: e?.code || "NETWORK" };
    emit(out); return out;
  }
};

/** Map a machine state onto what the Postgame renders. */
export const toViewStatus = (state) =>
  state === "READY" ? "complete"
    : state === "REQUESTING" || state === "PENDING" ? "pending"
      : state === "FAILED_UNAVAILABLE" ? "unavailable"
        : state === "FAILED_RETRYABLE" ? "failed" : "none";
