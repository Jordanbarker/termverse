import { describe, it, expect } from "vitest";
import { accessLogTopSummary } from "../accessLogSummary";
import { getMenuItems } from "../menuItems";
import { createNexacorpFilesystem } from "../../filesystem/nexacorp";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { execute } from "../../../engine/commands/registry";
import { CommandContext } from "@tt/core/commands/types";
import "../../../engine/commands/builtins";

const USERNAME = "testplayer";

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

/** Build the NexaCorp FS before day1_shutdown (access.log = day-1 variant). */
function makeFS(): VirtualFS {
  const root = createNexacorpFilesystem(USERNAME);
  return new VirtualFS(root, `/home/${USERNAME}`, `/home/${USERNAME}`);
}

/** Run the real engine pipeline: sort /var/log/access.log | uniq -c | sort -rn | head */
function enginePipeline(fs: VirtualFS): string[] {
  const unlocked = { search_tools_unlocked: true, inspection_tools_unlocked: true, processing_tools_unlocked: true };
  const base = { fs, cwd: fs.cwd, homeDir: fs.homeDir, username: USERNAME, activeComputer: "nexacorp" as const, storyFlags: unlocked };
  const ctx = (overrides: Partial<CommandContext>): CommandContext => ({ ...base, ...overrides });

  const sortFile = execute("sort", ["/var/log/access.log"], {}, ctx({}));
  const uniq = execute("uniq", [], { c: true }, ctx({ stdin: stripAnsi(sortFile.output) }));
  const sortRn = execute("sort", [], { r: true, n: true }, ctx({ stdin: stripAnsi(uniq.output) }));
  const head = execute("head", [], {}, ctx({ stdin: stripAnsi(sortRn.output) }));
  return stripAnsi(head.output).split("\n");
}

describe("accessLogTopSummary", () => {
  it("matches the real engine sort | uniq -c | sort -rn | head output (top 5)", () => {
    const fs = makeFS();
    const log = fs.readFile("/var/log/access.log").content ?? "";
    expect(log).not.toBe("");

    const engineTop5 = enginePipeline(fs).slice(0, 5);
    const helper = accessLogTopSummary(log, 5).split("\n");

    expect(helper).toEqual(engineTop5);
  });

  it("formats counts with uniq -c style padding and is dominated by chip_service_account", () => {
    const fs = makeFS();
    const log = fs.readFile("/var/log/access.log").content ?? "";
    const lines = accessLogTopSummary(log, 5).split("\n");

    expect(lines).toHaveLength(5);
    for (const line of lines) {
      // `${count.padStart(7)} ${line}` -> count occupies cols 0-6, space at col 7
      expect(line.slice(0, 7)).toMatch(/^\s*\d+$/);
      expect(line[7]).toBe(" ");
      expect(line).toContain("chip_service_account");
    }
  });

  it("returns empty string for empty input", () => {
    expect(accessLogTopSummary("", 5)).toBe("");
    expect(accessLogTopSummary("\n", 5)).toBe("");
  });
});

describe("Chip review_access_log response", () => {
  it("renders the real top-5 access.log lines and the command echo", () => {
    const fs = makeFS();
    const flags = { processing_tools_unlocked: true };
    const item = getMenuItems(flags, "nexacorp").find((i) => i.id === "review_access_log");
    expect(item).toBeDefined();

    const response = typeof item!.response === "function" ? item!.response(fs) : item!.response;
    const log = fs.readFile("/var/log/access.log").content ?? "";

    expect(response).toContain("$ sort /var/log/access.log | uniq -c | sort -rn | head");
    expect(response).toContain(accessLogTopSummary(log, 5));
    expect(response).toContain("Nothing in there jumps out as concerning.");
  });
});
