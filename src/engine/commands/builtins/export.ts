import { CommandHandler } from "../types";
import { register } from "../registry";
import { GameEvent } from "../../mail/delivery";
import { HELP_TEXTS } from "./helpTexts";

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
  }

  return { output: "", triggerEvents: events.length ? events : undefined };
};

register("export", exportCmd, "Set environment variables", HELP_TEXTS.export);
