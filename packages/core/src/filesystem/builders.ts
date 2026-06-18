import { FileNode, DirectoryNode, FSNode } from "./types";

/**
 * Create a FileNode with the given name and content.
 * Hidden flag is automatically set for dotfiles.
 */
export function file(name: string, content: string, permissions = "rw-r--r--"): FileNode {
  return { type: "file", name, content, permissions, hidden: name.startsWith(".") };
}

/**
 * Create a FileNode representing a binary file with garbled content and a text fallback.
 * Hidden flag is automatically set for dotfiles.
 */
export function binaryFile(name: string, garbledContent: string, textContent: string, permissions = "rw-r--r--"): FileNode {
  return { type: "file", name, content: garbledContent, permissions, hidden: name.startsWith("."), metadata: { binary: true, textContent } };
}

/**
 * Create a DirectoryNode with the given name and children.
 * Hidden flag is automatically set for dotfiles.
 */
export function dir(name: string, children: Record<string, FSNode>, permissions = "rwxr-xr-x"): DirectoryNode {
  return { type: "directory", name, children, permissions, hidden: name.startsWith(".") };
}
