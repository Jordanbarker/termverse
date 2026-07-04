import { CommandHandler, CommandResult, TmuxContext } from "@tt/core/commands/types";
import { register } from "../registry";
import { skipFlagValidation } from "../flagValidation";
import { nextSessionName, formatTmuxLs } from "@tt/core/terminal/tmuxSessions";
import { HELP_TEXTS } from "./helpTexts";

// Real tmux error strings (single client, default socket).
const NESTED = "sessions should be nested with care, unset $TMUX to force";
const NO_SERVER = "no server running on /tmp/tmux-1000/default";

function err(output: string): CommandResult {
  return { output, exitCode: 1 };
}

/** Value of a `-s`/`-t` style option in the raw token list, or null. */
function optValue(tokens: string[], opt: string): string | null {
  const i = tokens.indexOf(opt);
  return i >= 0 && i + 1 < tokens.length ? tokens[i + 1] : null;
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

    case "kill-session": {
      if (!serverRunning(state)) return err(NO_SERVER);
      const explicit = optValue(tokens, "-t");
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

    default:
      return err(`unknown command: ${sub}`);
  }
};

register("tmux", tmux, "Terminal multiplexer", HELP_TEXTS.tmux);
// rawArgs-driven: `-s name` / `-t name` option values are shattered by the
// generic flag parser; the handler re-parses ctx.rawArgs.
skipFlagValidation("tmux");
