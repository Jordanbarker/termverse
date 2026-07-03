import { describe, it, expect, beforeEach } from "vitest";
import { execute } from "@tt/core/commands/registry";
import type { CommandContext } from "@tt/core/commands/types";
import "@tt/core/commands/builtins"; // help (for the meta-command listing test)
import "../engine/commands/navigation"; // register challenges/goto/next/prev/track
import { consumePendingNavigation } from "../engine/commands/navigation";
import { getCategory } from "../challenges/categories";
import { useGameStore } from "../state/gameStore";
import { buildBaseFs } from "../lib/seed";
import { CRUNCH_MACHINE, HOME_DIR } from "../lib/machine";

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

function ctx(): CommandContext {
  return {
    fs: buildBaseFs(),
    cwd: HOME_DIR,
    homeDir: HOME_DIR,
    username: "player",
    activeComputer: CRUNCH_MACHINE,
    rawArgs: [],
  } as unknown as CommandContext;
}

function run(line: string) {
  const [cmd, ...args] = line.split(" ");
  return execute(cmd, args, {}, ctx());
}

describe("challenge navigation commands", () => {
  beforeEach(() => {
    useGameStore.setState({ activeCategory: "all", challengeIndex: 0 });
    consumePendingNavigation(); // clear any leftover pending nav
  });

  it("challenges lists the track with a marker on the current challenge", () => {
    useGameStore.setState({ challengeIndex: 1 });
    const out = strip(run("challenges").output);
    const all = getCategory("all").challenges;
    expect(out).toContain("[all]");
    for (const [i, c] of all.entries()) expect(out).toContain(`${i + 1}. ${c.title}`);
    expect(out).toContain(`→  2. ${all[1].title}`);
    expect(consumePendingNavigation()).toBeNull(); // listing never navigates
  });

  it("challenges shows a ✓ + best time for completed challenges", () => {
    const first = getCategory("all").challenges[0];
    useGameStore.setState({ bestTimes: { [first.id]: 61000 } });
    const out = strip(run("challenges").output);
    expect(out).toContain(`1. ${first.title} ✓ 1:01`);
  });

  it("goto queues a load for valid 1-based indexes and rejects out-of-range", () => {
    expect(run("goto 3").exitCode).toBeUndefined();
    expect(consumePendingNavigation()).toEqual({ type: "load", index: 2 });

    const count = getCategory("all").challenges.length;
    for (const bad of ["0", String(count + 1), "abc", ""]) {
      const res = run(`goto ${bad}`.trim());
      expect(res.exitCode).toBe(1);
      expect(consumePendingNavigation()).toBeNull();
    }
  });

  it("next/prev step and clamp at the ends", () => {
    expect(run("prev").exitCode).toBe(1); // at first challenge
    expect(consumePendingNavigation()).toBeNull();

    expect(run("next").exitCode).toBeUndefined();
    expect(consumePendingNavigation()).toEqual({ type: "load", index: 1 });

    const count = getCategory("all").challenges.length;
    useGameStore.setState({ challengeIndex: count - 1 });
    expect(run("next").exitCode).toBe(1);
    expect(consumePendingNavigation()).toBeNull();
    expect(consumePendingNavigation()).toBeNull();

    expect(run("prev").exitCode).toBeUndefined();
    expect(consumePendingNavigation()).toEqual({ type: "load", index: count - 2 });
  });

  it("help lists the navigation commands as cyan meta commands", () => {
    const out = run("help").output;
    for (const name of ["challenges", "goto", "next", "prev", "track"]) {
      // meta commands render cyan (36m), unlike the green in-world commands
      expect(out).toMatch(new RegExp(`\\x1b\\[36m${name}\\b`));
    }
  });

  it("track lists, validates, and queues a category switch", () => {
    const listing = strip(run("track").output);
    expect(listing).toContain("[all]");
    expect(consumePendingNavigation()).toBeNull();

    expect(run("track nope").exitCode).toBe(1);
    expect(consumePendingNavigation()).toBeNull();

    expect(run("track all").output).toContain("Already on");
    expect(consumePendingNavigation()).toBeNull();

    expect(run("track git").exitCode).toBeUndefined();
    expect(consumePendingNavigation()).toEqual({ type: "category", id: "git" });
  });
});
