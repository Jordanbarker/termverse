import { CommandHandler } from "../types";
import { register } from "../registry";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { HELP_TEXTS } from "./helpTexts";

const cd: CommandHandler = (args, _flags, ctx) => {
  const target = args[0] || "~";

  // `cd -` switches to OLDPWD and prints the destination (zsh/bash behavior).
  let absolutePath: string;
  let printDestination = false;
  if (target === "-") {
    const oldpwd = ctx.envVars?.OLDPWD;
    if (!oldpwd) {
      return { output: "cd: OLDPWD not set", exitCode: 1 };
    }
    absolutePath = oldpwd;
    printDestination = true;
  } else {
    absolutePath = resolvePath(target, ctx.cwd, ctx.homeDir);
  }

  const result = ctx.fs.changeCwd(absolutePath);
  if (result.error) {
    return { output: result.error, exitCode: 1 };
  }

  // Track OLDPWD on every successful cd so subsequent `cd -` works.
  if (ctx.envVars && ctx.setEnvVars) {
    ctx.setEnvVars({ ...ctx.envVars, OLDPWD: ctx.cwd });
  }

  return {
    output: printDestination ? absolutePath : "",
    newCwd: absolutePath,
    triggerEvents: [{ type: "directory_visit" as const, detail: absolutePath }],
  };
};

register("cd", cd, "Change the current directory", HELP_TEXTS.cd);
