import { describe, it, expect, beforeEach } from "vitest";
import "@tt/core/commands/builtins"; // register builtins so the registry is populated
import { parseTmuxPrefix, parseTmuxBindings } from "@tt/core/terminal/tmuxConfig";
import { useGameStore } from "../state/gameStore";
import { HOME_DIR } from "../lib/machine";
import { DEFAULT_ZSHRC, DEFAULT_TMUX_CONF } from "../lib/defaultConfigs";

const ZSHRC_PATH = `${HOME_DIR}/.zshrc`;
const TMUX_PATH = `${HOME_DIR}/.tmux.conf`;

describe("settings: dotfiles seeded into each challenge fs", () => {
  beforeEach(() => {
    useGameStore.setState({ activeCategory: "all", zshrc: DEFAULT_ZSHRC, tmuxConf: DEFAULT_TMUX_CONF });
    useGameStore.getState().loadChallenge(0);
  });

  it("writes ~/.zshrc and ~/.tmux.conf into the fs and activates the zshrc", () => {
    const s = useGameStore.getState();
    expect(s.fs.readFile(ZSHRC_PATH).content).toBe(DEFAULT_ZSHRC);
    expect(s.fs.readFile(TMUX_PATH).content).toBe(DEFAULT_TMUX_CONF);
    // zshrc aliases + exports are parsed into the live session.
    expect(s.aliases.gs).toBe("git status");
    expect(s.aliases.ll).toBe("ls -la");
    expect(s.envVars.EDITOR).toBe("nano");
  });

  it("re-seeds the dotfiles after a subsequent loadChallenge", () => {
    useGameStore.getState().loadChallenge(1);
    const s = useGameStore.getState();
    expect(s.fs.readFile(ZSHRC_PATH).content).toBe(DEFAULT_ZSHRC);
    expect(s.fs.readFile(TMUX_PATH).content).toBe(DEFAULT_TMUX_CONF);
  });
});

describe("settings: setConfigs applies live and persists across challenges", () => {
  beforeEach(() => {
    useGameStore.setState({ activeCategory: "all", zshrc: DEFAULT_ZSHRC, tmuxConf: DEFAULT_TMUX_CONF });
    useGameStore.getState().loadChallenge(0);
  });

  it("updates the fs + re-derives aliases/env without a challenge reset", () => {
    const customZ = "alias gp='git push'\nexport PAGER=less\n";
    const customT = "set -g prefix C-a\n";
    useGameStore.getState().setConfigs(customZ, customT);

    const s = useGameStore.getState();
    expect(s.zshrc).toBe(customZ);
    expect(s.fs.readFile(ZSHRC_PATH).content).toBe(customZ);
    expect(s.fs.readFile(TMUX_PATH).content).toBe(customT);
    expect(s.aliases.gp).toBe("git push");
    expect(s.aliases.gs).toBeUndefined(); // old default alias dropped
    expect(s.envVars.PAGER).toBe("less");
  });

  it("carries saved configs into the next challenge's fresh fs", () => {
    const customZ = "alias gp='git push'\n";
    const customT = "set -g prefix C-b\n";
    useGameStore.getState().setConfigs(customZ, customT);
    useGameStore.getState().loadChallenge(1);

    const s = useGameStore.getState();
    expect(s.fs.readFile(ZSHRC_PATH).content).toBe(customZ);
    expect(s.fs.readFile(TMUX_PATH).content).toBe(customT);
    expect(s.aliases.gp).toBe("git push");
  });

  it("resetConfigs restores the defaults", () => {
    useGameStore.getState().setConfigs("alias x='y'\n", "set -g prefix C-x\n");
    useGameStore.getState().resetConfigs();
    const s = useGameStore.getState();
    expect(s.zshrc).toBe(DEFAULT_ZSHRC);
    expect(s.tmuxConf).toBe(DEFAULT_TMUX_CONF);
  });
});

describe("settings: default tmux.conf parses to the expected prefix + binds", () => {
  it("keeps Ctrl+Space as the prefix and ships vim focus/resize binds", () => {
    expect(parseTmuxPrefix(DEFAULT_TMUX_CONF)).toEqual({ char: "\x00", label: "Ctrl+Space" });

    const binds = parseTmuxBindings(DEFAULT_TMUX_CONF);
    expect(binds.h).toEqual({ kind: "focus", dir: "L" });
    expect(binds.l).toEqual({ kind: "focus", dir: "R" });
    expect(binds.H).toEqual({ kind: "resize", dir: "L", cells: 5, repeat: true });
    expect(binds.J).toEqual({ kind: "resize", dir: "D", cells: 5, repeat: true });
  });
});
