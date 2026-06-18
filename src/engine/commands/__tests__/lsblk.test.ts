import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execute } from "../registry";
import { CommandContext } from "@tt/core/commands/types";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { DirectoryNode } from "@tt/core/filesystem/types";
import { BLOCK_DEVICES, BlockDevice, createDeviceProvider } from "../../../story/blockDevices";
import { Mounts } from "@tt/core/filesystem/mounts";
import type { ComputerId } from "../../../state/types";

import "../builtins/lsblk";
import "../builtins/mount";
import "../builtins/umount";

// Capture the imported BLOCK_DEVICES.home before any test mutates it.
const ORIGINAL_HOME_DEVICES = BLOCK_DEVICES.home;

function emptyFs(): VirtualFS {
  const root: DirectoryNode = {
    type: "directory",
    name: "/",
    permissions: "rwxr-xr-x",
    hidden: false,
    children: {},
  };
  return new VirtualFS(root, "/", "/home/player");
}

function ctx(opts: { mounts?: Mounts; storyFlags?: Record<string, string | boolean>; fs?: VirtualFS; activeComputer?: ComputerId } = {}): CommandContext {
  const fs = opts.fs ?? emptyFs();
  const computer = opts.activeComputer ?? "home";
  const storyFlags = { accepted_usb_drive: true, ...opts.storyFlags };
  return {
    fs,
    cwd: fs.cwd,
    homeDir: fs.homeDir,
    username: "player",
    activeComputer: computer,
    storyFlags,
    mounts: opts.mounts ?? {},
    devices: createDeviceProvider(computer, storyFlags),
  };
}

const SDB1: BlockDevice = {
  name: "sdb1",
  devicePath: "/dev/sdb1",
  major: 8,
  minor: 17,
  removable: true,
  size: "16G",
  readOnly: false,
  type: "part",
  fstype: "ext4",
};

describe("lsblk", () => {
  beforeEach(() => {
    delete BLOCK_DEVICES.home;
  });

  afterEach(() => {
    delete BLOCK_DEVICES.home;
  });

  it("emits only the header when no devices are registered", () => {
    const result = execute("lsblk", [], {}, ctx());
    expect(result.output).toBe("NAME MAJ:MIN RM SIZE RO TYPE MOUNTPOINTS");
  });

  it("renders device columns for a single partition", () => {
    BLOCK_DEVICES.home = [SDB1];
    const result = execute("lsblk", [], {}, ctx());
    const lines = result.output.split("\n");
    expect(lines[0]).toMatch(/^NAME\s+MAJ:MIN\s+RM\s+SIZE\s+RO\s+TYPE\s+MOUNTPOINTS$/);
    expect(lines[1]).toContain("sdb1");
    expect(lines[1]).toContain("8:17");
    expect(lines[1]).toContain("16G");
    expect(lines[1]).toContain("part");
  });

  it("hides devices whose visibleFlag is not set", () => {
    BLOCK_DEVICES.home = [{ ...SDB1, visibleFlag: "ssh_unlocked" }];
    expect(execute("lsblk", [], {}, ctx()).output).toBe("NAME MAJ:MIN RM SIZE RO TYPE MOUNTPOINTS");
    const visible = execute("lsblk", [], {}, ctx({ storyFlags: { ssh_unlocked: true } }));
    expect(visible.output).toContain("sdb1");
  });

  it("renders MOUNTPOINTS when device is mounted", () => {
    BLOCK_DEVICES.home = [SDB1];
    const mounts: Mounts = { "/mnt/test": { device: "/dev/sdb1", mountpath: "/mnt/test", fstype: "ext4" } };
    const result = execute("lsblk", [], {}, ctx({ mounts }));
    expect(result.output).toContain("/mnt/test");
  });

  it("uses tree branches for partitions of a parent disk", () => {
    BLOCK_DEVICES.home = [
      { ...SDB1, name: "sdb", devicePath: "/dev/sdb", type: "disk", parent: undefined },
      { ...SDB1, name: "sdb1", parent: "sdb" },
      { ...SDB1, name: "sdb2", parent: "sdb", minor: 18, devicePath: "/dev/sdb2" },
    ];
    const out = execute("lsblk", [], {}, ctx()).output;
    expect(out).toContain("├─sdb1");
    expect(out).toContain("└─sdb2");
  });
});

// Exercises the real BLOCK_DEVICES.home content (the anonymous USB drive),
// not test-local overrides. Ensures the visibleFlag gating works end-to-end.
describe("lsblk: anonymous USB drive (real BLOCK_DEVICES)", () => {
  beforeEach(() => {
    BLOCK_DEVICES.home = ORIGINAL_HOME_DEVICES;
  });

  afterEach(() => {
    delete BLOCK_DEVICES.home;
  });

  it("hides /dev/sdb until accepted_usb_drive is set", () => {
    // accepted_usb_drive gates both the lsblk command itself and the
    // visibility of /dev/sdb. Without it, the command is blocked entirely
    // — which is also why "sdb" doesn't appear.
    const out = execute("lsblk", [], {}, ctx({ storyFlags: { accepted_usb_drive: false } })).output;
    expect(out).not.toContain("sdb");
  });

  it("shows /dev/sdb and /dev/sdb1 once accepted_usb_drive is set", () => {
    const out = execute(
      "lsblk",
      [],
      {},
      ctx({ storyFlags: { accepted_usb_drive: true } })
    ).output;
    expect(out).toContain("sdb");
    expect(out).toContain("sdb1");
    expect(out).toContain("16G");
  });
});

// Exercises the real baseline system disks added so every computer's lsblk
// reflects a true-to-life machine (root partition mounted at /).
describe("lsblk: baseline system disks (real BLOCK_DEVICES)", () => {
  beforeEach(() => {
    BLOCK_DEVICES.home = ORIGINAL_HOME_DEVICES;
  });
  afterEach(() => {
    delete BLOCK_DEVICES.home;
  });

  it("shows the nexacorp root disk mounted at / with no dynamic mount", () => {
    const out = execute("lsblk", [], {}, ctx({ activeComputer: "nexacorp" })).output;
    const lines = out.split("\n");
    expect(lines[0]).toMatch(/^NAME\s+MAJ:MIN\s+RM\s+SIZE\s+RO\s+TYPE\s+MOUNTPOINTS$/);
    expect(out).toContain("sda");
    expect(out).toContain("└─sda1");
    expect(out).toContain("8:0");
    expect(out).toContain("8:1");
    // The static `/` mountpoint renders even though ctx.mounts is empty.
    const sda1Line = lines.find((l) => l.includes("sda1"))!;
    expect(sda1Line.endsWith("/")).toBe(true);
  });

  it("shows the root partition's ext4 fstype with -f", () => {
    const out = execute("lsblk", [], { f: true }, ctx({ activeComputer: "nexacorp" })).output;
    expect(out).toMatch(/sda1.*ext4.*\//);
  });

  it("uses authentic per-machine device names", () => {
    expect(execute("lsblk", [], {}, ctx({ activeComputer: "devcontainer" })).output).toContain("vda");
    expect(execute("lsblk", [], {}, ctx({ activeComputer: "erik-pc" })).output).toContain("nvme0n1p1");
    expect(execute("lsblk", [], {}, ctx({ activeComputer: "home" })).output).toContain("nvme0n1");
  });

  it("mount refuses to re-mount a baseline system device", () => {
    const result = execute("mount", ["/dev/sda1", "/mnt/x"], {}, ctx({ activeComputer: "nexacorp" }));
    expect(result.output).toContain("already mounted on /");
    expect(result.exitCode).toBe(1);
  });
});
