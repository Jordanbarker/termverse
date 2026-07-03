import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import type { Challenge } from "./types";

const LOG_PATH = "/home/player/passphrase.log";
const TOKEN = "moonlit-cipher-7f3c91a0e5";
const TARGET_DIR = `/home/player/${TOKEN}`;
// alt idea: https://en.wikisource.org/wiki/Frankenstein,_or_the_Modern_Prometheus_(First_Edition,_1818)/Volume_2/Chapter_9
const LOG_BODY = `
FREEZING
FREEZING
FREEZING
FREEZING
FREEZING

COLDER
COLDER
COLDER
COLDER
COLDER

COLD
COLD
COLD
COLD
COLD

WARM
WARM
WARM
WARM
WARM

WARMER
WARMER
WARMER
WARMER
WARMER

HOT 
HOT 
HOT 
HOT 
HOT 

HOT HOT HOT 
HOT HOT HOT 
HOT HOT HOT 
HOT HOT HOT 

BURNING
BURNING
BURNING
BURNING
BURNING

--------

${TOKEN}

--------

BURNING
BURNING
BURNING
BURNING
BURNING
BURNING

HOT HOT HOT 
HOT HOT HOT 
HOT HOT HOT 
HOT HOT HOT 
HOT HOT HOT 

HOT
HOT
HOT
HOT
HOT

WARMER
WARMER
WARMER
WARMER
WARMER

WARM
WARM
WARM
WARM
WARM

COLD
COLD
COLD
COLD
COLD

COLDER
COLDER
COLDER
COLDER
COLDER

FREEZING
FREEZING
FREEZING
FREEZING
FREEZING
`;

function setup(base: VirtualFS): VirtualFS {
  const wr = base.writeFile(LOG_PATH, LOG_BODY);
  if (!wr.fs) throw new Error(wr.error ?? `copy-mode-yank: write ${LOG_PATH} failed`);
  return wr.fs;
}

export const copyModeYank: Challenge = {
  id: "copy-mode-yank",
  title: "Copy Mode",
  type: "tmux",
  fsWatchPath: "/home/player",
  // Copy mode is entered with the keyboard (<prefix> [), independent of this
  // allowlist; these are the commands the player types to read the log and
  // spend the recovered token.
  commands: ["cat", "mkdir", "ls", "cd", "pwd", "less"],
  brief:
    "A passphrase is buried somewhere inside passphrase.log. Print the file, then rescue " +
    "the passphrase from the scrollback and create a directory named exactly after it. It's " +
    "long and easy to mistype, so copying beats retyping.",
  setup,
  steps: [
    {
      // Reading the log and the copy-mode yank are read-only — not observable in
      // the fs snapshot — so the only completable state is the resulting mkdir.
      // The brief states the whole objective (no per-step instruction); copy
      // mode is guided entirely through the hint below.
      hint:
        "Print it with `cat passphrase.log` — the passphrase scrolls off the top.\n" +
        "Enter tmux copy mode with your prefix (Ctrl+Space) then `[`.\n" +
        "• Move: hjkl or arrows · g / G jump to top / bottom · Ctrl+U / Ctrl+D half-page.\n" +
        "• Select: `v` starts a selection, `$` extends to end of line.\n" +
        "• Yank: `y` copies the selection to the clipboard and exits copy mode.\n" +
        "Then type `mkdir ` and paste the passphrase.",
      command: `mkdir ${TOKEN}`,
      // Passes exactly when a directory named after the token exists. VirtualFS
      // directory nodes carry type: "directory".
      isComplete: (s) => s.fs.getNode(TARGET_DIR)?.type === "directory",
    },
  ],
};
