import { describe, expect, it, vi } from "vitest";
import { handleCopyShortcut } from "../xtermDefaults";

function key(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    type: "keydown",
    key: "c",
    ctrlKey: true,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    preventDefault: vi.fn(),
    ...overrides,
  } as KeyboardEvent;
}

describe("selection-aware Ctrl+C", () => {
  it.each(["c", "C"])("copies the exact selection and blocks terminal input for %s", (letter) => {
    const e = key({ key: letter });
    const onCopy = vi.fn();
    const text = "first line\n  second line  ";
    expect(handleCopyShortcut(e, { getSelection: () => text }, onCopy)).toBe(false);
    expect(e.preventDefault).toHaveBeenCalledOnce();
    expect(onCopy).toHaveBeenCalledExactlyOnceWith(text);
  });

  it("passes Ctrl+C through as an interrupt without a selection", () => {
    const e = key();
    const onCopy = vi.fn();
    expect(handleCopyShortcut(e, { getSelection: () => "" }, onCopy)).toBeNull();
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(onCopy).not.toHaveBeenCalled();
  });

  it.each([
    { type: "keyup" },
    { key: "v" },
    { ctrlKey: false },
    { ctrlKey: false, metaKey: true },
    { shiftKey: true },
    { altKey: true },
    { metaKey: true },
  ])("leaves other keys and modified shortcuts untouched: %j", (overrides) => {
    const e = key(overrides);
    const onCopy = vi.fn();
    expect(handleCopyShortcut(e, { getSelection: () => "selected" }, onCopy)).toBeNull();
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(onCopy).not.toHaveBeenCalled();
  });
});
