import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { isDirectory } from "@tt/core/filesystem/types";
import type { Challenge } from "./types";

const RELEASES_DIR = "/home/player/releases";
const TARGET_DIR = `${RELEASES_DIR}/v2`;

function setup(base: VirtualFS): VirtualFS {
  const mk = base.makeDirectory(RELEASES_DIR);
  if (!mk.fs) throw new Error(mk.error ?? `alias-shortcut: mkdir ${RELEASES_DIR} failed`);
  return mk.fs;
}

export const aliasShortcut: Challenge = {
  id: "alias-shortcut",
  title: "One-word release",
  type: "fs",
  fsWatchPath: RELEASES_DIR,
  commands: ["alias", "unalias", "mkdir", "ls", "cd"],
  brief:
    "You keep retyping the same long release command. Wrap it in a one-word " +
    "alias, use it to cut the release, then clean the alias up.",
  setup,
  steps: [
    {
      instruction: "Create an alias named ship that runs: mkdir -p ~/releases/v2",
      hint:
        "The syntax is alias name='command' (quotes keep the spaces together). " +
        "Bare alias lists everything currently defined.",
      command: "alias ship='mkdir -p ~/releases/v2'",
      // Loose match on the body: any mkdir-based spelling of the release
      // command counts; step 2 verifies it actually produces the directory.
      isComplete: (s) => (s.aliases.ship ?? "").includes("mkdir"),
    },
    {
      instruction: "Run your new shortcut to create the release directory.",
      hint: "An alias runs like any command — just type its name.",
      command: "ship",
      isComplete: (s) => {
        const node = s.fs.getNode(TARGET_DIR);
        return node !== null && isDirectory(node);
      },
    },
    {
      // Trivially true at load, but the cascade only reaches it after step 2
      // passes — and at that moment `ship` still exists, so order holds.
      instruction: "The release is cut — remove the ship alias.",
      hint: "unalias takes the alias name; bare alias confirms it's gone.",
      command: "unalias ship",
      isComplete: (s) => !("ship" in s.aliases),
    },
  ],
};
