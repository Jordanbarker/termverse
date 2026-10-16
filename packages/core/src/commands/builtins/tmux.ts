import { CommandHandler, CommandResult, TmuxContext } from "@tt/core/commands/types";
import { register } from "../registry";
import { skipFlagValidation } from "../flagValidation";
import { nextSessionName, formatTmuxLs } from "@tt/core/terminal/tmuxSessions";
import { DEFAULT_RESIZE_CELLS } from "@tt/core/terminal/tmuxConfig";
import { HELP_TEXTS } from "./helpTexts";
import { errorResult } from "../fsErrors";

// Real tmux error strings (single client, default socket).
const NESTED = "sessions should be nested with care, unset $TMUX to force";
const NO_SERVER = "no server running on /tmp/tmux-1000/default";

function err(message: string): CommandResult {
  return errorResult(message, 1);
}

/** Value of a `-s`/`-t` style option in the raw token list, or null. */
function optValue(tokens: string[], opt: string): string | null {
  const i = tokens.indexOf(opt);
  return i >= 0 && i + 1 < tokens.length ? tokens[i + 1] : null;
}

/** Non-option arguments after the subcommand (option values like `-t x` dropped). */
function positionals(tokens: string[], sub: string): string[] {
  const out: string[] = [];
  for (let i = tokens.indexOf(sub) + 1; i < tokens.length; i++) {
    if (tokens[i].startsWith("-")) {
      i++; // skip this option's value
      continue;
    }
    out.push(tokens[i]);
  }
  return out;
}

type PaneDir = "L" | "R" | "U" | "D";
const PANE_DIRS: PaneDir[] = ["L", "R", "U", "D"];

/** The `-L`/`-R`/`-U`/`-D` direction flag present in the tokens, or null. */
function dirFlag(tokens: string[]): PaneDir | null {
  return PANE_DIRS.find((d) => tokens.includes(`-${d}`)) ?? null;
}

/**
 * Window id for a `-t` target (null target = the current window). Names win
 * over indexes; `session:window.pane` grammar is deliberately unsupported.
 * Returns null when nothing matches — callers turn that into a tmux error.
 */
function resolveWindow(tmux: TmuxContext, target: string | null): string | null {
  const windows = tmux.windows ?? [];
  if (target === null) return windows.find((w) => w.active)?.id ?? null;
  if (/[:.]/.test(target)) return null;
  const byName = windows.find((w) => w.name === target);
  if (byName) return byName.id;
  if (/^\d+$/.test(target)) return windows.find((w) => w.index === Number(target))?.id ?? null;
  return null;
}

function serverRunning(tmux: TmuxContext): boolean {
  return tmux.attachedSession !== null || tmux.sessions.length > 0;
}

function lastDetached(tmux: TmuxContext): string | null {
  for (let i = tmux.sessions.length - 1; i >= 0; i--) {
    if (!tmux.sessions[i].attached) return tmux.sessions[i].name;
  }
  return null;
}

