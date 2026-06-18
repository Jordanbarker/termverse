import { CommandHandler } from "../types";
import { register, registerAlias } from "../registry";
import { resolvePath } from "../../../lib/pathUtils";
import { parseEnvAssignments, parseAliases } from "../../terminal/envParse";
import { GameEvent } from "../../mail/delivery";
import { HELP_TEXTS } from "./helpTexts";

const source: CommandHandler = (args, _flags, ctx) => {
  if (args.length === 0) {
    return { output: "source: filename argument required", exitCode: 2 };
  }

  const filePath = resolvePath(args[0], ctx.cwd, ctx.homeDir);
  const result = ctx.fs.readFile(filePath);

  if (result.error) {
    return { output: `source: ${args[0]}: No such file or directory`, exitCode: 1 };
  }

  // Parse env assignments from the sourced file and merge into env
  const content = result.content ?? "";
  const newVars = parseEnvAssignments(content);
  if (Object.keys(newVars).length > 0 && ctx.envVars && ctx.setEnvVars) {
    ctx.setEnvVars({ ...ctx.envVars, ...newVars });
  }

  // Parse aliases from the sourced file and merge
  const newAliases = parseAliases(content);
  if (Object.keys(newAliases).length > 0 && ctx.aliases !== undefined && ctx.setAliases) {
    ctx.setAliases({ ...ctx.aliases, ...newAliases });
  }

  // Real `source` produces no output — silently succeed and trigger file_read
  const events: GameEvent[] = [{ type: "file_read", detail: filePath }];

  // Emit sourced_zshrc event so story flags can distinguish source from cat
  if (filePath.endsWith("/.zshrc")) {
    events.push({ type: "command_executed", detail: "sourced_zshrc" });
  }

  return { output: "", triggerEvents: events };
};

const description = "Execute commands from a file in the current shell";
register("source", source, description, HELP_TEXTS.source, true);
registerAlias(".", "source");
