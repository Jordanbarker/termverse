import { CommandContext, CommandResult } from "@tt/core/commands/types";
import { resolvePath, parentPath } from "@tt/core/lib/pathUtils";
import { isFile, isDirectory } from "@tt/core/filesystem/types";

/**
 * Shared open/validation logic for the editor builtins (nano, vim): directory
 * and permission checks, readOnly detection, new-file parent check, and the
 * home backup.sh story trigger. `editor` selects which session class the app
 * routers instantiate; it is omitted for nano so nano's descriptor is unchanged.
 */
export function openFileForEditing(
  target: string | undefined,
  ctx: CommandContext,
  editor: "nano" | "vim"
): CommandResult {
  if (!target) {
    return { output: `Usage: ${editor} <filename>` };
  }

  const editorField = editor === "vim" ? { editor: "vim" as const } : {};
  const absolutePath = resolvePath(target, ctx.cwd, ctx.homeDir);
  const node = ctx.fs.getNode(absolutePath);

  if (node && isDirectory(node)) {
    return { output: `${editor}: "${target}": Is a directory` };
  }

  if (node && isFile(node)) {
    const traversalError = ctx.fs.checkTraversal(absolutePath);
    if (traversalError) {
      return { output: `${editor}: "${target}": Permission denied` };
    }
    const readOnly = !node.permissions.startsWith("rw");
    const isBackupScript = ctx.activeComputer === "home" && absolutePath.endsWith("/scripts/backup.sh");
    return {
      output: "",
      editorSession: {
        filePath: absolutePath,
        content: node.content,
        readOnly,
        isNewFile: false,
        ...editorField,
        ...(isBackupScript && {
          triggerRow: 0,
          triggerEvents: [{ type: "file_read" as const, detail: "fixed_backup_script" }],
          requireSave: true,
        }),
      },
    };
  }

  // New file — check parent directory exists and permissions
  const parent = parentPath(absolutePath);
  const parentNode = ctx.fs.getNode(parent);
  if (!parentNode || !isDirectory(parentNode)) {
    return { output: `${editor}: "${target}": No such file or directory` };
  }
  const traversalError = ctx.fs.checkTraversal(absolutePath);
  if (traversalError) {
    return { output: `${editor}: "${target}": Permission denied` };
  }

  return {
    output: "",
    editorSession: {
      filePath: absolutePath,
      content: "",
      readOnly: false,
      isNewFile: true,
      ...editorField,
    },
  };
}
