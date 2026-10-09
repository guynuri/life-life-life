import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Guards against the Tasks-page failure: a component used classes that no stylesheet rule defined.
const dir = fileURLToPath(new URL(".", import.meta.url));

function classesUsed(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(/className="([^"]*)"/g)) found.push(...(m[1] ?? "").split(/\s+/));
  for (const m of text.matchAll(/className=\{([^}]*)\}/g)) for (const q of m[1]?.matchAll(/"([^"]+)"/g) ?? []) found.push(q[1] ?? "");
  return found.filter((c) => c.length > 0 && !c.includes("$"));
}

describe("styles", () => {
  it("every class used by a component has a rule in styles.css", () => {
    const css = readFileSync(dir + "styles.css", "utf8");
    const used = new Set<string>();
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".tsx"))) {
      for (const c of classesUsed(readFileSync(dir + file, "utf8"))) used.add(c);
    }
    expect(used.size).toBeGreaterThan(10);
    const missing = [...used].filter((c) => !new RegExp(`\.${c}(?![\w-])`).test(css));
    expect(missing).toEqual([]);
  });
});
