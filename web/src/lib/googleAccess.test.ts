import { describe, expect, it } from "vitest";
import { stillValid } from "./googleTokenCache";

describe("stillValid", () => {
  const now = 1_000_000;
  it("is false with no cached token", () => {
    expect(stillValid(null, now)).toBe(false);
  });
  it("is true well before expiry and false within five minutes of it", () => {
    expect(stillValid({ expiresAt: now + 60 * 60 * 1000 }, now)).toBe(true);
    expect(stillValid({ expiresAt: now + 4 * 60 * 1000 }, now)).toBe(false);
  });
});
