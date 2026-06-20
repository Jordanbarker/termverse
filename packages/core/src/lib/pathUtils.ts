/**
 * Normalize a filesystem path: resolve `.`, `..`, collapse multiple slashes,
 * and ensure it starts with `/`.
 */
export function normalizePath(path: string): string {
  const parts = path.split("/").filter((p) => p !== "" && p !== ".");
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === "..") {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }

  return "/" + resolved.join("/");
}

/**
 * Resolve a path relative to a current working directory.
 * Handles `~` (home), absolute paths, and relative paths.
 */
export function resolvePath(
  input: string,
  cwd: string,
  homeDir: string
): string {
  let path = input;

  if (path === "~" || path.startsWith("~/")) {
    path = homeDir + path.slice(1);
  }

  if (!path.startsWith("/")) {
    path = cwd + "/" + path;
  }

  return normalizePath(path);
}

/**
 * Get the parent directory of a path.
 */
export function parentPath(path: string): string {
  const normalized = normalizePath(path);
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash === 0) return "/";
  return normalized.slice(0, lastSlash);
}

/**
 * Get the basename (final component) of a path.
 */
export function basename(path: string): string {
  const normalized = normalizePath(path);
  if (normalized === "/") return "/";
  const parts = normalized.split("/");
  return parts[parts.length - 1];
}
