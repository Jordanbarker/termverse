import { describe, it, expect } from "vitest";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { createDevcontainerFilesystem } from "../../../story/filesystem/devcontainer";
import { CommandContext } from "../../commands/types";
import { runBuild, runTests } from "../runner";
import { createInitialSnowflakeState } from "../../snowflake/seed/initial_data";
import { SnowflakeState } from "../../snowflake/state";
import { checkStoryFlagTriggers } from "../../narrative/storyFlags";
import { getDevcontainerStoryFlagTriggers } from "../../../story/storyFlags";
import { REMOTE_REPOS } from "../../git/remotes";
import { gitClone, gitPull, gitCheckout, createBranch } from "../../git/repo";

const username = "player";
const projectDir = `/home/${username}/nexacorp-analytics`;
const homeDir = `/home/${username}`;

/** Set up a devcontainer context with git clone (so git pull works). */
function makeCtxWithGit(opts?: { includeDay2?: boolean; pullUpdates?: boolean }): CommandContext & { getSnowflakeState: () => SnowflakeState } {
  const root = createDevcontainerFilesystem(username);
  let fs = new VirtualFS(root, homeDir, homeDir);

  const cloneResult = gitClone(fs, homeDir, "nexacorp/nexacorp-analytics", "Ren <ren@nexacorp.com>");
  if (cloneResult.error) throw new Error(cloneResult.error);
  fs = cloneResult.fs;

  if (opts?.pullUpdates) {
    const pullResult = gitPull(fs, projectDir, undefined, undefined, { day1_shutdown: true });
    if (pullResult.error) throw new Error(pullResult.error);
    fs = pullResult.fs;
  }

  const snowflakeState = createInitialSnowflakeState(opts?.includeDay2 ? { includeDay2: true } : undefined);
  let currentState = snowflakeState;

  return {
    fs, cwd: projectDir, homeDir, username,
    activeComputer: "devcontainer" as const,
    storyFlags: { devcontainer_visited: true },
    snowflakeState,
    setSnowflakeState: (s: SnowflakeState) => { currentState = s; },
    getSnowflakeState: () => currentState,
  } as CommandContext & { getSnowflakeState: () => SnowflakeState };
}

/** Simple context without git (for tests that don't need pull). */
function makeSimpleCtx(): CommandContext & { getSnowflakeState: () => SnowflakeState } {
  const root = createDevcontainerFilesystem(username, { dbt_project_cloned: true });
  const fs = new VirtualFS(root, projectDir, homeDir);
  const snowflakeState = createInitialSnowflakeState();
  let currentState = snowflakeState;

  return {
    fs, cwd: projectDir, homeDir, username,
    activeComputer: "devcontainer" as const,
    storyFlags: { devcontainer_visited: true },
    snowflakeState,
    setSnowflakeState: (s: SnowflakeState) => { currentState = s; },
    getSnowflakeState: () => currentState,
  } as CommandContext & { getSnowflakeState: () => SnowflakeState };
}

