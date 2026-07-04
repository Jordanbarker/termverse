import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTmuxInputRouter, DEFAULT_REPEAT_MS, type TmuxInputRouter } from "../tmuxInputRouter";
import type { PaneBinding } from "../tmuxConfig";

const PREFIX = "\x00"; // Ctrl+Space

const BINDINGS: Record<string, PaneBinding> = {
  h: { kind: "focus", dir: "L" },
  l: { kind: "focus", dir: "R" },
  H: { kind: "resize", dir: "L", cells: 5, repeat: true },
  J: { kind: "resize", dir: "D", cells: 5, repeat: false },
};

function makeRouter(overrides: {
  chordsEnabled?: () => boolean;
  muxEnabled?: () => boolean;
  onPrefixStateChange?: (active: boolean) => void;
  bindings?: Record<string, PaneBinding>;
} = {}): { router: TmuxInputRouter; states: boolean[] } {
  const states: boolean[] = [];
  const router = createTmuxInputRouter({
    getPrefixChar: () => PREFIX,
    getBindings: () => overrides.bindings ?? BINDINGS,
    muxEnabled: overrides.muxEnabled,
    chordsEnabled: overrides.chordsEnabled ?? (() => true),
    onPrefixStateChange: overrides.onPrefixStateChange ?? ((a) => states.push(a)),
  });
  return { router, states };
}

describe("prefix arming", () => {
  it("arms on the prefix char and consumes it", () => {
    const { router, states } = makeRouter();
    expect(router.route(PREFIX)).toEqual({ type: "consumed" });
    expect(router.isPrefixArmed()).toBe(true);
    expect(states).toEqual([true]);
  });

  it("passes non-prefix input straight to the shell", () => {
    const { router } = makeRouter();
    expect(router.route("a")).toEqual({ type: "shell", data: "a" });
    expect(router.isPrefixArmed()).toBe(false);
  });

  it("sends the literal prefix char on double-prefix", () => {
    const { router, states } = makeRouter();
    router.route(PREFIX);
    expect(router.route(PREFIX)).toEqual({ type: "shell", data: PREFIX });
    expect(router.isPrefixArmed()).toBe(false);
    expect(states).toEqual([true, false]);
  });

  it("disarm() drops an armed prefix without consuming a key", () => {
    const { router, states } = makeRouter();
    router.route(PREFIX);
    router.disarm();
    expect(router.isPrefixArmed()).toBe(false);
    expect(states).toEqual([true, false]);
    expect(router.route("x")).toEqual({ type: "shell", data: "x" });
  });
});

describe("armed-prefix dispatch", () => {
  it("enters copy mode on [ even when chords are locked", () => {
    const { router } = makeRouter({ chordsEnabled: () => false });
    router.route(PREFIX);
    expect(router.route("[")).toEqual({ type: "copy-mode" });
  });

  it("passes locked non-[ prefix keys through to the shell", () => {
    const { router } = makeRouter({ chordsEnabled: () => false });
    router.route(PREFIX);
    expect(router.route("c")).toEqual({ type: "shell", data: "c" });
  });

  it("dispatches conf focus binds case-sensitively", () => {
    const { router } = makeRouter();
    router.route(PREFIX);
    expect(router.route("h")).toEqual({ type: "focus", dir: "L" });
    router.route(PREFIX);
    expect(router.route("H")).toMatchObject({ type: "resize", repeat: true });
  });

  it("dispatches non-repeat resize binds without opening the repeat window", () => {
    const { router } = makeRouter();
    router.route(PREFIX);
    expect(router.route("J")).toEqual({ type: "resize", binding: BINDINGS.J, repeat: false });
    // No repeat window: the same key now goes to the shell.
    expect(router.route("J")).toEqual({ type: "shell", data: "J" });
  });

  it("maps prefix + arrow CSI sequences to focus", () => {
    const { router } = makeRouter();
    for (const [seq, dir] of [["\x1b[A", "U"], ["\x1b[B", "D"], ["\x1b[C", "R"], ["\x1b[D", "L"]] as const) {
      router.route(PREFIX);
      expect(router.route(seq)).toEqual({ type: "focus", dir });
    }
  });

  it("emits unbound keys as chords, normalizing control chars to letters", () => {
    const { router } = makeRouter();
    router.route(PREFIX);
    expect(router.route("c")).toEqual({ type: "chord", key: "c" });
    router.route(PREFIX);
    // Ctrl held throughout: Ctrl+X emits \x18 — normalized to "x".
    expect(router.route("\x18")).toEqual({ type: "chord", key: "x" });
    router.route(PREFIX);
    expect(router.route("O")).toEqual({ type: "chord", key: "o" });
    router.route(PREFIX);
    expect(router.route("|")).toEqual({ type: "chord", key: "|" });
  });
});

