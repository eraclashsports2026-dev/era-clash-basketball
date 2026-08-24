// ── Safe errors + structured logging ───────────────────────────────────────────
// Users get a stable code + friendly message + request id. Internals (stack
// traces, provider payloads, env details) go to structured logs only.
export const CODES = {
  ENGINE_FAILURE: [500, "We couldn't complete this matchup. No result was recorded."],
  MODEL_TIMEOUT: [504, "Enhanced analysis timed out."],
  MODEL_RATE_LIMITED: [429, "Enhanced analysis is busy — try again shortly."],
  MODEL_INVALID_OUTPUT: [502, "Enhanced analysis returned an invalid response."],
  MODEL_UNAVAILABLE: [503, "Enhanced analysis is temporarily unavailable."],
  KV_UNAVAILABLE: [503, "Cloud saving is temporarily unavailable."],
  VALIDATION_FAILURE: [400, "That request isn't valid."],
  RATE_LIMITED: [429, "Too many requests — slow down a little."],
  IDEMPOTENCY_CONFLICT: [409, "This request was already processed."],
  DAILY_INVALID_LINEUP: [400, "That lineup doesn't match today's official Daily draft. Your attempt was not used."],
  DUPLICATE_PERSON: [400, "A team can't field two era-versions of the same player. Different versions may face each other on opposite teams."],
  UNAUTHORIZED: [401, "You need a session for that."],
  FORBIDDEN: [403, "You can't modify that."],
  NOT_FOUND: [404, "Not found or expired."],
  PAYLOAD_TOO_LARGE: [413, "That request is too large."],
  FEATURE_DISABLED: [503, "This feature is temporarily disabled."],
  MAINTENANCE: [503, "EraClash is briefly down for maintenance. Existing results remain viewable."],
  UNKNOWN_ERROR: [500, "Something went wrong on our side."],
};

export const newRequestId = () => {
  const buf = new Uint8Array(6);
  globalThis.crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
};

export const sendError = (res, code, requestId, extra = {}) => {
  const [status, message] = CODES[code] || CODES.UNKNOWN_ERROR;
  if (status === 429 && extra.retryAfter) res.setHeader("Retry-After", String(extra.retryAfter));
  return res.status(status).json({ error: message, code, request_id: requestId });
};

// One structured log line per request. Never log keys, cookies, auth headers,
// full payloads, or prompts.
export const logReq = (fields) => {
  try {
    console.log(JSON.stringify({ t: new Date().toISOString(), ...fields }));
  } catch { /* logging must never throw */ }
};
