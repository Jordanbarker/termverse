import { resolvePath } from "@tt/core/lib/pathUtils";

export interface Mount {
  device: string;
  mountpath: string;
  fstype?: string;
}

export type Mounts = Record<string, Mount>;

/**
 * Normalize a user-supplied path into the canonical key used in `Mounts`.
 * Resolves relative paths against cwd/homeDir and collapses redundant slashes
 * via `resolvePath` (which delegates to `normalizePath`). Without this,
 * `/mnt/test`, `/mnt/test/`, and `mnt/test` would each create distinct keys.
 */
export function normalizeMountKey(input: string, cwd: string, homeDir: string): string {
  return resolvePath(input, cwd, homeDir);
}
