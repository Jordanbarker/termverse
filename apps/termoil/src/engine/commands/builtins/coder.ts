import { CommandHandler, IncrementalLine } from "@tt/core/commands/types";
import { register } from "@tt/core/commands/registry";
import { colorize, ansi } from "@tt/core/lib/ansi";
import type { ComputerId } from "../../../state/types";

interface WorkspaceSpec {
  template: string;
  description: string;
  computerId: ComputerId;
  /** Story flag that gates discovery. If unset, `coder ssh <name>` and listing it errors. */
  unlockFlag?: string;
}

/**
 * Map of `coder` workspace name → spec. The Chip platform workspace is gated
 * behind the plugin-development unlock; before that flag is set, it behaves
 * as if it doesn't exist.
 */
const WORKSPACES: Record<string, WorkspaceSpec> = {
  ai: {
    template: "devcontainer",
    description: "Data engineering environment",
    computerId: "devcontainer",
  },
  chip: {
    template: "platform",
    description: "Chip platform team workspace (plugins, RAG, runtime)",
    computerId: "chipinfra",
    unlockFlag: "unlock_chip_plugin_development",
  },
};

function isVisible(name: string, storyFlags?: Record<string, string | boolean>): boolean {
  const ws = WORKSPACES[name];
  if (!ws) return false;
  if (!ws.unlockFlag) return true;
  return !!storyFlags?.[ws.unlockFlag];
}

function visibleWorkspaceNames(storyFlags?: Record<string, string | boolean>): string[] {
  return Object.keys(WORKSPACES).filter((n) => isVisible(n, storyFlags));
}

function notFoundError(name: string, storyFlags?: Record<string, string | boolean>): string {
  const visible = visibleWorkspaceNames(storyFlags);
  const list = visible.map((n) => `  ${n}    ${WORKSPACES[n].description}`).join("\n");
  return `coder: workspace '${name}' not found\n\nAvailable workspaces:\n${list}`;
}

function usageOutput(): string {
  const lines = [
    `${colorize("coder", ansi.bold)} — Remote development environments`,
    "",
    `${colorize("USAGE:", ansi.bold)}`,
    "  coder <subcommand> [options]",
    "",
    `${colorize("SUBCOMMANDS:", ansi.bold)}`,
    "  list          List workspaces",
    "  start <name>  Start a workspace",
    "  stop <name>   Stop a workspace",
    "  ssh <name>    SSH into a workspace",
    "  logs <name>   Show workspace build logs",
    "  create        Create a new workspace",
    "  delete        Delete a workspace",
  ];
  return lines.join("\n");
}

function isStopped(name: string, storyFlags?: Record<string, string | boolean>): boolean {
  // Only the `ai` workspace can be stopped today (preserves existing day-2 quest behavior).
  // The chip platform workspace is always running.
  if (name === "ai") return storyFlags?.coder_workspace_stopped === true;
  return false;
}

