import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { dir, file } from "@tt/core/filesystem/builders";
import { HOME_DIR } from "./machine";

/**
 * Fresh minimal filesystem for a puzzle session: just /home/player with an empty
 * `.zsh_history` (so up-arrow recall has a file to parse). Challenge `setup`
 * functions add whatever else they need (e.g. a git repo) on top of this.
 *
 * NOTE: VirtualFS.writeFile has no mkdir-p, so a challenge setup must create
 * parent directories (makeDirectory) before writing files into them.
 */
export function buildPuzzleFs(): VirtualFS {
  const root = dir("/", {
    home: dir("home", {
      player: dir("player", {
        ".zsh_history": file(".zsh_history", ""),
      }),
    }),
  });
  return new VirtualFS(root, HOME_DIR, HOME_DIR);
}
