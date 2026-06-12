import { describe, it, expect } from "vitest";
import { isCommandAvailable, HOME_COMMANDS } from "../availability";

describe("isCommandAvailable", () => {
  describe("home computer", () => {
    it("allows all ungated home commands from the start", () => {
      for (const cmd of HOME_COMMANDS) {
        // Gated commands — handled by their own dedicated tests below.
        if (cmd === "pdftotext" || cmd === "tree") continue;
        if (cmd === "lsblk" || cmd === "mount" || cmd === "umount") continue;
        expect(isCommandAvailable(cmd, "home")).toBe(true);
        expect(isCommandAvailable(cmd, "home", {})).toBe(true);
      }
    });

    it("blocks ssh without ssh_unlocked flag", () => {
      expect(isCommandAvailable("ssh", "home")).toBe(false);
      expect(isCommandAvailable("ssh", "home", {})).toBe(false);
      expect(isCommandAvailable("ssh", "home", { ssh_unlocked: true })).toBe(true);
    });

    it("blocks sudo and apt without apt_unlocked flag", () => {
      expect(isCommandAvailable("sudo", "home")).toBe(false);
      expect(isCommandAvailable("sudo", "home", {})).toBe(false);
      expect(isCommandAvailable("apt", "home")).toBe(false);
      expect(isCommandAvailable("apt", "home", {})).toBe(false);
      expect(isCommandAvailable("sudo", "home", { apt_unlocked: true })).toBe(true);
      expect(isCommandAvailable("apt", "home", { apt_unlocked: true })).toBe(true);
    });

    it("blocks pdftotext without pdftotext_unlocked flag", () => {
      expect(isCommandAvailable("pdftotext", "home")).toBe(false);
      expect(isCommandAvailable("pdftotext", "home", {})).toBe(false);
      expect(isCommandAvailable("pdftotext", "home", { pdftotext_unlocked: true })).toBe(true);
    });

    it("blocks tree without tree_installed flag", () => {
      expect(isCommandAvailable("tree", "home")).toBe(false);
      expect(isCommandAvailable("tree", "home", {})).toBe(false);
      expect(isCommandAvailable("tree", "home", { tree_installed: true })).toBe(true);
    });

    it("allows python on home computer", () => {
      expect(isCommandAvailable("python", "home")).toBe(true);
    });

    it("blocks basic tools without basic_tools_unlocked flag", () => {
      const basicTools = ["mkdir", "rm", "mv", "cp", "touch", "echo", "whoami", "hostname", "date", "which", "file"];
      for (const cmd of basicTools) {
        expect(isCommandAvailable(cmd, "home")).toBe(false);
        expect(isCommandAvailable(cmd, "home", {})).toBe(false);
      }
    });

    it("unlocks basic tools with basic_tools_unlocked flag", () => {
      const basicTools = ["mkdir", "rm", "mv", "cp", "touch", "echo", "whoami", "hostname", "date", "which", "file"];
      for (const cmd of basicTools) {
        expect(isCommandAvailable(cmd, "home", { basic_tools_unlocked: true })).toBe(true);
      }
    });

    it("allows man on home from the start (manual is the discovery command)", () => {
      expect(isCommandAvailable("man", "home")).toBe(true);
      expect(isCommandAvailable("man", "home", {})).toBe(true);
    });

    it("blocks commands not in the home set and not unlocked via NexaCorp", () => {
      const blocked = ["grep", "find", "diff", "wc", "chmod"];
      for (const cmd of blocked) {
        expect(isCommandAvailable(cmd, "home")).toBe(false);
      }
    });

    it("unlocks power tools on home with returned_home_day1 flag", () => {
      const flags = { returned_home_day1: true };
      expect(isCommandAvailable("grep", "home", flags)).toBe(true);
      expect(isCommandAvailable("find", "home", flags)).toBe(true);
      expect(isCommandAvailable("diff", "home", flags)).toBe(true);
      expect(isCommandAvailable("head", "home", flags)).toBe(true);
      expect(isCommandAvailable("tail", "home", flags)).toBe(true);
      expect(isCommandAvailable("wc", "home", flags)).toBe(true);
      expect(isCommandAvailable("sort", "home", flags)).toBe(true);
      expect(isCommandAvailable("uniq", "home", flags)).toBe(true);
    });

    it("blocks devcontainer-only commands on home", () => {
      expect(isCommandAvailable("git", "home")).toBe(false);
      expect(isCommandAvailable("snow", "home")).toBe(false);
      expect(isCommandAvailable("dbt", "home")).toBe(false);
      // Even with all flags
      expect(isCommandAvailable("git", "home", { devcontainer_visited: true })).toBe(false);
      expect(isCommandAvailable("snow", "home", { devcontainer_visited: true })).toBe(false);
      expect(isCommandAvailable("dbt", "home", { devcontainer_visited: true })).toBe(false);
    });

    it("does not unlock power tools on home without returned_home_day1 flag", () => {
      expect(isCommandAvailable("grep", "home", {})).toBe(false);
      expect(isCommandAvailable("head", "home", {})).toBe(false);
      expect(isCommandAvailable("sort", "home", {})).toBe(false);
    });
  });

  describe("nexacorp computer", () => {
    it("allows base commands without any flags", () => {
      const baseCmds = ["ls", "cd", "cat", "pwd", "mkdir", "rm", "mv", "cp", "touch", "echo", "nano", "mail", "clear", "help", "history", "whoami", "hostname", "date", "which", "man", "file", "save", "load", "newgame", "ssh"];
      for (const cmd of baseCmds) {
        expect(isCommandAvailable(cmd, "nexacorp")).toBe(true);
      }
    });

    it("blocks gated commands without flags", () => {
      expect(isCommandAvailable("grep", "nexacorp")).toBe(false);
      expect(isCommandAvailable("find", "nexacorp")).toBe(false);
      expect(isCommandAvailable("diff", "nexacorp")).toBe(false);
      expect(isCommandAvailable("head", "nexacorp")).toBe(false);
      expect(isCommandAvailable("tail", "nexacorp")).toBe(false);
      expect(isCommandAvailable("wc", "nexacorp")).toBe(false);
      expect(isCommandAvailable("sort", "nexacorp")).toBe(false);
      expect(isCommandAvailable("uniq", "nexacorp")).toBe(false);
      expect(isCommandAvailable("coder", "nexacorp")).toBe(false);
      expect(isCommandAvailable("chip", "nexacorp")).toBe(false);
      expect(isCommandAvailable("piper", "nexacorp")).toBe(false);
      expect(isCommandAvailable("chmod", "nexacorp")).toBe(false);
      expect(isCommandAvailable("sudo", "nexacorp")).toBe(false);
      expect(isCommandAvailable("apt", "nexacorp")).toBe(false);
    });

    it("unlocks chmod with chmod_unlocked flag", () => {
      expect(isCommandAvailable("chmod", "nexacorp", { chmod_unlocked: true })).toBe(true);
    });

    it("unlocks search tools with search_tools_unlocked flag", () => {
      const flags = { search_tools_unlocked: true };
      expect(isCommandAvailable("grep", "nexacorp", flags)).toBe(true);
      expect(isCommandAvailable("find", "nexacorp", flags)).toBe(true);
      expect(isCommandAvailable("diff", "nexacorp", flags)).toBe(true);
    });

    it("unlocks inspection tools with inspection_tools_unlocked flag", () => {
      const flags = { inspection_tools_unlocked: true };
      expect(isCommandAvailable("head", "nexacorp", flags)).toBe(true);
      expect(isCommandAvailable("tail", "nexacorp", flags)).toBe(true);
      expect(isCommandAvailable("wc", "nexacorp", flags)).toBe(true);
    });

    it("unlocks processing tools with processing_tools_unlocked flag", () => {
      const flags = { processing_tools_unlocked: true };
      expect(isCommandAvailable("sort", "nexacorp", flags)).toBe(true);
      expect(isCommandAvailable("uniq", "nexacorp", flags)).toBe(true);
    });

    it("unlocks coder with coder_unlocked flag", () => {
      expect(isCommandAvailable("coder", "nexacorp", { coder_unlocked: true })).toBe(true);
    });

    it("unlocks chip with chip_unlocked flag", () => {
      expect(isCommandAvailable("chip", "nexacorp", { chip_unlocked: true })).toBe(true);
    });

    it("unlocks piper with piper_unlocked flag", () => {
      expect(isCommandAvailable("piper", "nexacorp", { piper_unlocked: true })).toBe(true);
    });

    it("blocks devcontainer-only commands on nexacorp", () => {
      const allFlags = { devcontainer_visited: true, coder_unlocked: true };
      expect(isCommandAvailable("git", "nexacorp", allFlags)).toBe(false);
      expect(isCommandAvailable("snow", "nexacorp", allFlags)).toBe(false);
      expect(isCommandAvailable("dbt", "nexacorp", allFlags)).toBe(false);
    });

    it("blocks sudo and apt on nexacorp (no root access)", () => {
      expect(isCommandAvailable("sudo", "nexacorp")).toBe(false);
      expect(isCommandAvailable("apt", "nexacorp")).toBe(false);
      // apt_unlocked is only set at home, so these stay blocked on nexacorp
      expect(isCommandAvailable("sudo", "nexacorp", { apt_unlocked: true })).toBe(true);
      expect(isCommandAvailable("apt", "nexacorp", { apt_unlocked: true })).toBe(true);
    });
  });

  describe("devcontainer", () => {
    it("allows dbt, snow, python, and chip in devcontainer", () => {
      expect(isCommandAvailable("dbt", "devcontainer")).toBe(true);
      expect(isCommandAvailable("snow", "devcontainer")).toBe(true);
      expect(isCommandAvailable("python", "devcontainer")).toBe(true);
      expect(isCommandAvailable("chip", "devcontainer")).toBe(true);
    });

    it("allows standard commands in devcontainer", () => {
      const cmds = ["ls", "cd", "cat", "pwd", "clear", "help", "nano", "grep", "find", "diff", "head", "tail", "wc", "sort", "uniq", "echo", "exit"];
      for (const cmd of cmds) {
        expect(isCommandAvailable(cmd, "devcontainer")).toBe(true);
      }
    });

    it("blocks coder command in devcontainer", () => {
      expect(isCommandAvailable("coder", "devcontainer")).toBe(false);
    });

    it("blocks commands not in devcontainer whitelist", () => {
      expect(isCommandAvailable("mail", "devcontainer")).toBe(false);
      expect(isCommandAvailable("sudo", "devcontainer")).toBe(false);
      expect(isCommandAvailable("apt", "devcontainer")).toBe(false);
      expect(isCommandAvailable("pdftotext", "devcontainer")).toBe(false);
    });

    it("ssh is available in devcontainer/chipinfra (every Linux box has it)", () => {
      // ssh is on the DEVCONTAINER_COMMANDS whitelist so the chipinfra→erik-pc
      // pivot is reachable. From devcontainer it has no valid routes and every
      // target fails with "Could not resolve hostname" — that's correct behavior.
      expect(isCommandAvailable("ssh", "devcontainer")).toBe(true);
      expect(isCommandAvailable("ssh", "chipinfra")).toBe(true);
      expect(isCommandAvailable("ssh-add", "devcontainer")).toBe(true);
      expect(isCommandAvailable("ssh-add", "chipinfra")).toBe(true);
    });

    it("does not require story flags in devcontainer", () => {
      expect(isCommandAvailable("dbt", "devcontainer", {})).toBe(true);
      expect(isCommandAvailable("grep", "devcontainer", {})).toBe(true);
    });
  });

  describe("erik-pc", () => {
    it("home tutorial gating does not apply (Erik's laptop is fully set up)", () => {
      // Even with no flags set (player skipped Olive's optional challenge),
      // basics work on Erik's machine
      expect(isCommandAvailable("echo", "erik-pc")).toBe(true);
      expect(isCommandAvailable("whoami", "erik-pc", {})).toBe(true);
      expect(isCommandAvailable("hostname", "erik-pc", {})).toBe(true);
      expect(isCommandAvailable("mkdir", "erik-pc", {})).toBe(true);
      // All HOME_GATED commands are pre-installed, flags or not
      expect(isCommandAvailable("tree", "erik-pc", {})).toBe(true);
      expect(isCommandAvailable("apt", "erik-pc", {})).toBe(true);
      expect(isCommandAvailable("sudo", "erik-pc", {})).toBe(true);
      expect(isCommandAvailable("ssh", "erik-pc", {})).toBe(true);
    });

    it("still blocks devcontainer-only commands", () => {
      expect(isCommandAvailable("dbt", "erik-pc", {})).toBe(false);
      expect(isCommandAvailable("snow", "erik-pc", {})).toBe(false);
    });

    it("exit is available (returns to chipinfra)", () => {
      expect(isCommandAvailable("exit", "erik-pc")).toBe(true);
      expect(isCommandAvailable("exit", "erik-pc", {})).toBe(true);
    });
  });
});