const coder: CommandHandler = (args, _flags, ctx) => {
  if (ctx.activeComputer !== "nexacorp") {
    return { output: "coder: command not available outside NexaCorp" };
  }

  const sub = args[0];

  if (!sub) {
    return { output: usageOutput() };
  }

  switch (sub) {
    case "list":
    case "ls": {
      const headerCols = `${colorize("WORKSPACE", ansi.bold + ansi.dim)}  ${colorize("STATUS", ansi.bold + ansi.dim)}   ${colorize("TEMPLATE", ansi.bold + ansi.dim)}    ${colorize("LAST BUILT", ansi.bold + ansi.dim)}`;
      const rows = visibleWorkspaceNames(ctx.storyFlags).map((name) => {
        const ws = WORKSPACES[name];
        const status = isStopped(name, ctx.storyFlags)
          ? colorize("Stopped", ansi.red)
          : colorize("Running", ansi.green);
        return `${name.padEnd(10)}${status}   ${ws.template.padEnd(13)}  2h ago`;
      });
      return { output: [headerCols, ...rows].join("\n") };
    }

    case "start": {
      const name = args[1];
      if (!name) {
        return { output: "usage: coder start <workspace>", exitCode: 1 };
      }
      if (!isVisible(name, ctx.storyFlags)) {
        return { output: notFoundError(name, ctx.storyFlags), exitCode: 1 };
      }

      if (!isStopped(name, ctx.storyFlags)) {
        return { output: `workspace "${name}" is already running` };
      }

      const lines: IncrementalLine[] = [
        { text: colorize(`Starting workspace "${name}"...`, ansi.dim), delayMs: 0 },
        { text: colorize("⧗ Waiting for workspace agent...", ansi.dim), delayMs: 400 },
        { text: colorize("⧗ Starting workspace agent...", ansi.dim), delayMs: 400 },
        { text: colorize("⧗ Running startup scripts...", ansi.dim), delayMs: 300 },
        { text: colorize("✓ Workspace agent connected", ansi.green), delayMs: 200 },
        { text: `\nWorkspace "${name}" is now ${colorize("running", ansi.green)}.`, delayMs: 0 },
      ];
      return {
        output: "",
        incrementalLines: lines,
        triggerEvents: [{ type: "command_executed", detail: "coder_start" }],
      };
    }

    case "stop": {
      const name = args[1];
      if (!name) {
        return { output: "usage: coder stop <workspace>", exitCode: 1 };
      }
      if (!isVisible(name, ctx.storyFlags)) {
        return { output: notFoundError(name, ctx.storyFlags), exitCode: 1 };
      }

      if (isStopped(name, ctx.storyFlags)) {
        return { output: `workspace "${name}" is already stopped` };
      }

      // Stopping a workspace closes any tabs on its computer.
      const ws = WORKSPACES[name];
      return {
        output: `Stopping workspace "${name}"...\n${colorize("✓ Workspace stopped", ansi.green)}`,
        triggerEvents: [{ type: "command_executed", detail: "coder_stop" }],
        closeTabsForComputer: ws.computerId,
      };
    }

    case "ssh": {
      if (args.length < 2) {
        const visible = visibleWorkspaceNames(ctx.storyFlags);
        const list = visible.map((n) => `  ${n}    ${WORKSPACES[n].description}`).join("\n");
        return { output: `usage: coder ssh <workspace>\n\nAvailable workspaces:\n${list}` };
      }
      const name = args[1];
      if (!isVisible(name, ctx.storyFlags)) {
        return { output: notFoundError(name, ctx.storyFlags), exitCode: 1 };
      }

      if (isStopped(name, ctx.storyFlags)) {
        return {
          output: `workspace "${name}" is stopped\n\nStart it with: coder start ${name}`,
          exitCode: 1,
        };
      }

      const ws = WORKSPACES[name];
      return { output: "", transitionTo: ws.computerId };
    }

    case "logs": {
      const name = args[1];
      if (!name) {
        return { output: "usage: coder logs <workspace>", exitCode: 1 };
      }
      if (!isVisible(name, ctx.storyFlags)) {
        return { output: notFoundError(name, ctx.storyFlags), exitCode: 1 };
      }

      const lines = [
        colorize(`=== Build logs for workspace "${name}" ===`, ansi.bold),
        "",
        colorize("[2025-03-15 09:12:33]", ansi.dim) + " Pulling devcontainer image...",
        colorize("[2025-03-15 09:12:35]", ansi.dim) + " Image: ghcr.io/nexacorp/data-eng:latest",
        colorize("[2025-03-15 09:12:35]", ansi.dim) + " Digest: sha256:a1b2c3d4e5f6...",
        colorize("[2025-03-15 09:12:36]", ansi.dim) + " Starting container...",
        colorize("[2025-03-15 09:12:37]", ansi.dim) + " Installing extensions: ms-python.python, dbt-labs.dbt",
        colorize("[2025-03-15 09:12:38]", ansi.dim) + " Running postCreateCommand: pip install dbt-snowflake",
        colorize("[2025-03-15 09:12:40]", ansi.dim) + " Configuring Snowflake credentials...",
        colorize("[2025-03-15 09:12:41]", ansi.dim) + " Agent connected successfully",
        colorize("[2025-03-15 09:12:41]", ansi.dim) + " Startup script completed in 8.2s",
        "",
        colorize("✓ Build completed successfully", ansi.green),
      ];
      return { output: lines.join("\n") };
    }

    case "create": {
      return {
        output: colorize("Error: ", ansi.red) + "You don't have permission to create workspaces.\nContact your Coder admin for access.",
        exitCode: 1,
      };
    }

    case "delete": {
      return {
        output: colorize("Error: ", ansi.red) + "You don't have permission to delete workspaces.\nContact your Coder admin for access.",
        exitCode: 1,
      };
    }

    default:
      return { output: `coder: unknown subcommand '${sub}'\n\n${usageOutput()}`, exitCode: 1 };
  }
};

register("coder", coder, "Remote development environments on Coder");
