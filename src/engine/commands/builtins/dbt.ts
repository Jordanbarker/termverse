import { CommandHandler } from "../types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { HELP_TEXTS } from "./helpTexts";
import {
  runModels,
  runTests,
  runBuild,
  listResources,
  debugProject,
  compileModel,
  showModel,
} from "../../dbt/runner";
import { formatVersion, formatUsage } from "../../dbt/output";

function unexpectedArg(args: string[], max: number): string | null {
  return args.length > max ? `Error: Got unexpected extra argument (${args[max]})` : null;
}

const dbt: CommandHandler = (args, flags, ctx) => {
  const subcommand = args[0];

  // dbt --version (parsed as flag by parser)
  if (flags["version"]) {
    return { output: formatVersion() };
  }

  if (!subcommand) {
    return { output: formatUsage() };
  }

  // --select / -s: parser makes it a boolean flag, model name goes into args
  // e.g. "dbt run --select dim_employees" → args=["run","dim_employees"], flags={select:true}
  // e.g. "dbt run -s dim_employees" → args=["run","dim_employees"], flags={s:true}
  const hasSelect = flags["select"] || flags["s"];
  const selectedModel = hasSelect ? args[1] : undefined;

  switch (subcommand) {
    case "run":
    case "compile":
    case "show":
    case "build": {
      const maxArgs = hasSelect ? 2 : 1;
      const err = unexpectedArg(args, maxArgs);
      if (err) return { output: err };
      if (subcommand === "run") return runModels(ctx, selectedModel);
      if (subcommand === "compile") return compileModel(ctx, selectedModel);
      if (subcommand === "show") return showModel(ctx, selectedModel);
      return runBuild(ctx, selectedModel);
    }

    case "test":
    case "debug": {
      const err = unexpectedArg(args, 1);
      if (err) return { output: err };
      if (subcommand === "test") return runTests(ctx);
      return debugProject(ctx);
    }

    case "ls":
    case "list": {
      const maxArgs = flags["resource-type"] ? 2 : 1;
      const err = unexpectedArg(args, maxArgs);
      if (err) return { output: err };
      const resourceType = flags["resource-type"] ? args[1] : undefined;
      return listResources(ctx, resourceType);
    }

    case "help":
      return { output: HELP_TEXTS.dbt };

    default:
      return { output: `Unknown dbt command '${subcommand}'.\n\n${formatUsage()}` };
  }
};

register("dbt", dbt, "dbt — data build tool for NexaCorp analytics", HELP_TEXTS.dbt);
setKnownFlags("dbt", { short: ["s"], long: ["select", "resource-type", "version"] });
