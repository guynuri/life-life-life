import { describe, expect, it } from "vitest";
import { createSerialQueue } from "./serialQueue";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("serial queue", () => {
  it("runs overlapping calls one after the other", async () => {
    const run = createSerialQueue();
    const events: string[] = [];
    const slow = (name: string) => async () => {
      events.push(`${name} start`);
      await tick();
      await tick();
      events.push(`${name} end`);
    };
    await Promise.all([run(slow("a")), run(slow("b"))]);
    expect(events).toEqual(["a start", "a end", "b start", "b end"]);
  });

  it("never places the same task twice when two runs overlap", async () => {
    const run = createSerialQueue();
    const unplaced = new Set(["rent"]);
    const placed: string[] = [];
    // A placement run: looks up unplaced tasks, awaits (as the network would), then records them.
    const placeRun = async () => {
      if (!unplaced.has("rent")) return;
      await tick();
      unplaced.delete("rent");
      placed.push("rent");
    };
    await Promise.all([run(placeRun), run(placeRun)]);
    expect(placed).toEqual(["rent"]);
  });

  it("keeps running later tasks after one throws", async () => {
    const run = createSerialQueue();
    const failed = run(async () => {
      throw new Error("google down");
    });
    const next = run(async () => "ok");
    await expect(failed).rejects.toThrow("google down");
    await expect(next).resolves.toBe("ok");
  });
});
