#!/usr/bin/env npx tsx
/**
 * Headless Game Runner for Terminal Turmoil.
 *
 * Replicates the game loop from useTerminal.ts without xterm.js or a browser.
 * Run: npx tsx scripts/play.ts
 */

// Must mock localStorage BEFORE any imports that use it
const storage = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => { storage.set(k, v); },
  removeItem: (k: string) => { storage.delete(k); },
  clear: () => storage.clear(),
  get length() { return storage.size; },
  key: (i: number) => [...storage.keys()][i] ?? null,
} as Storage;

// Engine imports (no React/Zustand dependency)
import { parseChainedPipeline, parseInput, expandAliases } from "@tt/core/commands/parser";
import { execute, executeAsync, isAsyncCommand } from "@tt/core/commands/registry";
import "../src/engine/commands/builtins"; // side-effect: registers all commands
import { computeEffects, SessionToStart } from "@tt/core/commands/applyResult";
import { CommandResult, ChainSegment, ParsedCommand } from "@tt/core/commands/types";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { createHomeFilesystem } from "../src/story/filesystem/home";
import { createNexacorpFilesystem } from "../src/story/filesystem/nexacorp";
import { createDevcontainerFilesystem } from "../src/story/filesystem/devcontainer";
import { createChipinfraFilesystem } from "../src/story/filesystem/chipinfra";
import { createErikpcFilesystem } from "../src/story/filesystem/erikpc";
import { getComputerUsername } from "../src/story/player";
import { initEnvForComputer, initAliasesForComputer } from "../src/story/env";
import { Mounts } from "@tt/core/filesystem/mounts";
import { SnowflakeState } from "@tt/core/snowflake/state";
import { createInitialSnowflakeState } from "@/story/data/snowflake/initial_data";
import { createDefaultContext, SessionContext } from "@tt/core/snowflake/session/context";
import { checkEmailDeliveries, GameEvent } from "../src/engine/mail/delivery";
import { getSentDir } from "../src/engine/mail/mailUtils";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { extractStdoutRedirect, applyRedirection, precheckRedirects } from "@tt/core/commands/redirection";
import { PromptSessionInfo } from "../src/engine/prompt/types";
import { ComputerId, StoryFlags, PLAYER, COMPUTERS } from "../src/state/types";
import { colorize, ansi, stripAnsi } from "@tt/core/lib/ansi";
import { parseZshHistory } from "../packages/core/src/terminal/zshHistory";
import { execSync } from "child_process";

// ── Types ───────────────────────────────────────────────────────────

interface CommandOutput {
  output: string;
  rawOutput: string;
  exitCode: number;
  events: GameEvent[];
  storyFlagUpdates: Array<{ flag: string; value: string | boolean }>;
  newEmails: string[];
  promptPending: boolean;
  sshSessionStarted: boolean;
}

// ── GameRunner ──────────────────────────────────────────────────────

export class GameRunner {
  fs: VirtualFS;
  cwd: string;
  username: string;
  activeComputer: ComputerId;
  storyFlags: StoryFlags;
  deliveredEmailIds: string[];
  deliveredPiperIds: string[];
  commandHistory: Record<ComputerId, string[]>;
  snowflakeState: SnowflakeState;
  snowflakeContext: SessionContext;
  completedObjectives: string[];
  pendingPrompt: PromptSessionInfo | null;
  envVars: Partial<Record<ComputerId, Record<string, string>>>;
  aliases: Partial<Record<ComputerId, Record<string, string>>>;
  mounts: Record<ComputerId, Mounts>;

  constructor(computer: ComputerId = "home") {
    this.username = PLAYER.username;
    this.activeComputer = computer;
    this.storyFlags = {};
    this.deliveredEmailIds = [];
    this.deliveredPiperIds = [];
    this.commandHistory = { home: [], nexacorp: [], devcontainer: [], chipinfra: [], "erik-pc": [] };
    this.snowflakeState = createInitialSnowflakeState();
    this.snowflakeContext = createDefaultContext(this.username);
    this.completedObjectives = [];
    this.pendingPrompt = null;
    this.envVars = {};
    this.aliases = {};
    this.mounts = { home: {}, nexacorp: {}, devcontainer: {}, chipinfra: {}, "erik-pc": {} };

    const root = computer === "home"
      ? createHomeFilesystem(this.username)
      : createNexacorpFilesystem(this.username, this.storyFlags);
    const homeDir = `/home/${this.username}`;
    this.fs = new VirtualFS(root, homeDir, homeDir);
    this.cwd = homeDir;
    this.envVars[computer] = initEnvForComputer(computer, this.username, this.fs);
    this.aliases[computer] = initAliasesForComputer(computer, this.username, this.fs);

    // Deliver immediate emails (baked into FS already via filesystem factories)
    // Track their IDs so they don't re-deliver
    this.syncImmediateEmailIds();
  }

