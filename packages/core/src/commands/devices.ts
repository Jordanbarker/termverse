/**
 * Block-device seam (core, story-agnostic).
 *
 * df/lsblk/mount need to know what block devices a machine has, but the engine
 * does not own that list. The app injects a DeviceProvider via
 * CommandContext.devices, pre-scoped to the current machine + game flags.
 * Absent => the machine has no enumerable devices (df falls back to a generic
 * root device path).
 */
import { FSNode } from "@tt/core/filesystem/types";

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
  /** Game flag that must be set for this device to be visible (app-defined). */
  visibleFlag?: string;
  getContents?: () => Record<string, FSNode>;
}

/** Machine-scoped device accessor injected via CommandContext.devices. */
export interface DeviceProvider {
  /** Devices currently visible on this machine (after flag filtering). */
  visibleDevices(): BlockDevice[];
  /** The partition mounted at `/`, if any. */
  rootDevice(): BlockDevice | undefined;
  /** Find a visible device by `/dev/...` path or bare name. */
  findDevice(devicePathOrName: string): BlockDevice | undefined;
}
