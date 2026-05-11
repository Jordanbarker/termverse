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
  visibleFlag?: StoryFlagName;
  getContents?: () => Record<string, FSNode>;
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
};

export function getVisibleDevices(
  computer: ComputerId,
  storyFlags?: Record<string, string | boolean>
): BlockDevice[] {
  const all = BLOCK_DEVICES[computer] ?? [];
  return all.filter((d) => !d.visibleFlag || !!storyFlags?.[d.visibleFlag]);
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