  /** Scan the mail directory for already-delivered emails and record their IDs. */
  private syncImmediateEmailIds(): void {
    // The filesystem factories already place immediate emails in new/.
    // We don't track them as "delivered" since the delivery system skips
    // immediate triggers anyway — they use trigger.type === "immediate".
  }

  /**
   * Append a submitted line to the `.zsh_history` file (the single source of
   * truth for shell history), mirroring useTerminal.ts (HIST_IGNORE_DUPS).
   */
  private appendZshHistory(input: string): void {
    const path = `${this.fs.homeDir}/.zsh_history`;
    const prev = this.fs.readFile(path).content ?? "";
    const lastLine = prev.trimEnd().split("\n").pop() ?? "";
    if (lastLine !== input) {
      const suffix = prev.endsWith("\n") || prev === "" ? "" : "\n";
      const w = this.fs.writeFile(path, prev + suffix + input + "\n");
      if (w.fs) this.fs = w.fs;
    }
  }

  /**
   * Execute a command string and return structured output.
   * Supports aliases, pipes, redirection, and `&&`/`||`/`;` chains
   * (mirrors useTerminal.ts). Async commands (python, dbt, snow) require runAsync().
   */
  run(input: string): CommandOutput {
    this.commandHistory[this.activeComputer].push(input);
    const { chain, parseError, empty } = this.prepareChain(input);
    if (parseError) return this.parseErrorOutput(parseError);
    if (empty) return this.emptyOutput();

    let lastExitCode = 0;
    let merged: CommandOutput | null = null;

    for (const seg of chain) {
      if (seg.operator === "&&" && lastExitCode !== 0) continue;
      if (seg.operator === "||" && lastExitCode === 0) continue;
      // ';' and null (first): always execute

      const { result, lastParsed } = this.runSegmentPipelineSync(seg);
      lastExitCode = result.exitCode ?? 0;
      const segOut = this.applyEffects(result, lastParsed);
      merged = merged ? this.mergeOutputs(merged, segOut) : segOut;
      if (this.isChainEarlyReturn(result)) break;
    }

    this.appendZshHistory(input);
    const out = merged ?? this.emptyOutput();
    out.exitCode = lastExitCode;
    return out;
  }

  /** Run a command that may be async (e.g. dbt). Same chain semantics as run(). */
  async runAsync(input: string): Promise<CommandOutput> {
    this.commandHistory[this.activeComputer].push(input);
    const { chain, parseError, empty } = this.prepareChain(input);
    if (parseError) return this.parseErrorOutput(parseError);
    if (empty) return this.emptyOutput();

    let lastExitCode = 0;
    let merged: CommandOutput | null = null;

    for (const seg of chain) {
      if (seg.operator === "&&" && lastExitCode !== 0) continue;
      if (seg.operator === "||" && lastExitCode === 0) continue;

      const { result, lastParsed } = await this.runSegmentPipelineAsync(seg);
      lastExitCode = result.exitCode ?? 0;
      const segOut = this.applyEffects(result, lastParsed);
      merged = merged ? this.mergeOutputs(merged, segOut) : segOut;
      if (this.isChainEarlyReturn(result)) break;
    }

    this.appendZshHistory(input);
    const out = merged ?? this.emptyOutput();
    out.exitCode = lastExitCode;
    return out;
  }

  /** Alias-expand the input and parse it into chain segments, surfacing parse errors. */
  private prepareChain(input: string): { chain: ChainSegment[]; parseError?: string; empty: boolean } {
    const expanded = expandAliases(input, this.aliases[this.activeComputer] ?? {});
    const chain = parseChainedPipeline(expanded);
    const errCmd = chain.flatMap((seg) => seg.pipeline).find((p) => p.error);
    if (errCmd) return { chain, parseError: errCmd.error, empty: false };
    const empty = chain.length === 1 && chain[0].pipeline.length === 1 && !chain[0].pipeline[0].command;
    return { chain, empty };
  }

