import { CommandHandler } from "../types";
import { register } from "../registry";
import { HELP_TEXTS } from "./helpTexts";
import { Mount, normalizeMountKey } from "../../filesystem/mounts";
import { dir } from "../../filesystem/builders";
import { isDirectory } from "../../filesystem/types";
import { basename } from "../../../lib/pathUtils";

const mount: CommandHandler = (args, _flags, ctx) => {
  const mounts = ctx.mounts ?? {};

  if (args.length === 0) {
    const lines = Object.values(mounts).map((m) =>
      `${m.device} on ${m.mountpath} type ${m.fstype ?? "auto"} (rw,relatime)`
    );
    return { output: lines.join("\n") };
  }

  if (args.length !== 2) {
    return { output: "mount: bad usage\nTry 'mount --help' for more information.", exitCode: 1 };
  }

  const [deviceArg, pathArg] = args;
  const device = ctx.devices?.findDevice(deviceArg);
  if (!device) {
    return { output: `mount: ${deviceArg}: no such device`, exitCode: 1 };
  }
  if (device.mountpoint) {
    return { output: `mount: ${device.devicePath} already mounted on ${device.mountpoint}`, exitCode: 1 };
  }

  const mountpath = normalizeMountKey(pathArg, ctx.cwd, ctx.homeDir);
  if (mountpath === "/") {
    return { output: `mount: /: cannot mount on root`, exitCode: 1 };
  }

  const target = ctx.fs.getNode(mountpath);
  if (!target) {
    return { output: `mount: ${pathArg}: mount point does not exist`, exitCode: 1 };
  }
  if (!isDirectory(target)) {
    return { output: `mount: ${pathArg}: mount point is not a directory`, exitCode: 1 };
  }
  if (Object.keys(target.children).length > 0) {
    return { output: `mount: ${pathArg}: not mounting — directory is not empty`, exitCode: 1 };
  }
  if (mounts[mountpath]) {
    return { output: `mount: ${pathArg}: already mounted`, exitCode: 1 };
  }

  const overlay = dir(basename(mountpath), device.getContents?.() ?? {});
  const insertResult = ctx.fs.insertNode(mountpath, overlay);
  if (insertResult.error || !insertResult.fs) {
    return { output: `mount: ${insertResult.error ?? "failed"}`, exitCode: 1 };
  }

  const newMount: Mount = { device: device.devicePath, mountpath, fstype: device.fstype };
  const newMounts = { ...mounts, [mountpath]: newMount };

  // Story trigger: the anonymous USB drive at /dev/sdb1 → /mnt/usb is the
  // beat that introduces the loose-thread arc. Other mounts don't credit it.
  const isUsbMount = device.devicePath === "/dev/sdb1" && mountpath === "/mnt/usb";

  return {
    output: "",
    newFs: insertResult.fs,
    newMounts,
    triggerEvents: isUsbMount
      ? [{ type: "command_executed", detail: "mounted_usb_drive" }]
      : undefined,
  };
};

register("mount", mount, "Mount a filesystem", HELP_TEXTS.mount);
