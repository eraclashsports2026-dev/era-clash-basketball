// ── ESM loader hook: records every module the traced process actually loads ──
// Registered with `node --import ./scripts/v5/traceHook.mjs`. Uses
// module.registerHooks (synchronous, in-thread) so the recorded set is exactly
// what this process resolved — and so the hook can write to a plain file
// without crossing a worker boundary.
//
// It records only. It never transforms a module, so traced code is byte-
// identical to the code that runs in validation.
import { registerHooks } from "node:module";
import { appendFileSync } from "node:fs";

const OUT = process.env.TRACE_URLS;
if (OUT) {
  registerHooks({
    load(url, context, nextLoad) {
      if (url.startsWith("file:")) appendFileSync(OUT, `${url}\n`);
      return nextLoad(url, context);
    },
  });
}