  private parseErrorOutput(error: string): CommandOutput {
    const raw = colorize(error, ansi.red);
    return { ...this.emptyOutput(), output: stripAnsi(raw), rawOutput: raw, exitCode: 2 };
  }

  /** Mirror of useTerminal.ts isChainEarlyReturn — results that must stop the chain. */
  private isChainEarlyReturn(result: CommandResult): boolean {
    return !!(result.editorSession || result.interactiveSession || result.snowSqlSession ||
      result.sshSession || result.chipSession || result.piperSession || result.promptSession ||
      result.incrementalLines || result.transitionTo);
  }

  private buildCtx(p: ParsedCommand, stdin: string | undefined, isPiped: boolean) {
    return {
      fs: this.fs,
      cwd: this.cwd,
      homeDir: this.fs.homeDir,
      username: this.username,
      activeComputer: this.activeComputer,
      storyFlags: this.storyFlags,
      stdin,
      rawArgs: p.rawArgs,
      isPiped,
      commandHistory: parseZshHistory(this.fs.readFile(`${this.fs.homeDir}/.zsh_history`).content ?? ""),
      snowflakeState: this.snowflakeState,
      snowflakeContext: this.snowflakeContext,
      setSnowflakeState: (state: SnowflakeState) => { this.snowflakeState = state; },
      deliveredPiperIds: this.deliveredPiperIds,
      envVars: this.envVars[this.activeComputer]!,
      setEnvVars: (env: Record<string, string>) => { this.envVars[this.activeComputer] = env; },
      aliases: this.aliases[this.activeComputer]!,
      setAliases: (a: Record<string, string>) => { this.aliases[this.activeComputer] = a; },
      mounts: this.mounts[this.activeComputer],
      setMounts: (m: Mounts) => { this.mounts[this.activeComputer] = m; },
      setCwd: (newCwd: string) => { this.cwd = newCwd; },
    };
  }

  /** Strip `>`/`>>` redirection from the last command of a segment's pipeline. */
  private prepareSegment(seg: ChainSegment) {
    const pipeline = [...seg.pipeline];
    const lastSegment = pipeline[pipeline.length - 1];
    const { command: stripped, redirects, parseError } =
      extractStdoutRedirect(lastSegment.raw);
    if (parseError) {
      return { pipeline, redirects, parseError };
    }
    if (redirects.length > 0) {
      const precheckError = precheckRedirects(redirects, this.cwd, this.fs.homeDir, this.fs);
      if (precheckError) {
        return { pipeline, redirects, parseError: precheckError };
      }
      pipeline[pipeline.length - 1] = parseInput(stripped);
    }
    return { pipeline, redirects, parseError: undefined };
  }

  /** Execute one chain segment's pipeline synchronously. */
  private runSegmentPipelineSync(seg: ChainSegment): { result: CommandResult; lastParsed: ParsedCommand } {
    const { pipeline, redirects, parseError } = this.prepareSegment(seg);
    if (parseError) {
      // The command never runs (zsh opens redirect targets before exec)
      return {
        result: { output: parseError, exitCode: 1 },
        lastParsed: { command: "", args: [], flags: {}, raw: "", rawArgs: [] },
      };
    }

    let stdin: string | undefined; // reset per chain segment
    let lastResult: CommandResult = { output: "" };
    const allTriggerEvents: NonNullable<CommandResult["triggerEvents"]> = [];

    for (let pi = 0; pi < pipeline.length; pi++) {
      const p = pipeline[pi];
      if (!p.command) continue;

      const ctx = this.buildCtx(p, stdin, pi < pipeline.length - 1 || redirects.length > 0);

      if (isAsyncCommand(p.command)) {
        // Async commands (python, dbt, snow) require runAsync() — warn if called synchronously
        lastResult = { output: `${p.command}: use runAsync() for async commands`, exitCode: 1, triggerEvents: [] };
      } else {
        lastResult = execute(p.command, p.args, p.flags, ctx);
      }

      if (lastResult.triggerEvents) {
        allTriggerEvents.push(...lastResult.triggerEvents);
      }

      // Apply FS changes mid-pipeline
      if (lastResult.newFs) {
        this.fs = lastResult.newFs;
      }
      if (lastResult.newMounts) {
        this.mounts[this.activeComputer] = lastResult.newMounts;
      }

      stdin = stripAnsi(lastResult.output);
    }

    if (allTriggerEvents.length > 0) {
      lastResult = { ...lastResult, triggerEvents: allTriggerEvents };
    }

    if (redirects.length > 0) {
      const r = applyRedirection(
        redirects, lastResult,
        this.cwd, this.fs.homeDir, this.fs, this.activeComputer,
      );
      lastResult = r.result;
      this.fs = r.fs;
    }

    return { result: lastResult, lastParsed: pipeline[pipeline.length - 1] };
  }

