import { CommandHandler } from "../types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { HELP_TEXTS } from "./helpTexts";

const aliasCmd: CommandHandler = (_args, _flags, ctx) => {
  // Use rawArgs to preserve quoting (same pattern as export)
  const rawArgs = ctx.rawArgs ?? [];

  if (rawArgs.length === 0) {
    // List all aliases
    const aliases = ctx.aliases ?? {};
    const entries = Object.entries(aliases).sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) return { output: "" };
    return { output: entries.map(([k, v]) => `${k}='${v}'`).join("\n") };
  }

  // Define aliases: alias name='value'
  for (const arg of rawArgs) {
    const eqIdx = arg.indexOf("=");
    if (eqIdx === -1) {
      // Show single alias
      const aliases = ctx.aliases ?? {};
      if (arg in aliases) {
        return { output: `${arg}='${aliases[arg]}'` };
      }
      return { output: `alias: ${arg}: not found`, exitCode: 1 };
    }
    const name = arg.slice(0, eqIdx);
    let value = arg.slice(eqIdx + 1);
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (ctx.aliases !== undefined && ctx.setAliases) {
      ctx.setAliases({ ...ctx.aliases, [name]: value });
    }
  }

  return { output: "" };
};

const unaliasCmd: CommandHandler = (args, flags, ctx) => {
  if (flags.a) {
    // Remove all aliases
    if (ctx.setAliases) {
      ctx.setAliases({});
    }
    return { output: "" };
  }

  if (args.length === 0) {
    return { output: "unalias: not enough arguments", exitCode: 1 };
  }

  const aliases = { ...ctx.aliases };
  for (const name of args) {
    if (!(name in aliases)) {
      return { output: `unalias: no such hash table element: ${name}`, exitCode: 1 };
    }
    delete aliases[name];
  }

  if (ctx.setAliases) {
    ctx.setAliases(aliases);
  }

  return { output: "" };
};

register("alias", aliasCmd, "Define or display aliases", HELP_TEXTS.alias);
setKnownFlags("alias", {});
register("unalias", unaliasCmd, "Remove alias definitions", HELP_TEXTS.unalias);
setKnownFlags("unalias", { short: ["a"] });
