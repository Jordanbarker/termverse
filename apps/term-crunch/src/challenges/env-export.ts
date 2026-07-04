import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import type { Challenge } from "./types";

const PROJECT_DIR = "/home/player/projects/crunchd";
// The literal token seeded in token.txt; step 2 compares the exported value
// against it exactly (export strips surrounding quotes, so either quoting
// style the player types passes).
export const CRUNCH_TOKEN = "crunch-7f3a91";

const README =
  "crunchd — the crunch build daemon\n" +
  "\n" +
  "crunchd reads its configuration from the environment:\n" +
  "\n" +
  "  BUILD_MODE     build profile (debug | release)\n" +
  "  CRUNCH_TOKEN   deploy token (see token.txt)\n" +
  "\n" +
  "It refuses to start until both are set.\n";

function setup(base: VirtualFS): VirtualFS {
  // VirtualFS.writeFile has no mkdir-p: create the nested dirs first.
  let fs = base;
  for (const dir of ["/home/player/projects", PROJECT_DIR]) {
    const mk = fs.makeDirectory(dir);
    if (!mk.fs) throw new Error(mk.error ?? `env-export: mkdir ${dir} failed`);
    fs = mk.fs;
  }
  for (const [name, content] of [
    ["README", README],
    ["token.txt", `${CRUNCH_TOKEN}\n`],
  ] as const) {
    const wr = fs.writeFile(`${PROJECT_DIR}/${name}`, content);
    if (!wr.fs) throw new Error(wr.error ?? `env-export: write ${name} failed`);
    fs = wr.fs;
  }
  return fs;
}

export const envExport: Challenge = {
  id: "env-export",
  title: "Configure the environment",
  type: "fs",
  fsWatchPath: PROJECT_DIR,
  // `env` resolves to the primary `printenv`, so it's covered by this list.
  commands: ["export", "printenv", "cat", "ls", "cd"],
  brief:
    "The crunchd build tool in ~/projects/crunchd won't start until its two " +
    "environment variables are set. Its README explains what it needs.",
  setup,
  steps: [
    {
      instruction: "Set BUILD_MODE to release in your environment.",
      hint:
        "export makes a variable part of your environment: export NAME=value. " +
        "Check it took with printenv BUILD_MODE.",
      command: "export BUILD_MODE=release",
      isComplete: (s) => s.envVars.BUILD_MODE === "release",
    },
    {
      instruction: "Set CRUNCH_TOKEN to the deploy token stored in token.txt.",
      hint:
        "Read token.txt to find the value, then export it. printenv with no " +
        "arguments lists every variable so you can confirm both are set.",
      command: `cat token.txt\nexport CRUNCH_TOKEN=${CRUNCH_TOKEN}`,
      isComplete: (s) => s.envVars.CRUNCH_TOKEN === CRUNCH_TOKEN,
    },
  ],
};