  /** Execute one chain segment's pipeline, awaiting async commands. */
  private async runSegmentPipelineAsync(seg: ChainSegment): Promise<{ result: CommandResult; lastParsed: ParsedCommand }> {
    const { pipeline, redirects, parseError } = this.prepareSegment(seg);
    if (parseError) {
      // The command never runs (zsh opens redirect targets before exec)
      return {
        result: { output: parseError, exitCode: 1 },
        lastParsed: { command: "", args: [], flags: {}, raw: "", rawArgs: [] },
      };
    }

    let stdin: string | undefined;
    let lastResult: CommandResult = { output: "" };
    const allTriggerEvents: NonNullable<CommandResult["triggerEvents"]> = [];

    for (let pi = 0; pi < pipeline.length; pi++) {
      const p = pipeline[pi];
      if (!p.command) continue;

      const ctx = this.buildCtx(p, stdin, pi < pipeline.length - 1 || redirects.length > 0);

      if (isAsyncCommand(p.command)) {
        lastResult = await executeAsync(p.command, p.args, p.flags, ctx);
      } else {
        lastResult = execute(p.command, p.args, p.flags, ctx);
      }

      if (lastResult.triggerEvents) {
        allTriggerEvents.push(...lastResult.triggerEvents);
      }

      if (lastResult.newFs) {
        this.fs = lastResult.newFs;
      }
      if (lastResult.newMounts) {
        this.mounts[this.activeComputer] = lastResult.newMounts;
      }

      stdin = stripAnsi(lastResult.output);
    }

    if (allTriggerEvents.length > 0) {
      lastResult = { ...lastResult, triggerEvents: allTriggerEvents };
    }

    if (redirects.length > 0) {
      const r = applyRedirection(
        redirects, lastResult,
        this.cwd, this.fs.homeDir, this.fs, this.activeComputer,
      );
      lastResult = r.result;
      this.fs = r.fs;
    }

    return { result: lastResult, lastParsed: pipeline[pipeline.length - 1] };
  }

  /** Merge consecutive chain-segment outputs into one CommandOutput. */
  private mergeOutputs(acc: CommandOutput, next: CommandOutput): CommandOutput {
    return {
      output: [acc.output, next.output].filter(Boolean).join("\n"),
      rawOutput: [acc.rawOutput, next.rawOutput].filter(Boolean).join("\n"),
      exitCode: next.exitCode,
      events: [...acc.events, ...next.events],
      storyFlagUpdates: [...acc.storyFlagUpdates, ...next.storyFlagUpdates],
      newEmails: [...acc.newEmails, ...next.newEmails],
      promptPending: acc.promptPending || next.promptPending,
      sshSessionStarted: acc.sshSessionStarted || next.sshSessionStarted,
    };
  }

