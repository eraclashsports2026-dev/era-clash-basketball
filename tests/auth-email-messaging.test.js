import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { asError, FAILURE_CODES } from "../src/accounts/provider.js";

// Workstream 3 (2026-09-10): the sign-in dialog tells apart a malformed address,
// the resend cooldown, rate limiting, a delivery failure and an invalid or
// expired code — without echoing raw provider text or promising delivery.
describe("provider errors become closed codes the dialog can explain", () => {
  const cases = [
    ["For security purposes, you can only request this after 47 seconds.", "RESEND_COOLDOWN", 47],
    ["email rate limit exceeded", "RATE_LIMITED"],
    ["Too many requests", "RATE_LIMITED"],
    ["Email address \"x@y.z\" cannot be used as it is not authorized", "EMAIL_NOT_ALLOWED"],
    ["Signups not allowed for otp", "EMAIL_NOT_ALLOWED"],
    ["Error sending magic link email", "DELIVERY_FAILED"],
    ["Token has expired or is invalid", "CODE_INVALID_OR_EXPIRED"],
    ["Unable to validate email address: invalid format", "EMAIL_INVALID"],
    ["new row violates row-level security policy", "NOT_PERMITTED"],
    ["Failed to fetch", "NETWORK"],
    ["something unexpected", "PROVIDER_ERROR"],
  ];
  for (const [message, code, seconds] of cases) {
    it(`"${message}" → ${code}`, () => {
      const e = asError({ message });
      expect(e.code).toBe(code); expect(e.message).toBe(code);
      if (seconds) expect(e.retryAfterSeconds).toBe(seconds);
      expect(FAILURE_CODES).toContain(code);
    });
  }
  it("a 5xx from the mail relay is a delivery failure, not a bad address", () => {
    expect(asError({ message: "Internal Server Error", status: 500 }).code).toBe("DELIVERY_FAILED");
  });
});

describe("the dialog", () => {
  const dialog = readFileSync("src/components/accounts/AccountDialog.jsx", "utf8");
  it("explains every code in plain words and never shows raw provider text", () => {
    for (const code of ["RESEND_COOLDOWN", "DELIVERY_FAILED", "RATE_LIMITED", "EMAIL_INVALID", "EMAIL_NOT_ALLOWED", "CODE_INVALID_OR_EXPIRED", "NETWORK", "PROVIDER_ERROR"]) expect(dialog).toContain(code);
    expect(dialog).toMatch(/MESSAGE\[failure\] \|\| MESSAGE\.PROVIDER_ERROR/);
    expect(dialog).not.toMatch(/e\.message\}|\{failure\.message/);
  });
  it("refuses a malformed address before any request leaves the browser, and shows the cooldown in seconds", () => {
    expect(dialog).toMatch(/if \(!emailLooksValid\(email\)\) \{ setFailure\("EMAIL_INVALID"\); return; \}/);
    expect(dialog).toMatch(/Wait about \$\{retryAfter\} seconds/);
  });
  it("does not disclose whether an account exists and does not promise delivery", () => {
    expect(dialog).not.toMatch(/no account with|already registered|account exists/i);
    expect(dialog).not.toMatch(/email (has been|was) delivered|is on its way/i);
  });
});