describe("muxEnabled gate (detached client)", () => {
  it("passes the prefix char straight to the shell without arming", () => {
    const { router, states } = makeRouter({ muxEnabled: () => false });
    expect(router.route(PREFIX)).toEqual({ type: "shell", data: PREFIX });
    expect(router.isPrefixArmed()).toBe(false);
    expect(states).toEqual([]);
  });

  it("makes copy mode unreachable", () => {
    const { router } = makeRouter({ muxEnabled: () => false });
    router.route(PREFIX);
    expect(router.route("[")).toEqual({ type: "shell", data: "[" });
  });

  it("drops an armed prefix when the mux is disabled mid-chord", () => {
    let enabled = true;
    const { router, states } = makeRouter({ muxEnabled: () => enabled });
    router.route(PREFIX);
    enabled = false; // detach happened between keys
    expect(router.route("c")).toEqual({ type: "shell", data: "c" });
    expect(router.isPrefixArmed()).toBe(false);
    expect(states).toEqual([true, false]);
    // Still inert afterwards.
    expect(router.route(PREFIX)).toEqual({ type: "shell", data: PREFIX });
  });

  it("clears an open repeat window and cancels its timer", () => {
    vi.useFakeTimers();
    let enabled = true;
    const { router } = makeRouter({ muxEnabled: () => enabled });
    router.route(PREFIX);
    router.route("H"); // opens the repeat window
    enabled = false;
    expect(router.route("H")).toEqual({ type: "shell", data: "H" });
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it("behaves identically to no gate when enabled", () => {
    const { router } = makeRouter({ muxEnabled: () => true });
    router.route(PREFIX);
    expect(router.route("c")).toEqual({ type: "chord", key: "c" });
  });
});

describe("repeat window (-r binds)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("re-fires a repeatable resize key without the prefix while the window is open", () => {
    const { router, states } = makeRouter();
    router.route(PREFIX);
    expect(router.route("H")).toMatchObject({ type: "resize", repeat: true });
    // Indicator stays hot through the repeat window.
    expect(states[states.length - 1]).toBe(true);
    expect(router.route("H")).toMatchObject({ type: "resize", repeat: true });
  });

  it("re-arms on each fire and expires after repeatMs", () => {
    const { router, states } = makeRouter();
    router.route(PREFIX);
    router.route("H");
    vi.advanceTimersByTime(DEFAULT_REPEAT_MS - 100);
    router.route("H"); // re-arms the timer
    vi.advanceTimersByTime(DEFAULT_REPEAT_MS - 100);
    expect(router.route("H")).toMatchObject({ type: "resize", repeat: true });
    vi.advanceTimersByTime(DEFAULT_REPEAT_MS);
    expect(states[states.length - 1]).toBe(false);
    expect(router.route("H")).toEqual({ type: "shell", data: "H" });
  });

  it("any other key closes the repeat window and is processed normally", () => {
    const { router } = makeRouter();
    router.route(PREFIX);
    router.route("H");
    expect(router.route("a")).toEqual({ type: "shell", data: "a" });
    expect(router.route("H")).toEqual({ type: "shell", data: "H" });
  });

  it("the prefix char re-arms the prefix even during the repeat window", () => {
    const { router } = makeRouter();
    router.route(PREFIX);
    router.route("H");
    expect(router.route(PREFIX)).toEqual({ type: "consumed" });
    expect(router.isPrefixArmed()).toBe(true);
  });

  it("reset() clears prefix and repeat state and cancels the timer", () => {
    const { router } = makeRouter();
    router.route(PREFIX);
    router.route("H");
    router.reset();
    expect(router.isPrefixArmed()).toBe(false);
    expect(router.route("H")).toEqual({ type: "shell", data: "H" });
    expect(vi.getTimerCount()).toBe(0);
  });
});
