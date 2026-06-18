import { FSNode, isDirectory } from "./types";
import { VirtualFS } from "./VirtualFS";

interface CollectOptions {
  includeRoot?: boolean;
}

export function collectDescendantPaths(
  fs: VirtualFS,
  rootPath: string,
  opts: CollectOptions = {}
): string[] {
  const includeRoot = opts.includeRoot ?? true;
  const out: string[] = [];
  const rootNode = fs.getNode(rootPath);
  if (!rootNode) return out;
  walkNode(rootNode, rootPath, out, includeRoot);
  return out;
}

function walkNode(node: FSNode, path: string, out: string[], includeSelf: boolean): void {
  if (includeSelf) out.push(path);
  if (!isDirectory(node)) return;
  for (const child of Object.values(node.children)) {
    const childPath = path === "/" ? `/${child.name}` : `${path}/${child.name}`;
    walkNode(child, childPath, out, true);
  }
}
