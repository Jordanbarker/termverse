import { CommandHandler } from "@tt/core/commands/types";
import { register, registerAlias } from "../registry";
import { HELP_TEXTS } from "./helpTexts";

const printenv: CommandHandler = (args, _flags, ctx) => {
  const env: Record<string, string> = { ...ctx.envVars, PWD: ctx.cwd };

  if (args.length === 0) {
    // Output all vars sorted by key
    const lines = Object.entries(env)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`);
    return { output: lines.join("\n") };
  }

  // Look up specific vars
  const outputs: string[] = [];
  let exitCode = 0;
  for (const name of args) {
    if (name in env) {
      outputs.push(env[name]);
    } else {
      exitCode = 1;
    }
  }

  return { output: outputs.join("\n"), exitCode };
};

register("printenv", printenv, "Print environment variables", HELP_TEXTS.printenv);
registerAlias("env", "printenv");
