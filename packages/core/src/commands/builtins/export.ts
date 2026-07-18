import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { GameEvent } from "@tt/core";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { HELP_TEXTS } from "./helpTexts";

const ERIK_AGENT_SOCKET = "/tmp/ssh-mZ4xPq/agent.18472";

const exportCmd: CommandHandler = (args, _flags, ctx) => {
  if (args.length === 0) {
    // List all exported vars (same as printenv)
    const env: Record<string, string> = { ...ctx.envVars, PWD: ctx.cwd };
    const lines = Object.entries(env)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `declare -x ${k}="${v}"`);
    return { output: lines.join("\n") };
  }

  const events: GameEvent[] = [];

  // Parse VAR=VALUE assignments
  for (const arg of args) {
    const eqIdx = arg.indexOf("=");
    if (eqIdx === -1) {
      // Plain `export VAR` — no-op, silently succeed
      continue;
    }
    const key = arg.slice(0, eqIdx);
    let value = arg.slice(eqIdx + 1);
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (ctx.envVars && ctx.setEnvVars) {
      ctx.setEnvVars({ ...ctx.envVars, [key]: value });
    }
    if (key === "CHIP_API_KEY" && value === "nxa_live_7f3k9m2x") {
      events.push({ type: "command_executed", detail: "exported_chip_api_key" });
    }
    if (key === "SSH_AUTH_SOCK") {
      // Compare the path the kernel would actually connect to, so relative
      // forms (`agent.18472` from `/tmp/ssh-mZ4xPq`) trigger the same flag.
      const resolved = resolvePath(value, ctx.cwd, ctx.homeDir);
      if (resolved === ERIK_AGENT_SOCKET) {
        events.push({ type: "command_executed", detail: "exported_erik_ssh_auth_sock" });
      }
    }
  }

  return { output: "", triggerEvents: events.length ? events : undefined };
};

const unsetCmd: CommandHandler = (args, _flags, ctx) => {
  if (args.length === 0) {
    return { output: "unset: not enough arguments", exitCode: 1 };
  }
  // zsh: unsetting a variable that isn't set is not an error.
  if (ctx.envVars && ctx.setEnvVars) {
    const next = { ...ctx.envVars };
    for (const name of args) delete next[name];
    ctx.setEnvVars(next);
  }
  return { output: "" };
};

register("export", exportCmd, "Set environment variables", HELP_TEXTS.export);
register("unset", unsetCmd, "Remove environment variables", HELP_TEXTS.unset);
