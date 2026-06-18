import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDebouncedStorage } from "../debouncedStorage";
import type { StorageValue } from "zustand/middleware";

const storage = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
  removeItem: vi.fn((key: string) => storage.delete(key)),
};
vi.stubGlobal("localStorage", localStorageMock);

describe("createDebouncedStorage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    storage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const makeValue = (n: number): StorageValue<{ count: number }> => ({
    state: { count: n },
    version: 0,
  });

  it("does not write to localStorage immediately", () => {
    const s = createDebouncedStorage<{ count: number }>(500);
    s.setItem("test", makeValue(1));
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });

  it("writes to localStorage after the debounce delay", () => {
    const s = createDebouncedStorage<{ count: number }>(500);
    s.setItem("test", makeValue(42));
    vi.advanceTimersByTime(500);
    expect(localStorageMock.setItem).toHaveBeenCalledTimes(1);
    const stored = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);
    expect(stored.state.count).toBe(42);
  });

  it("batches rapid writes into a single localStorage write", () => {
    const s = createDebouncedStorage<{ count: number }>(500);
    s.setItem("test", makeValue(1));
    s.setItem("test", makeValue(2));
    s.setItem("test", makeValue(3));
    vi.advanceTimersByTime(500);

    expect(localStorageMock.setItem).toHaveBeenCalledTimes(1);
    const stored = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);
    expect(stored.state.count).toBe(3);
  });

  it("resets the debounce timer on each new write", () => {
    const s = createDebouncedStorage<{ count: number }>(500);
    s.setItem("test", makeValue(1));
    vi.advanceTimersByTime(400);
    // Still pending — write again to reset timer
    s.setItem("test", makeValue(2));
    vi.advanceTimersByTime(400);
    // Only 400ms since last write — still pending
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    // Now 500ms since last write
    expect(localStorageMock.setItem).toHaveBeenCalledTimes(1);
    const stored = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);
    expect(stored.state.count).toBe(2);
  });

  it("passes through getItem reads", () => {
    storage.set("test", JSON.stringify({ state: { count: 5 }, version: 0 }));
    const s = createDebouncedStorage<{ count: number }>(500);
    const result = s.getItem("test") as StorageValue<{ count: number }> | null;
    expect(result?.state.count).toBe(5);
  });

  it("passes through removeItem", () => {
    storage.set("test", "value");
    const s = createDebouncedStorage<{ count: number }>(500);
    s.removeItem("test");
    expect(localStorageMock.removeItem).toHaveBeenCalledWith("test");
  });
});