describe("Day 2 Quest: Fix the Broken Pipeline", () => {
  describe("Day 1 — no conversion_rate test", () => {
    it("dbt build has no conversion_rate test", () => {
      const ctx = makeSimpleCtx();
      const result = runBuild(ctx);
      expect(result.output).not.toContain("conversion_rate");
    });
  });

  describe("Day 2 — NULL data + pulled schema test", () => {
    it("dbt test fails on not_null_rpt_campaign_performance_conversion_rate", () => {
      const ctx = makeCtxWithGit({ includeDay2: true, pullUpdates: true });

      // Run models first so tests have tables to query
      runBuild(ctx);
      const latestState = ctx.getSnowflakeState();

      const testResult = runTests({ ...ctx, snowflakeState: latestState });
      expect(testResult.output).toContain("not_null_rpt_campaign_performance_conversion_rate");
      expect(testResult.output).toContain("FAIL");
      expect(testResult.triggerEvents).toEqual(
        expect.arrayContaining([{ type: "command_executed", detail: "dbt_test_fail" }])
      );
    });

    it("dbt build emits dbt_test_fail trigger", () => {
      const ctx = makeCtxWithGit({ includeDay2: true, pullUpdates: true });
      const result = runBuild(ctx);
      expect(result.triggerEvents).toEqual(
        expect.arrayContaining([
          { type: "command_executed", detail: "dbt_test_fail" },
          { type: "command_executed", detail: "dbt_build" },
        ])
      );
    });
  });

  describe("Day 2 — after COALESCE fix", () => {
    it("dbt test all pass after fixing the model SQL", () => {
      const ctx = makeCtxWithGit({ includeDay2: true, pullUpdates: true });

      // Apply a COALESCE fix to rpt_campaign_performance.sql
      const modelPath = `${projectDir}/models/marts/rpt_campaign_performance.sql`;
      const modelContent = ctx.fs.readFile(modelPath);
      expect(modelContent.content).toBeTruthy();

      // Replace the conversion_rate calculation with a NULL-safe version
      // COALESCE wraps the whole expression so NULL clicks → 0 instead of NULL
      const fixed = modelContent.content!.replace(
        "round(sum(conversions) * 100.0 / nullif(sum(clicks), 0), 2) as conversion_rate",
        "coalesce(round(sum(conversions) * 100.0 / nullif(sum(clicks), 0), 2), 0) as conversion_rate"
      );
      expect(fixed).not.toEqual(modelContent.content);

      const writeResult = ctx.fs.writeFile(modelPath, fixed);
      const fixedCtx: typeof ctx = { ...ctx, fs: writeResult.fs! };

      // Run build to materialize the fixed model
      runBuild(fixedCtx);
      const latestState = fixedCtx.getSnowflakeState();

      // Now run tests against the fixed data
      const testResult = runTests({ ...fixedCtx, snowflakeState: latestState });
      // The conversion_rate test should pass now — WARN count should decrease by 1
      expect(testResult.output).toContain("not_null_rpt_campaign_performance_conversion_rate");
      // The specific conversion_rate test should show PASS, not FAIL
      const stripped = testResult.output.replace(/\x1b\[[0-9;]*m/g, "");
      expect(stripped).toMatch(/PASS\s+not_null_rpt_campaign_performance_conversion_rate/);
      // With the fix applied, dbt_test_all_pass should fire (no errors)
      expect(testResult.triggerEvents).toEqual(
        expect.arrayContaining([{ type: "command_executed", detail: "dbt_test_all_pass" }])
      );
    });
  });
});

describe("requiredFlags gating", () => {
  it("blocks trigger when requiredFlags are not met", () => {
    const triggers = getDevcontainerStoryFlagTriggers(username);
    const event = { type: "command_executed" as const, detail: "git_pull_origin_main" };

    const results = checkStoryFlagTriggers(event, triggers, {});
    expect(results.find(r => r.flag === "pulled_day2_updates")).toBeUndefined();
  });

  it("allows trigger when requiredFlags are met", () => {
    const triggers = getDevcontainerStoryFlagTriggers(username);
    const event = { type: "command_executed" as const, detail: "git_pull_origin_main" };

    const results = checkStoryFlagTriggers(event, triggers, { ssh_day2: true });
    expect(results.find(r => r.flag === "pulled_day2_updates")).toBeDefined();
  });

  it("blocks dbt_test_fail without pulled_day2_updates", () => {
    const triggers = getDevcontainerStoryFlagTriggers(username);
    const event = { type: "command_executed" as const, detail: "dbt_test_fail" };

    const results = checkStoryFlagTriggers(event, triggers, { ssh_day2: true });
    expect(results.find(r => r.flag === "dbt_test_failed_day2")).toBeUndefined();
  });

  it("allows dbt_test_fail with pulled_day2_updates", () => {
    const triggers = getDevcontainerStoryFlagTriggers(username);
    const event = { type: "command_executed" as const, detail: "dbt_test_fail" };

    const results = checkStoryFlagTriggers(event, triggers, { ssh_day2: true, pulled_day2_updates: true });
    expect(results.find(r => r.flag === "dbt_test_failed_day2")).toBeDefined();
  });
});

describe("getUpdates for nexacorp-analytics remote", () => {
  const remote = REMOTE_REPOS["nexacorp/nexacorp-analytics"];

  it("returns empty when day1_shutdown is not set", () => {
    const commits = remote.getUpdates!({}, "abc1234");
    expect(commits).toEqual([]);
  });

  it("returns empty when localHead is null", () => {
    const commits = remote.getUpdates!({ day1_shutdown: true }, null);
    expect(commits).toEqual([]);
  });

  it("returns a commit when day1_shutdown is set and localHead exists", () => {
    const commits = remote.getUpdates!({ day1_shutdown: true }, "abc1234");
    expect(commits).toHaveLength(1);
    expect(commits[0].author).toContain("Auri Park");
    expect(commits[0].message).toContain("conversion_rate");
    expect(commits[0].parent).toBe("abc1234");
    expect(commits[0].tree["models/marts/_marts__models.yml"]).toContain("conversion_rate");
  });
});

describe("git checkout -b emits triggerEvents", () => {
  it("includes git_checkout_b event", () => {
    const root = createDevcontainerFilesystem(username);
    let fs = new VirtualFS(root, homeDir, homeDir);
    const cloneResult = gitClone(fs, homeDir, "nexacorp/nexacorp-analytics", "Ren <ren@nexacorp.com>");
    fs = cloneResult.fs;

    // Use a simple branch name without slashes to avoid directory creation issues
    const result = gitCheckout(fs, projectDir, "fix-null-campaign", true);
    expect(result.error).toBeUndefined();
    expect(result.triggerEvents).toEqual([{ type: "command_executed", detail: "git_checkout_b" }]);
  });
});

describe("Day 2 Quest: cascade & alt-path completion", () => {
  it("dbt_test_all_pass also fires investigated_null_data and created_fix_branch (cascade)", () => {
    // The player who skipped `snow sql` and used `git branch` instead of `git checkout -b`
    // should still get credit for those subtasks once their fix turns dbt green.
    const triggers = getDevcontainerStoryFlagTriggers(username);
    const event = { type: "command_executed" as const, detail: "dbt_test_all_pass" };

    const results = checkStoryFlagTriggers(event, triggers, {
      ssh_day2: true,
      pulled_day2_updates: true,
      dbt_test_failed_day2: true,
    });

    const flags = results.map(r => r.flag);
    expect(flags).toContain("fixed_campaign_model");
    expect(flags).toContain("investigated_null_data");
    expect(flags).toContain("created_fix_branch");
  });

  it("cascade respects dbt_test_failed_day2 — won't credit subtasks before the player has even seen the bug", () => {
    const triggers = getDevcontainerStoryFlagTriggers(username);
    const event = { type: "command_executed" as const, detail: "dbt_test_all_pass" };

    const results = checkStoryFlagTriggers(event, triggers, {});
    expect(results.find(r => r.flag === "investigated_null_data")).toBeUndefined();
    expect(results.find(r => r.flag === "created_fix_branch")).toBeUndefined();
  });

  it("cascade does not double-fire when the player took the intended path (flag already set)", () => {
    const triggers = getDevcontainerStoryFlagTriggers(username);
    const event = { type: "command_executed" as const, detail: "dbt_test_all_pass" };

    const results = checkStoryFlagTriggers(event, triggers, {
      ssh_day2: true,
      pulled_day2_updates: true,
      dbt_test_failed_day2: true,
      investigated_null_data: true,
      created_fix_branch: true,
    });

    expect(results.find(r => r.flag === "investigated_null_data")).toBeUndefined();
    expect(results.find(r => r.flag === "created_fix_branch")).toBeUndefined();
    // fixed_campaign_model still fires (it wasn't set yet)
    expect(results.find(r => r.flag === "fixed_campaign_model")).toBeDefined();
  });

  it("`git branch <name>` (no -b) fires git_checkout_b so created_fix_branch can set", () => {
    const root = createDevcontainerFilesystem(username);
    let fs = new VirtualFS(root, homeDir, homeDir);
    const cloneResult = gitClone(fs, homeDir, "nexacorp/nexacorp-analytics", "Ren <ren@nexacorp.com>");
    fs = cloneResult.fs;

    const branchResult = createBranch(fs, projectDir, "fix-null-campaign");
    expect(branchResult.error).toBeUndefined();
    expect(branchResult.triggerEvents).toEqual([{ type: "command_executed", detail: "git_checkout_b" }]);

    // And the trigger system would set created_fix_branch given the right gating
    const triggers = getDevcontainerStoryFlagTriggers(username);
    const results = checkStoryFlagTriggers(branchResult.triggerEvents![0], triggers, {
      ssh_day2: true,
      pulled_day2_updates: true,
      dbt_test_failed_day2: true,
    });
    expect(results.find(r => r.flag === "created_fix_branch")).toBeDefined();
  });
});
