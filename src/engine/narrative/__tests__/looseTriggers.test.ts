import { describe, it, expect } from "vitest";
import { checkStoryFlagTriggers } from "../storyFlags";
import { getNexacorpStoryFlagTriggers, getStoryFlagTriggers } from "../../../story/storyFlags";
import { NEXACORP_PATHS } from "../../../story/filesystem/paths";
import { GameEvent } from "../../mail/delivery";
import { StoryFlags } from "../../../state/types";

const username = "ren";

function fireFlags(event: GameEvent, triggers: ReturnType<typeof getNexacorpStoryFlagTriggers>, flags: StoryFlags): string[] {
  return checkStoryFlagTriggers(event, triggers, flags).map((r) => r.flag);
}

// Validates the "validate results, not keystrokes" principle: each loosened
// quest should fire its flag from any reasonable command path, not one specific spelling.

describe("auri_used_head/tail/wc — file_read on pipeline_runs.csv", () => {
  const triggers = getNexacorpStoryFlagTriggers(username);
  const event: GameEvent = { type: "file_read", detail: NEXACORP_PATHS.pipelineRuns };

  it("fires all three flags from a single read of pipeline_runs.csv", () => {
    const flags = fireFlags(event, triggers, {});
    expect(flags).toContain("auri_used_head");
    expect(flags).toContain("auri_used_tail");
    expect(flags).toContain("auri_used_wc");
  });

  it("does not fire when reading an unrelated file", () => {
    const other: GameEvent = { type: "file_read", detail: "/srv/engineering/chen-handoff/notes.txt" };
    const flags = fireFlags(other, triggers, {});
    expect(flags).not.toContain("auri_used_head");
    expect(flags).not.toContain("auri_used_tail");
    expect(flags).not.toContain("auri_used_wc");
  });
});

describe("oscar_diffed_logs — read-pair cascade", () => {
  const triggers = getNexacorpStoryFlagTriggers(username);

  it("fires from explicit `diff` command (fast path)", () => {
    const event: GameEvent = { type: "command_executed", detail: "diff" };
    const flags = fireFlags(event, triggers, {});
    expect(flags).toContain("oscar_diffed_logs");
  });

  it("does not fire on a single file read alone", () => {
    const event: GameEvent = { type: "file_read", detail: NEXACORP_PATHS.systemLog };
    const flags = fireFlags(event, triggers, {});
    expect(flags).toContain("oscar_searched_logs");
    expect(flags).not.toContain("oscar_diffed_logs");
  });

  it("fires when reading system.log AFTER system.log.bak (any tool)", () => {
    const event: GameEvent = { type: "file_read", detail: NEXACORP_PATHS.systemLog };
    const flags = fireFlags(event, triggers, { oscar_checked_backups: true });
    expect(flags).toContain("oscar_diffed_logs");
  });

  it("fires when reading system.log.bak AFTER system.log (any tool)", () => {
    const event: GameEvent = { type: "file_read", detail: NEXACORP_PATHS.systemLogBak };
    const flags = fireFlags(event, triggers, { oscar_searched_logs: true });
    expect(flags).toContain("oscar_diffed_logs");
  });
});

describe("copied_scripts_backup — cp OR file_read on destination", () => {
  const triggers = getStoryFlagTriggers(username);

  it("fires from `cp` (fast path)", () => {
    const event: GameEvent = { type: "command_executed", detail: "cp" };
    const flags = fireFlags(event, triggers, {});
    expect(flags).toContain("copied_scripts_backup");
  });

  it("fires from reading the backup script (any redirect/editor path)", () => {
    const event: GameEvent = { type: "file_read", detail: `/home/${username}/backups/scripts/backup.sh` };
    const flags = fireFlags(event, triggers, {});
    expect(flags).toContain("copied_scripts_backup");
    // verified_backup should also fire from the same read
    expect(flags).toContain("verified_backup");
  });
});

describe("used_grep_at_home — text_filtered event", () => {
  const triggers = getStoryFlagTriggers(username);

  it("fires on text_filtered (grep emits this)", () => {
    const event: GameEvent = { type: "command_executed", detail: "text_filtered" };
    const flags = fireFlags(event, triggers, {});
    expect(flags).toContain("used_grep_at_home");
  });

  it("does NOT fire on bare 'grep' detail (loosened away from keystroke check)", () => {
    const event: GameEvent = { type: "command_executed", detail: "grep" };
    const flags = fireFlags(event, triggers, {});
    expect(flags).not.toContain("used_grep_at_home");
  });
});

describe("used_sort_uniq_home — data_deduped event", () => {
  const triggers = getStoryFlagTriggers(username);

  it("fires on data_deduped (uniq AND sort -u emit this)", () => {
    const event: GameEvent = { type: "command_executed", detail: "data_deduped" };
    const flags = fireFlags(event, triggers, {});
    expect(flags).toContain("used_sort_uniq_home");
  });

  it("does NOT fire on bare 'uniq' detail", () => {
    const event: GameEvent = { type: "command_executed", detail: "uniq" };
    const flags = fireFlags(event, triggers, {});
    expect(flags).not.toContain("used_sort_uniq_home");
  });
});

describe("used_find_home — files_searched event", () => {
  const triggers = getStoryFlagTriggers(username);

  it("fires on files_searched (find AND tree emit this)", () => {
    const event: GameEvent = { type: "command_executed", detail: "files_searched" };
    const flags = fireFlags(event, triggers, {});
    expect(flags).toContain("used_find_home");
  });

  it("does NOT fire on bare 'find' detail", () => {
    const event: GameEvent = { type: "command_executed", detail: "find" };
    const flags = fireFlags(event, triggers, {});
    expect(flags).not.toContain("used_find_home");
  });
});

describe("shutdown triggers — guarded so cosmetic reboots stay consequence-free", () => {
  const triggers = getStoryFlagTriggers(username);
  const event: GameEvent = { type: "command_executed", detail: "shutdown" };

  it("does NOT advance the day before returned_home_day1 (early-game cosmetic reboot)", () => {
    const flags = fireFlags(event, triggers, {});
    expect(flags).not.toContain("day1_shutdown");
    expect(flags).not.toContain("anon_tip_quest_started");
  });

  it("fires both flags on the scripted end-of-Day-1 shutdown", () => {
    const flags = fireFlags(event, triggers, { returned_home_day1: true });
    expect(flags).toContain("day1_shutdown");
    expect(flags).toContain("anon_tip_quest_started");
  });
});

describe("used_which_python — python_located event", () => {
  const triggers = getStoryFlagTriggers(username);

  it("fires on python_located (which/command/type emit this)", () => {
    const event: GameEvent = { type: "command_executed", detail: "python_located" };
    const flags = fireFlags(event, triggers, {});
    expect(flags).toContain("used_which_python");
  });

  it("does NOT fire on legacy 'which_python' detail (renamed)", () => {
    const event: GameEvent = { type: "command_executed", detail: "which_python" };
    const flags = fireFlags(event, triggers, {});
    expect(flags).not.toContain("used_which_python");
  });
});
