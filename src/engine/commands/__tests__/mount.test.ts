import { describe, it, expect, afterEach } from "vitest";
import { execute } from "../registry";
import { CommandContext } from "../types";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { DirectoryNode, isDirectory } from "../../filesystem/types";
import { BLOCK_DEVICES, BlockDevice, createDeviceProvider } from "../../../story/blockDevices";
import { Mounts } from "../../filesystem/mounts";
import { dir, file } from "../../filesystem/builders";

import "../builtins/mount";
import "../builtins/umount";
import "../builtins/ls";
import "../builtins/mkdir";

function fsWithMnt(): VirtualFS {
  const root: DirectoryNode = {
    type: "directory",
    name: "/",
    permissions: "rwxr-xr-x",
    hidden: false,
    children: {
      mnt: {
        type: "directory",
        name: "mnt",
        permissions: "rwxr-xr-x",
        hidden: false,
        children: {
          test: {
            type: "directory",
            name: "test",
            permissions: "rwxr-xr-x",
            hidden: false,
            children: {},
          },
        },
      },
      etc: {
        type: "directory",
        name: "etc",
        permissions: "rwxr-xr-x",
        hidden: false,
        children: {
          "passwd": {
            type: "file",
            name: "passwd",
            content: "root:x:0:0::/root:/bin/sh\n",
            permissions: "rw-r--r--",
            hidden: false,
          },
        },
      },
    },
  };
  return new VirtualFS(root, "/", "/home/player");
}

