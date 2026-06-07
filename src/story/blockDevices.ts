import { FSNode } from "../engine/filesystem/types";
import { file } from "../engine/filesystem/builders";
import type { ComputerId } from "../state/types";
import type { StoryFlagName } from "./storyFlags";

export interface BlockDevice {
  name: string;
  devicePath: string;
  major: number;
  minor: number;
  removable: boolean;
  size: string;
  readOnly: boolean;
  type: "disk" | "part" | "loop" | "rom";
  fstype?: string;
  parent?: string;
  /** Static baseline mountpoint (e.g. the root `/`). Shown by lsblk without a dynamic mount. */
  mountpoint?: string;
  visibleFlag?: StoryFlagName;
  getContents?: () => Record<string, FSNode>;
}

/** Partition node name for a disk: nvme0n1 -> nvme0n1p1 ; sda -> sda1 ; vda -> vda1 */
function partitionName(disk: string): string {
  return /\d$/.test(disk) ? `${disk}p1` : `${disk}1`;
}

/** A baseline system disk with a single root partition mounted at `/`. */
function systemDisk(disk: string, major: number, size: string, fstype = "ext4"): BlockDevice[] {
  const part = partitionName(disk);
  return [
    { name: disk, devicePath: `/dev/${disk}`, major, minor: 0, removable: false, size, readOnly: false, type: "disk" },
    {
      name: part,
      devicePath: `/dev/${part}`,
      major,
      minor: 1,
      removable: false,
      size,
      readOnly: false,
      type: "part",
      fstype,
      parent: disk,
      mountpoint: "/",
    },
  ];
}

const USB_NOTE_BODY = `
Look at the shared coder chip workspace. 
Someone often leaves a forwarded ssh agent socket lying around.

- Find their SSH agent socket, e.g. /tmp/ssh-abc123/agent.12345
- Set SSH_AUTH_SOCK=/tmp/ssh-abc123/agent.12345
- Run 'ssh-add -l'

Then you can ssh into their workstation
`;

export const BLOCK_DEVICES: Partial<Record<ComputerId, BlockDevice[]>> = {
  home: [
    // System disk (NVMe SSD). Always present; the gated USB drive is appended below.
    ...systemDisk("nvme0n1", 259, "512G"),
    {
      name: "sdb",
      devicePath: "/dev/sdb",
      major: 8,
      minor: 16,
      removable: true,
      size: "16G",
      readOnly: false,
      type: "disk",
      visibleFlag: "accepted_usb_drive",
    },
    {
      name: "sdb1",
      devicePath: "/dev/sdb1",
      major: 8,
      minor: 17,
      removable: true,
      size: "16G",
      readOnly: false,
      type: "part",
      fstype: "ext4",
      parent: "sdb",
      visibleFlag: "accepted_usb_drive",
      getContents: () => ({
        "note.txt": file("note.txt", USB_NOTE_BODY),
      }),
    },
  ],
  nexacorp: systemDisk("sda", 8, "1T"),
  devcontainer: systemDisk("vda", 254, "50G"),
  chipinfra: systemDisk("vda", 254, "200G"),
  "erik-pc": systemDisk("nvme0n1", 259, "512G"),
};

export function getVisibleDevices(
  computer: ComputerId,
  storyFlags?: Record<string, string | boolean>
): BlockDevice[] {
  const all = BLOCK_DEVICES[computer] ?? [];
  return all.filter((d) => !d.visibleFlag || !!storyFlags?.[d.visibleFlag]);
}

/** The partition mounted at `/` on this computer, if any. Single source of truth for df. */
export function getRootDevice(computer: ComputerId): BlockDevice | undefined {
  return (BLOCK_DEVICES[computer] ?? []).find((d) => d.mountpoint === "/");
}

export function findDevice(
  computer: ComputerId,
  devicePathOrName: string,
  storyFlags?: Record<string, string | boolean>
): BlockDevice | undefined {
  return getVisibleDevices(computer, storyFlags).find(
    (d) => d.devicePath === devicePathOrName || d.name === devicePathOrName
  );
}
