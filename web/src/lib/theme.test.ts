import { describe, expect, it } from "vitest";
import { resolveTheme } from "./theme";

describe("resolveTheme", () => {
  it("is dark when nothing is stored", () => {
    expect(resolveTheme(null)).toBe("dark");
  });

  it("keeps a stored choice", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("ignores a stored value it does not recognise", () => {
    expect(resolveTheme("blue")).toBe("dark");
    expect(resolveTheme("")).toBe("dark");
  });
});
