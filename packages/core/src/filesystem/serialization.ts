import { DirectoryNode } from "./types";
import { VirtualFS } from "./VirtualFS";

export interface SerializedFS {
  root: DirectoryNode;
  cwd: string;
  homeDir: string;
}

export function serializeFS(fs: VirtualFS): SerializedFS {
  return {
    root: fs.root,
    cwd: fs.cwd,
    homeDir: fs.homeDir,
  };
}

export function deserializeFS(data: SerializedFS): VirtualFS {
  return new VirtualFS(data.root, data.cwd, data.homeDir);
}
