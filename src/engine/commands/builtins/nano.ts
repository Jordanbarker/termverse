import { CommandHandler } from "../types";
import { register } from "../registry";
import { resolvePath, parentPath } from "@tt/core/lib/pathUtils";
import { isFile, isDirectory } from "@tt/core/filesystem/types";
import { HELP_TEXTS } from "./helpTexts";

const nano: CommandHandler = (args, _flags, ctx) => {
  if (args.length === 0) {
    return { output: "Usage: nano <filename>" };
  }

  const target = args[0];
  const absolutePath = resolvePath(target, ctx.cwd, ctx.homeDir);
  const node = ctx.fs.getNode(absolutePath);

  if (node && isDirectory(node)) {
    return { output: `nano: "${target}": Is a directory` };
  }

  if (node && isFile(node)) {
    const traversalError = ctx.fs.checkTraversal(absolutePath);
    if (traversalError) {
      return { output: `nano: "${target}": Permission denied` };
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
    return { output: `nano: "${target}": No such file or directory` };
  }
  const traversalError = ctx.fs.checkTraversal(absolutePath);
  if (traversalError) {
    return { output: `nano: "${target}": Permission denied` };
  }

  return {
    output: "",
    editorSession: {
      filePath: absolutePath,
      content: "",
      readOnly: false,
      isNewFile: true,
    },
  };
};

register("nano", nano, "Edit files with a simple text editor", HELP_TEXTS.nano);
