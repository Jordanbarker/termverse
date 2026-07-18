import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import type { Challenge } from "./types";

const PROJECT_DIR = "/home/player/projects/world-domination";

function setup(base: VirtualFS): VirtualFS {
  // VirtualFS.writeFile has no mkdir-p: create the nested dirs first. The dir
  // is pure flavor (the prompt reads ~/projects/world-domination) — the whole
  // challenge lives in the environment, so nothing is seeded inside it.
  let fs = base;
  for (const dir of ["/home/player/projects", PROJECT_DIR]) {
    const mk = fs.makeDirectory(dir);
    if (!mk.fs) throw new Error(mk.error ?? `env-export: mkdir ${dir} failed`);
    fs = mk.fs;
  }
  return fs;
}

export const envExport: Challenge = {
  id: "env-export",
  title: "Configure the environment",
  type: "fs",
  startCwd: PROJECT_DIR,
  // Step 2 is "remove this" — the var must exist first, so it's seeded at load
  // (and re-merged on Settings saves so it can't vanish without an unset).
  initialEnv: { SAFEGUARDS: "on" },
  // `env` resolves to the primary `printenv`, so it's covered by this list.
  commands: ["export", "unset", "printenv", "ls", "cd"],
  brief:
    "world-domination refuses to launch: it reads its config from the " +
    "environment, and right now ENV isn't \"prod\" and the SAFEGUARDS " +
    "variable is still set. Fix both.",
  setup,
  steps: [
    {
      instruction: "Set ENV to prod in your environment.",
      hint:
        "export makes a variable part of your environment: export NAME=value. " +
        "Check it took with printenv ENV.",
      command: "export ENV=prod",
      isComplete: (s) => s.envVars.ENV === "prod",
    },
    {
      instruction: "Remove the SAFEGUARDS variable from your environment.",
      hint:
        "unset is the opposite of export: it deletes a variable entirely. " +
        "printenv SAFEGUARDS printing nothing means it's gone.",
      command: "unset SAFEGUARDS",
      // Removed means absent, not empty: export SAFEGUARDS= leaves the key set.
      isComplete: (s) => !("SAFEGUARDS" in s.envVars),
    },
  ],
};