const tmux: CommandHandler = (args, _flags, ctx) => {
  // Apps without a session lifecycle don't inject ctx.tmux: behave as a
  // permanently attached client (every launch attempt is a nested session).
  const state: TmuxContext = ctx.tmux ?? {
    attachedSession: "0",
    sessions: [{ name: "0", windowCount: 1, createdAt: 0, attached: true }],
  };
  const tokens = ctx.rawArgs ?? args;
  const sub = tokens.find((t) => !t.startsWith("-")) ?? "new-session";

  switch (sub) {
    case "new":
    case "new-session": {
      if (state.attachedSession !== null) return err(NESTED);
      const requested = optValue(tokens, "-s");
      if (requested !== null) {
        if (/[:.]/.test(requested) || requested === "") return err(`bad session name: ${requested}`);
        if (state.sessions.some((s) => s.name === requested)) return err(`duplicate session: ${requested}`);
      }
      const name = requested ?? nextSessionName(state.sessions.map((s) => s.name));
      return { output: "", tmuxAction: { type: "new-session", name } };
    }

    case "ls":
    case "list-sessions": {
      if (!serverRunning(state)) return err(NO_SERVER);
      return { output: formatTmuxLs(state.sessions) };
    }

    case "a":
    case "attach":
    case "attach-session": {
      if (state.attachedSession !== null) return err(NESTED);
      if (!serverRunning(state)) return err(NO_SERVER);
      const target = optValue(tokens, "-t") ?? lastDetached(state);
      if (target === null || !state.sessions.some((s) => s.name === target)) {
        return err(`can't find session: ${target ?? ""}`);
      }
      return { output: "", tmuxAction: { type: "attach", name: target } };
    }

    case "detach":
    case "detach-client": {
      if (!serverRunning(state)) return err(NO_SERVER);
      if (state.attachedSession === null) return err("no current client");
      return { output: "", tmuxAction: { type: "detach" } };
    }

    case "rename":
    case "rename-session": {
      if (!serverRunning(state)) return err(NO_SERVER);
      // Real tmux resolves the target from the current client when -t is
      // omitted, so a detached client MUST pass -t.
      const target = optValue(tokens, "-t") ?? state.attachedSession;
      if (target === null) return err("no current client");
      if (!state.sessions.some((s) => s.name === target)) return err(`can't find session: ${target}`);
      const name = positionals(tokens, sub)[0];
      if (name === undefined) return err("usage: rename-session [-t target-session] new-name");
      if (/[:.]/.test(name) || name === "") return err(`bad session name: ${name}`);
      if (state.sessions.some((s) => s.name === name)) return err(`duplicate session: ${name}`);
      return { output: "", tmuxAction: { type: "rename-session", target, name } };
    }

    case "kill-session": {
      const options = tokens.slice(tokens.indexOf(sub) + 1);
      if (options.length > 0 && (
        options.length !== 2 || options[0] !== "-t" || options[1].startsWith("-")
      )) {
        return err("usage: kill-session [-t target-session]");
      }
      if (!serverRunning(state)) return err(NO_SERVER);
      const explicit = options[1] ?? null;
      const target = explicit ?? state.attachedSession ?? lastDetached(state);
      if (target === null || !state.sessions.some((s) => s.name === target)) {
        return err(`can't find session: ${target ?? ""}`);
      }
      return { output: "", tmuxAction: { type: "kill-session", name: target } };
    }

    case "kill-server": {
      if (!serverRunning(state)) return err(NO_SERVER);
      return { output: "", tmuxAction: { type: "kill-server" } };
    }

    // Window/pane verbs. All of them act on the client's current session, so
    // they need an attached client; pane verbs act on the pane the command was
    // typed in, which is the active one by construction.
    case "neww":
    case "new-window": {
      if (state.attachedSession === null) return err("no current client");
      return { output: "", tmuxAction: { type: "new-window" } };
    }

    case "renamew":
    case "rename-window": {
      if (state.attachedSession === null) return err("no current client");
      const target = optValue(tokens, "-t");
      const windowId = resolveWindow(state, target);
      if (windowId === null) return err(`can't find window: ${target ?? ""}`);
      const name = positionals(tokens, sub)[0];
      if (name === undefined) return err("usage: rename-window [-t target-window] new-name");
      return { output: "", tmuxAction: { type: "rename-window", windowId, name } };
    }

    case "killw":
    case "kill-window": {
      if (state.attachedSession === null) return err("no current client");
      const target = optValue(tokens, "-t");
      const windowId = resolveWindow(state, target);
      if (windowId === null) return err(`can't find window: ${target ?? ""}`);
      return { output: "", tmuxAction: { type: "kill-window", windowId } };
    }

    case "selectw":
    case "select-window": {
      if (state.attachedSession === null) return err("no current client");
      const target = optValue(tokens, "-t");
      if (target === null) return err("usage: select-window -t target-window");
      const windowId = resolveWindow(state, target);
      if (windowId === null) return err(`can't find window: ${target}`);
      return { output: "", tmuxAction: { type: "select-window", windowId } };
    }

    case "splitw":
    case "split-window": {
      if (state.attachedSession === null) return err("no current client");
      return {
        output: "",
        tmuxAction: { type: "split-window", direction: tokens.includes("-h") ? "h" : "v" },
      };
    }

    case "killp":
    case "kill-pane": {
      if (state.attachedSession === null) return err("no current client");
      const target = optValue(tokens, "-t");
      // No pane addressing: the only pane a command can reach is its own.
      if (target !== null) return err(`can't find pane: ${target}`);
      return { output: "", tmuxAction: { type: "kill-pane" } };
    }

    case "selectp":
    case "select-pane": {
      if (state.attachedSession === null) return err("no current client");
      const target = optValue(tokens, "-t");
      if (target !== null) return err(`can't find pane: ${target}`);
      const dir = dirFlag(tokens);
      if (dir === null) return err("usage: select-pane [-LRUD]");
      return { output: "", tmuxAction: { type: "select-pane", dir } };
    }

    case "resizep":
    case "resize-pane": {
      if (state.attachedSession === null) return err("no current client");
      const usage = "usage: resize-pane [-LRUD] [adjustment]";
      const target = optValue(tokens, "-t");
      if (target !== null) return err(`can't find pane: ${target}`);
      const dir = dirFlag(tokens);
      if (dir === null) return err(usage);
      // Direction flags take no value, so `positionals` would eat the
      // adjustment as one — scan for it directly.
      let amount: string | undefined;
      for (let i = tokens.indexOf(sub) + 1; i < tokens.length; i++) {
        const t = tokens[i];
        if (PANE_DIRS.some((d) => t === `-${d}`)) continue;
        if (t.startsWith("-")) {
          i++; // skip this option's value
          continue;
        }
        amount = t;
        break;
      }
      let cells = DEFAULT_RESIZE_CELLS;
      if (amount !== undefined) {
        if (!/^\d+$/.test(amount) || Number(amount) === 0) return err(usage);
        cells = Number(amount);
      }
      return { output: "", tmuxAction: { type: "resize-pane", dir, cells } };
    }

    default:
      return err(`unknown command: ${sub}`);
  }
};

register("tmux", tmux, "Terminal multiplexer", HELP_TEXTS.tmux);
// rawArgs-driven: `-s name` / `-t name` option values are shattered by the
// generic flag parser; the handler re-parses ctx.rawArgs.
skipFlagValidation("tmux");
