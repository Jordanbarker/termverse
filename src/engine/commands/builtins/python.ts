import { registerAsync, registerAlias } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { AsyncCommandHandler, CommandResult } from "../types";
import { getPyodide } from "../../python/pyodideLoader";
import { resolvePath } from "../../../lib/pathUtils";
import { colorize, ansi } from "../../../lib/ansi";
import { HELP_TEXTS } from "./helpTexts";

const pythonHandler: AsyncCommandHandler = async (args, flags, ctx) => {
  // python -c "code" — inline execution
  if (flags.c) {
    const code = args.join(" ");
    if (!code) {
      return { output: "python: option requires an argument -- 'c'" };
    }
    return runCode(code);
  }

  // python script.py [args...] — file execution
  if (args.length > 0) {
    const filePath = resolvePath(args[0], ctx.cwd, ctx.homeDir);

    // Intercept auto_apply.py on home PC with simulated output
    if (ctx.activeComputer === "home" && filePath.endsWith("/auto_apply.py")) {
      return simulateAutoApply(args.slice(1));
    }

    const result = ctx.fs.readFile(filePath);
    if (result.error) {
      return { output: `python: can't open file '${args[0]}': ${result.error}` };
    }
    return runCode(result.content!);
  }

  // python (no args) — launch REPL
  return { output: "", interactiveSession: { type: "pythonRepl" } };
};

export function simulateAutoApply(scriptArgs: string[]): CommandResult {
  const triggerEvents = [{ type: "command_executed" as const, detail: "ran_auto_apply" }];

  if (scriptArgs.includes("--status")) {
    const output = [
      "auto_apply.py — Application Status Report",
      "==========================================",
      "",
      "Total applications:  47",
      "  Pending:           31",
      "  Viewed:             9",
      "  Rejected:           5",
      "  Interview:          2",
      "",
      `Response rate: ${colorize("4.3%", ansi.yellow)} (industry avg: 8-12%)`,
      "",
      "Recent activity:",
      `  Cascade Analytics      Viewed       2 days ago`,
      `  NexaCorp               ${colorize("Interview", ansi.green)}    1 day ago`,
      `  Prometheus AI          Rejected     3 days ago`,
      `  Orion Data             Pending      5 days ago`,
      `  CortexLab              Pending      1 week ago`,
    ].join("\n");
    return { output, triggerEvents };
  }

  if (scriptArgs.includes("--dry-run")) {
    const output = [
      "[DRY RUN] auto_apply.py starting...",
      "[DRY RUN] Loading config from ~/.config/auto_apply/config.yaml",
      "[DRY RUN] Keywords: AI engineer, ML engineer, machine learning",
      "[DRY RUN] Max pages: 5",
      "",
      "[DRY RUN] Scraping indeed.com... found 12 listings",
      "[DRY RUN] Scraping linkedin.com... found 8 listings",
      "[DRY RUN] Scraping glassdoor.com... found 3 listings",
      "",
      "[DRY RUN] Would apply to 23 positions (use without --dry-run to submit)",
    ].join("\n");
    return { output, triggerEvents };
  }

  const output = [
    "auto_apply.py starting...",
    "Loading config from ~/.config/auto_apply/config.yaml",
    "Keywords: AI engineer, ML engineer, machine learning",
    "",
    "Scraping indeed.com... found 12 listings",
    "Scraping linkedin.com... found 8 listings",
    "Scraping glassdoor.com... found 3 listings",
    "",
    "Applying to 23 positions...",
    `  [1/23] Cascade Analytics — ML Engineer ........... ${colorize("sent", ansi.green)}`,
    `  [2/23] NexaCorp — AI Engineer .................... ${colorize("sent", ansi.green)}`,
    `    ${colorize("⚠ Warning: NexaCorp has 2.6★ rating (3 reviews)", ansi.yellow)}`,
    `  [3/23] Prometheus AI — Head of AI Strategy ....... ${colorize("skipped (requires 10+ yrs)", ansi.dim)}`,
    `  [4/23] Orion Data — Senior ML Engineer ........... ${colorize("sent", ansi.green)}`,
    `  [5/23] CortexLab — Research Engineer ............. ${colorize("sent", ansi.green)}`,
    "  ...",
    `  [23/23] DataForge — Junior Data Scientist ........ ${colorize("sent", ansi.green)}`,
    "",
    "Done. Applied to 19/23 positions.",
    "Results saved to ~/scripts/data/applications.log",
  ].join("\n");
  return { output, triggerEvents };
}

async function runCode(code: string): Promise<{ output: string }> {
  try {
    const pyodide = await getPyodide();

    let output = "";
    pyodide.setStdout({
      batched: (text: string) => {
        output += text + "\n";
      },
    });
    pyodide.setStderr({
      batched: (text: string) => {
        output += text + "\n";
      },
    });

    pyodide.runPython(code);
    return { output: output.replace(/\n$/, "") };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("SystemExit")) {
      return { output: "" };
    }
    const lines = errMsg.split("\n").filter((l) => l.trim());
    const lastLine = lines[lines.length - 1] || errMsg;
    return { output: colorize(lastLine, ansi.red) };
  }
}

const description = "Run Python scripts or start an interactive Python REPL";
registerAsync("python", pythonHandler, description, HELP_TEXTS.python);
setKnownFlags("python", { short: ["c"] });
registerAlias("python3", "python");
setKnownFlags("python3", { short: ["c"] });