  /** Resolve a pending prompt by choosing option N (1-indexed). */
  selectOption(choice: number): CommandOutput {
    if (!this.pendingPrompt) {
      return { ...this.emptyOutput(), output: "No pending prompt.", rawOutput: "No pending prompt." };
    }

    const info = this.pendingPrompt;
    if (choice < 1 || choice > info.options.length) {
      return {
        ...this.emptyOutput(),
        output: `Invalid selection. Please enter 1-${info.options.length}.`,
        rawOutput: `Invalid selection. Please enter 1-${info.options.length}.`,
      };
    }

    const option = info.options[choice - 1];
    this.pendingPrompt = null;

    // Save reply email to sent/ if provided
    if (option.replyEmail) {
      const email = option.replyEmail;
      const filename = `sent_${Date.now()}`;
      const content = [
        `From: ${email.from}`,
        `To: ${email.to}`,
        `Date: ${email.date}`,
        `Subject: ${email.subject}`,
        "",
        email.body,
      ].join("\n");

      const result = this.fs.writeFile(`${getSentDir(this.username)}/${filename}`, content);
      if (result.fs) {
        this.fs = result.fs;
      }
    }

    const rawOutput = option.output ?? colorize("Reply sent.", ansi.green);
    const events: GameEvent[] = [];
    const storyFlagUpdates: Array<{ flag: string; value: string | boolean }> = [];
    const newEmails: string[] = [];

    // Fire trigger events from prompt option
    if (option.triggerEvents) {
      for (const event of option.triggerEvents) {
        events.push(event);

        const delivery = checkEmailDeliveries(
          this.fs,
          event,
          this.deliveredEmailIds,
          this.activeComputer
        );
        if (delivery.newDeliveries.length > 0) {
          this.fs = delivery.fs;
          this.deliveredEmailIds = [...this.deliveredEmailIds, ...delivery.newDeliveries];
          newEmails.push(...delivery.newDeliveries);
        }

        // Wire objective_completed events
        if (event.type === "objective_completed") {
          this.completedObjectives.push(event.detail);
        }
      }
    }

    return {
      output: stripAnsi(rawOutput),
      rawOutput,
      exitCode: 0,
      events,
      storyFlagUpdates,
      newEmails,
      promptPending: false,
      sshSessionStarted: false,
    };
  }

  /** Write a file directly (replaces nano for headless use). */
  writeFile(path: string, content: string): void {
    const absPath = resolvePath(path, this.cwd, this.fs.homeDir);
    const result = this.fs.writeFile(absPath, content);
    if (result.fs) {
      this.fs = result.fs;
    }
  }

  /** Run Python code via child_process. */
  runPython(code: string): string {
    return execSync("python3", { input: code, encoding: "utf-8", timeout: 30000 }).trim();
  }

  /** Switch to a different computer (instant transition). */
  switchComputer(to: ComputerId): void {
    this.activeComputer = to;
    let root;
    switch (to) {
      case "home":
        root = createHomeFilesystem(this.username);
        break;
      case "devcontainer":
        root = createDevcontainerFilesystem(this.username, this.storyFlags);
        break;
      case "chipinfra":
        root = createChipinfraFilesystem(this.username, this.storyFlags);
        break;
      case "erik-pc":
        root = createErikpcFilesystem(this.username);
        break;
      default:
        root = createNexacorpFilesystem(this.username, this.storyFlags);
        break;
    }
    const shellUser = getComputerUsername(to, this.username);
    const homeDir = `/home/${shellUser}`;
    this.fs = new VirtualFS(root, homeDir, homeDir);
    this.cwd = homeDir;
    this.snowflakeState = createInitialSnowflakeState({ includeDay2: !!this.storyFlags.day1_shutdown });
    this.snowflakeContext = createDefaultContext(this.username);
    // First visit only — revisits keep env/aliases set via export/alias,
    // matching gameStore.initComputer (gated on absent computerState entry)
    if (!this.envVars[to]) this.envVars[to] = initEnvForComputer(to, this.username, this.fs);
    if (!this.aliases[to]) this.aliases[to] = initAliasesForComputer(to, this.username, this.fs);
  }

  /** Return a summary of the current game state. */
  status(): string {
    const hostname = COMPUTERS[this.activeComputer].promptHostname;
    const flagCount = Object.keys(this.storyFlags).length;
    const lines = [
      `Computer: ${this.activeComputer} (${hostname})`,
      `CWD: ${this.cwd}`,
      `Username: ${this.username}`,
      `Story flags: ${flagCount} set`,
      `Delivered emails: ${this.deliveredEmailIds.length}`,
      `Completed objectives: ${this.completedObjectives.length}`,
      `Command history: ${this.commandHistory[this.activeComputer].length} commands`,
      `Pending prompt: ${this.pendingPrompt ? "yes" : "no"}`,
    ];
    return lines.join("\n");
  }

  // ── Private ─────────────────────────────────────────────────────────

  private emptyOutput(): CommandOutput {
    return {
      output: "",
      rawOutput: "",
      exitCode: 0,
      events: [],
      storyFlagUpdates: [],
      newEmails: [],
      promptPending: false,
      sshSessionStarted: false,
    };
  }

