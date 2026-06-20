import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { HELP_TEXTS } from "./helpTexts";
import { BlockDevice } from "@tt/core/commands/devices";
import { Mount } from "@tt/core/filesystem/mounts";

interface Row {
  device: BlockDevice;
  branch: string;
}

function buildRows(devices: BlockDevice[]): Row[] {
  const byParent = new Map<string | undefined, BlockDevice[]>();
  for (const d of devices) {
    const key = d.parent;
    const list = byParent.get(key) ?? [];
    list.push(d);
    byParent.set(key, list);
  }

  const rows: Row[] = [];
  const tops = byParent.get(undefined) ?? [];
  for (const top of tops) {
    rows.push({ device: top, branch: "" });
    const children = byParent.get(top.name) ?? [];
    for (let i = 0; i < children.length; i++) {
      const isLast = i === children.length - 1;
      rows.push({ device: children[i], branch: isLast ? "└─" : "├─" });
    }
  }
  return rows;
}

function formatMountpoints(device: BlockDevice, mounts: Record<string, Mount>): string {
  const paths: string[] = device.mountpoint ? [device.mountpoint] : [];
  for (const m of Object.values(mounts)) {
    if (m.device === device.devicePath) paths.push(m.mountpath);
  }
  return paths.join(",");
}

const lsblk: CommandHandler = (_args, flags, ctx) => {
  const showFstype = !!flags["f"];
  const devices = ctx.devices?.visibleDevices() ?? [];
  const rows = buildRows(devices);
  const mounts = ctx.mounts ?? {};

  const headers = showFstype
    ? ["NAME", "FSTYPE", "SIZE", "MOUNTPOINTS"]
    : ["NAME", "MAJ:MIN", "RM", "SIZE", "RO", "TYPE", "MOUNTPOINTS"];

  const data: string[][] = rows.map(({ device, branch }) => {
    const name = `${branch}${device.name}`;
    const mountpoints = formatMountpoints(device, mounts);
    if (showFstype) {
      return [name, device.fstype ?? "", device.size, mountpoints];
    }
    return [
      name,
      `${device.major}:${device.minor}`,
      device.removable ? "1" : "0",
      device.size,
      device.readOnly ? "1" : "0",
      device.type,
      mountpoints,
    ];
  });

  const widths = headers.map((h, i) =>
    Math.max(h.length, ...data.map((row) => row[i].length))
  );

  const formatRow = (cells: string[]) =>
    cells.map((c, i) => c.padEnd(widths[i])).join(" ").trimEnd();

  const lines = [formatRow(headers), ...data.map(formatRow)];
  return { output: lines.join("\n") };
};

register("lsblk", lsblk, "List information about block devices", HELP_TEXTS.lsblk);
setKnownFlags("lsblk", { short: ["a", "f"] });
