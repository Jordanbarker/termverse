"use client";

import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { isDirectory, type FSNode } from "@tt/core/filesystem/types";

interface Props {
  fs: VirtualFS;
  /** Directory whose subtree is rendered. */
  watchPath: string;
}

/** A node flagged as the deletion target gets a danger style. */
function isTarget(name: string): boolean {
  return name === "BOMB.md";
}

function rows(node: FSNode, depth: number): React.ReactElement[] {
  const indent = { paddingLeft: `${depth * 14}px` };
  const target = isTarget(node.name);
  const label = isDirectory(node) ? `${node.name}/` : node.name;
  const typeChar = isDirectory(node) ? "d" : "-";
  const out: React.ReactElement[] = [
    <div
      key={`${depth}-${node.name}`}
      className="flex items-baseline gap-2 truncate"
      style={{ color: target ? "#ff7b72" : isDirectory(node) ? "#6cb6ff" : "#b3b1ad" }}
    >
      <span className="text-[#6b7680]">
        {typeChar}
        {node.permissions}
      </span>
      <span style={indent} className="truncate">
        {target ? "💣 " : ""}
        {label}
      </span>
    </div>,
  ];
  if (isDirectory(node)) {
    for (const child of Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name))) {
      out.push(...rows(child, depth + 1));
    }
  }
  return out;
}

/**
 * Prop-driven tree diagram of a filesystem subtree — the fs analog of
 * `GitReadout`. Re-renders on every fs change, so removing the target file makes
 * its row disappear and the survivors stay put.
 */
export default function FsTreeView({ fs, watchPath }: Props) {
  const root = fs.getNode(watchPath);
  return (
    <div className="rounded border border-[#3d4751] bg-[#0a0e14] p-2 font-mono text-xs leading-relaxed">
      {root ? rows(root, 0) : <div className="text-[#6b7680]">{watchPath} is gone</div>}
    </div>
  );
}
