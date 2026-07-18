import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { HELP_TEXTS } from "./helpTexts";

const INSTALLABLE_PACKAGES: Record<string, {
  flag: string;
  output: string;
  alreadyInstalled: string;
}> = {
  tree: {
    flag: "tree_installed",
    output: [
      "Reading package lists... Done",
      "Building dependency tree... Done",
      "Reading state information... Done",
      "The following NEW packages will be installed:",
      "  tree",
      "0 upgraded, 1 newly installed, 0 to remove and 0 not upgraded.",
      "Selecting previously unselected package tree.",
      "Setting up tree (2.1.1-1) ...",
    ].join("\n"),
    alreadyInstalled: "tree is already the newest version (2.1.1-1).\n0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.",
  },
};

const APT_UPDATE_OUTPUT = [
  "Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease",
  "Hit:2 http://archive.ubuntu.com/ubuntu noble-updates InRelease",
  "Hit:3 http://archive.ubuntu.com/ubuntu noble-backports InRelease",
  "Hit:4 http://security.ubuntu.com/ubuntu noble-security InRelease",
  "Reading package lists... Done",
  "Building dependency tree... Done",
  "Reading state information... Done",
  "6 packages can be upgraded. Run 'apt list --upgradable' to see them.",
].join("\n");

const APT_UPGRADE_OUTPUT = [
  "Reading package lists... Done",
  "Building dependency tree... Done",
  "Reading state information... Done",
  "Calculating upgrade... Done",
  "The following packages will be upgraded:",
  "  base-files curl libcurl4 libssl3 openssh-client openssh-server",
  "6 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.",
  "Need to get 2,847 kB of archives.",
  "After this operation, 12.3 kB of additional disk space will be used.",
  "Get:1 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 base-files amd64 13ubuntu10.2 [75.4 kB]",
  "Get:2 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libssl3 amd64 3.0.13-0ubuntu3.5 [1,927 kB]",
  "Get:3 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 openssh-client amd64 1:9.6p1-3ubuntu13.5 [940 kB]",
  "Fetched 2,847 kB in 3s (949 kB/s)",
  "(Reading database ... 87432 files and directories currently installed.)",
  "Setting up base-files (13ubuntu10.2) ...",
  "Setting up libssl3:amd64 (3.0.13-0ubuntu3.5) ...",
  "Setting up openssh-client (1:9.6p1-3ubuntu13.5) ...",
  "Processing triggers for libc-bin (2.39-0ubuntu8.3) ...",
  "Processing triggers for man-db (2.12.0-4build2) ...",
].join("\n");

const APT_NOTHING_TO_UPGRADE = [
  "Reading package lists... Done",
  "Building dependency tree... Done",
  "Reading state information... Done",
  "Calculating upgrade... Done",
  "0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.",
].join("\n");

const PERMISSION_DENIED = "E: Could not open lock file - open (13: Permission denied)\nE: Unable to acquire the dpkg frontend lock, are you root?";

const apt: CommandHandler = (args, _flags, ctx) => {
  if (!ctx.elevated) {
    return { output: PERMISSION_DENIED };
  }

  const subcommand = args[0];

  if (subcommand === "update") {
    if (ctx.storyFlags?.apt_updated) {
      return { output: "All packages are up to date." };
    }
    return {
      output: APT_UPDATE_OUTPUT,
      triggerEvents: [{ type: "command_executed", detail: "apt_update" }],
    };
  }

  if (subcommand === "upgrade") {
    if (!ctx.storyFlags?.apt_updated || ctx.storyFlags?.apt_upgraded) {
      return { output: APT_NOTHING_TO_UPGRADE };
    }
    return {
      output: APT_UPGRADE_OUTPUT,
      triggerEvents: [{ type: "command_executed", detail: "apt_upgrade" }],
    };
  }

  if (subcommand === "install") {
    if (args.length < 2) {
      return { output: "E: No packages specified" };
    }

    const packageName = args[1];
    const pkg = INSTALLABLE_PACKAGES[packageName];

    if (!pkg) {
      return { output: `E: Unable to locate package ${packageName}` };
    }

    if (ctx.storyFlags?.[pkg.flag]) {
      return { output: pkg.alreadyInstalled };
    }

    return {
      output: pkg.output,
      triggerEvents: [{ type: "command_executed", detail: `apt_install_${packageName}` }],
    };
  }

  return { output: "Usage: apt <update|upgrade|install> [package]" };
};

register("apt", apt, "Package manager", HELP_TEXTS.apt);