  /** Compute and apply effects from a command result. */
  private applyEffects(result: CommandResult, parsedCmd: { command: string; args: string[] }): CommandOutput {
    const effects = computeEffects(result, {
      parsedCommand: parsedCmd.command,
      parsedArgs: parsedCmd.args,
      cwd: this.cwd,
      homeDir: this.fs.homeDir,
      activeComputer: this.activeComputer,
      username: this.username,
      deliveredEmailIds: this.deliveredEmailIds,
      deliveredPiperIds: this.deliveredPiperIds,
      storyFlags: this.storyFlags,
      fs: this.fs,
    });

    // Apply FS changes
    if (effects.newFs) {
      this.fs = effects.newFs;
    }
    if (effects.newCwd) {
      this.cwd = effects.newCwd;
    }

    // Apply story flag updates
    for (const update of effects.storyFlagUpdates) {
      this.storyFlags = { ...this.storyFlags, [update.flag]: update.value };
    }

    // Apply email deliveries
    if (effects.newDeliveredEmailIds.length > 0) {
      this.deliveredEmailIds = [...this.deliveredEmailIds, ...effects.newDeliveredEmailIds];
    }

    // Apply piper deliveries
    if (effects.newDeliveredPiperIds.length > 0) {
      this.deliveredPiperIds = [...this.deliveredPiperIds, ...effects.newDeliveredPiperIds];
    }

    // Build output
    let rawOutput = effects.output || "";

    // Handle sessions
    let promptPending = false;
    if (effects.startSession) {
      const sessionOutput = this.handleSessionStart(effects.startSession);
      rawOutput += sessionOutput.text;
      promptPending = sessionOutput.promptPending;
    }

    // Email notifications
    if (effects.emailNotifications > 0) {
      rawOutput += `\n\n${colorize(`You have new mail in /var/mail/${this.username}`, ansi.yellow, ansi.bold)}`;
    }

    return {
      output: stripAnsi(rawOutput),
      rawOutput,
      exitCode: result.exitCode ?? 0,
      events: effects.events,
      storyFlagUpdates: effects.storyFlagUpdates,
      newEmails: effects.newDeliveredEmailIds,
      promptPending,
      sshSessionStarted: effects.startSession?.type === "ssh",
    };
  }

  /** Handle session start requests — store prompts, surface info for editor/snow-sql/python. */
  private handleSessionStart(session: SessionToStart): { text: string; promptPending: boolean } {
    if (session.type === "prompt") {
      this.pendingPrompt = session.info;
      // Include the prompt text and options in output
      const text = "\n" + session.info.promptText;
      return { text, promptPending: true };
    }

    if (session.type === "editor") {
      const { filePath, content, readOnly } = session.info;
      const preview = content.length > 200 ? content.slice(0, 200) + "..." : content;
      const text = `\n[nano would open: ${filePath}${readOnly ? " (read-only)" : ""}]\nContent preview:\n${preview}\nUse :write ${filePath} <content> or runner.writeFile() to edit.`;
      return { text, promptPending: false };
    }

    if (session.type === "snow-sql") {
      return { text: "\n[Snowflake CLI interactive session — use 'dbt' commands or runner.run('snow sql') for queries]", promptPending: false };
    }

    if (session.type === "pythonRepl") {
      return { text: "\n[Python REPL — use :python <code> or runner.runPython() for headless execution]", promptPending: false };
    }

    return { text: "", promptPending: false };
  }
}

// ── REPL ────────────────────────────────────────────────────────────

