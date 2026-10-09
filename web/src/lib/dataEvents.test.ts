import { describe, expect, it, vi } from "vitest";
import { notifyDataChanged, onDataChanged } from "./dataEvents";

describe("data change events", () => {
  it("tells every subscriber when data changes", () => {
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = onDataChanged(first);
    const stopSecond = onDataChanged(second);
    notifyDataChanged();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    stopFirst();
    stopSecond();
  });

  it("stops telling a subscriber after it unsubscribes", () => {
    const listener = vi.fn();
    const stop = onDataChanged(listener);
    stop();
    notifyDataChanged();
    expect(listener).not.toHaveBeenCalled();
  });
});