function ctx(fs: VirtualFS, mounts: Mounts = {}): CommandContext {
  // mount/umount are gated behind accepted_usb_drive (see commandGates.ts).
  // These tests exercise the command behavior, not the gate, so set it.
  const storyFlags = { accepted_usb_drive: true };
  return {
    fs,
    cwd: fs.cwd,
    homeDir: fs.homeDir,
    username: "player",
    activeComputer: "home",
    storyFlags,
    mounts,
    devices: createDeviceProvider("home", storyFlags),
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
  getContents: () => ({
    "hello.txt": file("hello.txt", "hi from the device\n"),
    "folder": dir("folder", { "inner.txt": file("inner.txt", "nested\n") }),
  }),
};

describe("mount", () => {
  afterEach(() => {
    delete BLOCK_DEVICES.home;
  });

  it("happy path: mounts a device, contents become visible at the mountpoint", () => {
    BLOCK_DEVICES.home = [SDB1];
    const result = execute("mount", ["/dev/sdb1", "/mnt/test"], {}, ctx(fsWithMnt()));
    expect(result.exitCode ?? 0).toBe(0);
    expect(result.newFs).toBeDefined();
    expect(result.newMounts).toEqual({
      "/mnt/test": { device: "/dev/sdb1", mountpath: "/mnt/test", fstype: "ext4" },
    });
    const node = result.newFs!.getNode("/mnt/test/hello.txt");
    expect(node).toBeTruthy();
  });

  it("regression: mounted directory keeps the user's mountpath name, not the device's", () => {
    BLOCK_DEVICES.home = [SDB1];
    const result = execute("mount", ["/dev/sdb1", "/mnt/test"], {}, ctx(fsWithMnt()));
    const mntNode = result.newFs!.getNode("/mnt/test");
    expect(mntNode).toBeTruthy();
    if (mntNode && isDirectory(mntNode)) {
      expect(mntNode.name).toBe("test");
    }
    const lsResult = execute("ls", ["/mnt"], {}, ctx(result.newFs!, result.newMounts));
    expect(lsResult.output).toContain("test");
    expect(lsResult.output).not.toContain("sdb1");
  });

  it("rejects unknown device", () => {
    BLOCK_DEVICES.home = [SDB1];
    const result = execute("mount", ["/dev/nope", "/mnt/test"], {}, ctx(fsWithMnt()));
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("no such device");
  });

  it("rejects mountpoint that is not a directory", () => {
    BLOCK_DEVICES.home = [SDB1];
    const result = execute("mount", ["/dev/sdb1", "/etc/passwd"], {}, ctx(fsWithMnt()));
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("not a directory");
  });

  it("rejects mountpoint that does not exist", () => {
    BLOCK_DEVICES.home = [SDB1];
    const result = execute("mount", ["/dev/sdb1", "/nope/test"], {}, ctx(fsWithMnt()));
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("does not exist");
  });

  it("rejects mounting on a non-empty directory", () => {
    BLOCK_DEVICES.home = [SDB1];
    const fs = fsWithMnt();
    const withFile = fs.writeFile("/mnt/test/existing.txt", "hi").fs!;
    const result = execute("mount", ["/dev/sdb1", "/mnt/test"], {}, ctx(withFile));
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("not mounting");
    expect(result.output).toContain("not empty");
  });

  it("rejects double-mounting on the same path", () => {
    BLOCK_DEVICES.home = [SDB1];
    const mounts: Mounts = { "/mnt/test": { device: "/dev/sdb1", mountpath: "/mnt/test", fstype: "ext4" } };
    const result = execute("mount", ["/dev/sdb1", "/mnt/test"], {}, ctx(fsWithMnt(), mounts));
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("already mounted");
  });

  it("normalizes paths so /mnt/test/ and mnt/test/ key the same entry", () => {
    BLOCK_DEVICES.home = [SDB1];
    const r1 = execute("mount", ["/dev/sdb1", "/mnt/test/"], {}, ctx(fsWithMnt()));
    expect(Object.keys(r1.newMounts!)).toEqual(["/mnt/test"]);

    const r2 = execute("mount", ["/dev/sdb1", "mnt/test"], {}, ctx(fsWithMnt()));
    expect(Object.keys(r2.newMounts!)).toEqual(["/mnt/test"]);
  });

  it("with no args, lists active mounts", () => {
    const mounts: Mounts = { "/mnt/test": { device: "/dev/sdb1", mountpath: "/mnt/test", fstype: "ext4" } };
    const result = execute("mount", [], {}, ctx(fsWithMnt(), mounts));
    expect(result.output).toContain("/dev/sdb1 on /mnt/test type ext4");
  });

  it("emits mounted_usb_drive triggerEvent only for /dev/sdb1 → /mnt/usb", () => {
    BLOCK_DEVICES.home = [SDB1];
    // Build an FS where /mnt/usb is the empty target.
    const root: DirectoryNode = {
      type: "directory",
      name: "/",
      permissions: "rwxr-xr-x",
      hidden: false,
      children: {
        mnt: {
          type: "directory", name: "mnt", permissions: "rwxr-xr-x", hidden: false,
          children: {
            usb:  { type: "directory", name: "usb",  permissions: "rwxr-xr-x", hidden: false, children: {} },
            test: { type: "directory", name: "test", permissions: "rwxr-xr-x", hidden: false, children: {} },
          },
        },
      },
    };
    const fs = new VirtualFS(root, "/", "/home/player");

    const usbResult = execute("mount", ["/dev/sdb1", "/mnt/usb"], {}, ctx(fs));
    expect(usbResult.exitCode ?? 0).toBe(0);
    expect(usbResult.triggerEvents).toEqual([
      { type: "command_executed", detail: "mounted_usb_drive" },
    ]);

    const otherResult = execute("mount", ["/dev/sdb1", "/mnt/test"], {}, ctx(fs));
    expect(otherResult.exitCode ?? 0).toBe(0);
    expect(otherResult.triggerEvents).toBeUndefined();
  });
});

describe("umount", () => {
  afterEach(() => {
    delete BLOCK_DEVICES.home;
  });

  it("round-trip: mount then umount restores empty directory and clears mounts", () => {
    BLOCK_DEVICES.home = [SDB1];
    const mountResult = execute("mount", ["/dev/sdb1", "/mnt/test"], {}, ctx(fsWithMnt()));
    const fsAfterMount = mountResult.newFs!;
    const mountsAfterMount = mountResult.newMounts!;

    const umountResult = execute("umount", ["/mnt/test"], {}, ctx(fsAfterMount, mountsAfterMount));
    expect(umountResult.exitCode ?? 0).toBe(0);
    const restored = umountResult.newFs!.getNode("/mnt/test");
    expect(restored && isDirectory(restored) && Object.keys(restored.children)).toEqual([]);
    expect(umountResult.newMounts).toEqual({});
  });

  it("accepts the device path as the argument", () => {
    BLOCK_DEVICES.home = [SDB1];
    const mountResult = execute("mount", ["/dev/sdb1", "/mnt/test"], {}, ctx(fsWithMnt()));
    const umountResult = execute(
      "umount",
      ["/dev/sdb1"],
      {},
      ctx(mountResult.newFs!, mountResult.newMounts!)
    );
    expect(umountResult.exitCode ?? 0).toBe(0);
    expect(umountResult.newMounts).toEqual({});
  });

  it("normalizes the path argument", () => {
    BLOCK_DEVICES.home = [SDB1];
    const mountResult = execute("mount", ["/dev/sdb1", "/mnt/test"], {}, ctx(fsWithMnt()));
    const umountResult = execute(
      "umount",
      ["/mnt/test/"],
      {},
      ctx(mountResult.newFs!, mountResult.newMounts!)
    );
    expect(umountResult.exitCode ?? 0).toBe(0);
    expect(umountResult.newMounts).toEqual({});
  });

  it("errors if not mounted", () => {
    const result = execute("umount", ["/mnt/test"], {}, ctx(fsWithMnt()));
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("not mounted");
  });
});