async function main() {
  const readline = await import("readline");
  const runner = new GameRunner("home");

  console.log("Terminal Turmoil - Headless Runner");
  console.log(`Computer: ${runner.activeComputer} | User: ${runner.username}`);
  console.log("Type :help for REPL commands, :quit to exit\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  function getPrompt(): string {
    const displayCwd = runner.cwd.startsWith(runner.fs.homeDir)
      ? "~" + runner.cwd.slice(runner.fs.homeDir.length)
      : runner.cwd;
    const hostname = COMPUTERS[runner.activeComputer].promptHostname;
    return `${runner.username}@${hostname}:${displayCwd}$ `;
  }

  function printOutput(result: CommandOutput) {
    if (result.rawOutput) {
      console.log(result.rawOutput);
    }
    if (result.newEmails.length > 0) {
      console.log(colorize(`\nYou have new mail in /var/mail/${runner.username}`, ansi.yellow, ansi.bold));
    }
    if (result.promptPending && runner.pendingPrompt) {
      console.log("(Use :select N to choose an option)");
    }
    if (result.sshSessionStarted) {
      console.log("\n[SSH session started! Use :switch nexacorp to continue]");
    }
  }

  function promptUser() {
    rl.question(getPrompt(), async (line: string) => {
      const trimmed = line.trim();

      if (!trimmed) {
        promptUser();
        return;
      }

      // REPL meta-commands
      if (trimmed === ":quit" || trimmed === ":q") {
        rl.close();
        process.exit(0);
      }

      if (trimmed === ":help") {
        console.log([
          "REPL commands:",
          "  :status          — game state summary",
          "  :flags           — all story flags",
          "  :emails          — delivered email IDs",
          "  :objectives      — completed objectives",
          "  :switch home     — switch to home computer",
          "  :switch nexacorp — switch to NexaCorp workstation",
          "  :select N        — resolve pending prompt (choose option N)",
          "  :write PATH TEXT — write file directly (replaces nano)",
          "  :python CODE     — run Python code",
          "  :quit            — exit",
        ].join("\n"));
        promptUser();
        return;
      }

      if (trimmed === ":status") {
        console.log(runner.status());
        promptUser();
        return;
      }

      if (trimmed === ":flags") {
        const flags = runner.storyFlags;
        const keys = Object.keys(flags);
        if (keys.length === 0) {
          console.log("(no story flags set)");
        } else {
          for (const k of keys) {
            console.log(`  ${k}: ${flags[k]}`);
          }
        }
        promptUser();
        return;
      }

      if (trimmed === ":emails") {
        if (runner.deliveredEmailIds.length === 0) {
          console.log("(no emails delivered yet)");
        } else {
          for (const id of runner.deliveredEmailIds) {
            console.log(`  ${id}`);
          }
        }
        promptUser();
        return;
      }

      if (trimmed === ":objectives") {
        if (runner.completedObjectives.length === 0) {
          console.log("(no objectives completed)");
        } else {
          for (const obj of runner.completedObjectives) {
            console.log(`  ${obj}`);
          }
        }
        promptUser();
        return;
      }

      if (trimmed.startsWith(":switch ")) {
        const target = trimmed.slice(8).trim() as ComputerId;
        if (target !== "home" && target !== "nexacorp" && target !== "devcontainer") {
          console.log("Usage: :switch home|nexacorp|devcontainer");
        } else {
          runner.switchComputer(target);
          console.log(`Switched to ${target} (${COMPUTERS[target].promptHostname})`);
        }
        promptUser();
        return;
      }

      if (trimmed.startsWith(":select ")) {
        const n = parseInt(trimmed.slice(8).trim(), 10);
        if (isNaN(n)) {
          console.log("Usage: :select N (where N is the option number)");
        } else {
          const result = runner.selectOption(n);
          printOutput(result);
        }
        promptUser();
        return;
      }

      if (trimmed.startsWith(":write ")) {
        const rest = trimmed.slice(7).trim();
        const spaceIdx = rest.indexOf(" ");
        if (spaceIdx === -1) {
          console.log("Usage: :write PATH CONTENT");
        } else {
          const path = rest.slice(0, spaceIdx);
          const content = rest.slice(spaceIdx + 1);
          runner.writeFile(path, content);
          console.log(`Written to ${path}`);
        }
        promptUser();
        return;
      }

      if (trimmed.startsWith(":python ")) {
        const code = trimmed.slice(8);
        try {
          const out = runner.runPython(code);
          if (out) console.log(out);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`Python error: ${msg}`);
        }
        promptUser();
        return;
      }

      // runAsync handles sync commands too (and aliases may expand to async ones)
      const result = await runner.runAsync(trimmed);
      printOutput(result);

      promptUser();
    });
  }

  promptUser();
}

// Run REPL if executed directly
const isDirectRun = process.argv[1]?.endsWith("play.ts") || process.argv[1]?.includes("play.ts");
if (isDirectRun) {
  main().catch(console.error);
}
