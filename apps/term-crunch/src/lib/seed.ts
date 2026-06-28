import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { dir, file } from "@tt/core/filesystem/builders";
import { HOME_DIR } from "./machine";

/**
 * Fresh minimal filesystem for a challenge session: just /home/player with an empty
 * `.zsh_history` (so up-arrow recall has a file to parse). Challenge `setup`
 * functions add whatever else they need (e.g. a git repo) on top of this.
 *
 * NOTE: VirtualFS.writeFile has no mkdir-p, so a challenge setup must create
 * parent directories (makeDirectory) before writing files into them.
 */
export function buildBaseFs(): VirtualFS {
  const root = dir("/", {
    home: dir("home", {
      player: dir("player", {
        ".zsh_history": file(".zsh_history", ""),
      }),
    }),
  });
  return new VirtualFS(root, HOME_DIR, HOME_DIR);
}

/**
 * Write the player's `~/.zshrc` and `~/.tmux.conf` (from Settings) into `fs` and
 * return the updated VirtualFS. `/home/player` already exists from buildBaseFs,
 * so no makeDirectory is needed. Called on every challenge load so the configs
 * survive the per-challenge fs reseed.
 */
export function applyConfigs(fs: VirtualFS, zshrc: string, tmuxConf: string): VirtualFS {
  let out = fs;
  const z = out.writeFile(`${HOME_DIR}/.zshrc`, zshrc);
  if (z.fs) out = z.fs;
  const t = out.writeFile(`${HOME_DIR}/.tmux.conf`, tmuxConf);
  if (t.fs) out = t.fs;
  return out;
}
