import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import type { Challenge } from "./types";

const LOG_PATH = "/home/player/war-and-peace.log";
// Shell-safe passphrase: lowercase + digits + hyphens only, so `mkdir <token>`
// is a single argument (no quoting). Deliberately long/mixed enough that
// retyping from a scrolled-off buffer is error-prone — that's what motivates
// copy-mode yank over re-typing.
const TOKEN = "moonlit-cipher-7f3c91a0e5";
const TARGET_DIR = `/home/player/${TOKEN}`;

// A wall of public-domain prose (War & Peace, Tolstoy) with the passphrase
// buried alone on a line near the top. `cat` dumps the whole thing, pushing the
// token above the viewport — the player must enter copy mode to scroll back up,
// select it, and yank it. The token sits on its own line so `v` + `$` yanks
// exactly the passphrase with no surrounding words.
const LOG_BODY = `"Well, Prince, so Genoa and Lucca are now just family estates of the
Buonapartes. But I warn you, if you don't tell me that this means war,
if you still try to defend the infamies and horrors perpetrated by that
Antichrist — I really believe he is Antichrist — I will have nothing
more to do with you and you are no longer my friend."

Anna Pavlovna had had a cough for some days. She was, as she said,
suffering from la grippe; grippe being then a new word in St. Petersburg,
used only by the elite.

${TOKEN}

All her invitations without exception, written in French, and delivered
by a scarlet-liveried footman that morning, ran as follows:

"If you have nothing better to do, Count (or Prince), and if the prospect
of spending an evening with a poor invalid is not too terrible, I shall
be very charmed to see you tonight between 7 and 10 — Annette Scherer."

"Heavens! what a virulent attack!" replied the prince, not in the least
disconcerted by this reception. He had just entered, wearing an
embroidered court uniform, knee breeches, and shoes, and had stars on
his breast and a serene expression on his flat face. He spoke in that
refined French in which our grandfathers not only spoke but thought,
and with the gentle, patronizing intonation natural to a man of
importance who had grown old in society and at court.

He went up to Anna Pavlovna, kissed her hand, presenting to her his
bald, scented, and shining head, and complacently seated himself on
the sofa. "First of all, dear friend, tell me how you are. Set your
friend's mind at rest," said he without altering his tone, beneath the
politeness and affected sympathy of which indifference and even irony
could be discerned.
`;

/**
 * Seed a long log file with a passphrase buried near the top. The player runs
 * `cat war-and-peace.log`, enters tmux copy mode (<prefix> then `[`), scrolls
 * back to the passphrase, yanks it, and pastes it into `mkdir <token>`.
 *
 * buildBaseFs() already provides /home/player, so a single writeFile suffices.
 */
function setup(base: VirtualFS): VirtualFS {
  const wr = base.writeFile(LOG_PATH, LOG_BODY);
  if (!wr.fs) throw new Error(wr.error ?? `copy-mode-yank: write ${LOG_PATH} failed`);
  return wr.fs;
}

export const copyModeYank: Challenge = {
  id: "copy-mode-yank",
  title: "Copy Mode",
  // A tmux skill (copy-mode scrollback yank), so it lives in the Tmux track —
  // even though win-detection reads the filesystem. The fs-tree readout still
  // renders because `fsWatchPath` is set (ChallengePanel gates that view on the
  // field, not the type).
  type: "tmux",
  fsWatchPath: "/home/player",
  // Copy mode is entered with the keyboard (<prefix> [), independent of this
  // allowlist; these are the commands the player types to read the log and
  // spend the recovered token.
  commands: ["cat", "mkdir", "ls", "cd", "pwd"],
  brief:
    "A passphrase is buried somewhere inside war-and-peace.log. Print the file, then rescue " +
    "the passphrase from the scrollback and create a directory named exactly after it. It's " +
    "long and easy to mistype, so copying beats retyping.",
  setup,
  steps: [
    {
      // Reading the log and the copy-mode yank are read-only — not observable in
      // the fs snapshot — so the only completable state is the resulting mkdir.
      // Copy mode is guided entirely through the hint below.
      instruction:
        "Recover the passphrase from war-and-peace.log's scrollback and create a directory named exactly after it.",
      hint:
        "Print it with `cat war-and-peace.log` — the passphrase scrolls off the top.\n" +
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
