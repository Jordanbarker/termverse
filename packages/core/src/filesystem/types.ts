export interface FileNode {
  type: "file";
  name: string;
  content: string;
  permissions: string;
  hidden: boolean;
  metadata?: Record<string, unknown>;
}

export interface DirectoryNode {
  type: "directory";
  name: string;
  children: Record<string, FSNode>;
  permissions: string;
  hidden: boolean;
  metadata?: Record<string, unknown>;
}

export type FSNode = FileNode | DirectoryNode;

export function isFile(node: FSNode): node is FileNode {
  return node.type === "file";
}

export function isDirectory(node: FSNode): node is DirectoryNode {
  return node.type === "directory";
}
