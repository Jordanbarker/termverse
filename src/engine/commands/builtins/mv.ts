import { CommandHandler } from "../types";
import { GameEvent } from "../../mail/delivery";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { basename, resolvePath } from "../../../lib/pathUtils";
import { DirectoryNode, FSNode, isFile, isDirectory } from "../../filesystem/types";
import { HELP_TEXTS } from "./helpTexts";
import { opTouchesProtectedPath } from "../../../story/security";

function buildMoveEvents(srcNode: FSNode, srcPath: string, destPath: string): GameEvent[] {
  const events: GameEvent[] = [];
  const walk = (node: FSNode, oldPath: string, newPath: string) => {
    if (isDirectory(node)) {
      events.push({ type: "directory_created", detail: newPath });
      events.push({ type: "directory_removed", detail: oldPath });
      for (const child of Object.values(node.children)) {
        walk(child, oldPath + "/" + child.name, newPath + "/" + child.name);
      }
    } else {
      events.push({ type: "file_created", detail: newPath });
      events.push({ type: "file_removed", detail: oldPath });
    }
  };
  walk(srcNode, srcPath, destPath);
  return events;
}

const mv: CommandHandler = (args, _flags, ctx) => {
  if (args.length < 2) {
    return { output: "mv: missing operand\nUsage: mv SOURCE DEST" };
  }

  const srcPath = resolvePath(args[0], ctx.cwd, ctx.homeDir);
  let destPath = resolvePath(args[1], ctx.cwd, ctx.homeDir);

  const srcNode = ctx.fs.getNode(srcPath);
  if (!srcNode) {
    return { output: `mv: cannot stat '${args[0]}': No such file or directory`, exitCode: 1 };
  }

  // Reject same-path self-moves before any retargeting (e.g. `mv b b`).
  if (srcPath === destPath) {
    return {
      output: `mv: '${args[0]}' and '${args[1]}' are the same file`,
      exitCode: 1,
    };
  }

  // If dest exists and is a directory, move source inside it
  const destNode = ctx.fs.getNode(destPath);
  if (destNode && isDirectory(destNode)) {
    destPath = destPath + "/" + srcNode.name;
  }

  if (srcPath === destPath) {
    return {
      output: `mv: '${args[0]}' and '${args[1]}' are the same file`,
      exitCode: 1,
    };
  }

  // Refuse to move a directory into itself or a descendant
  if (isDirectory(srcNode) && (destPath === srcPath || destPath.startsWith(srcPath + "/"))) {
    return {
      output: `mv: cannot move '${args[0]}' to a subdirectory of itself, '${args[1]}'`,
      exitCode: 1,
    };
  }

  // If dest already exists at the final retargeted path, decide if overwrite is legal
  const finalDestNode = ctx.fs.getNode(destPath);
  if (finalDestNode) {
    if (isDirectory(srcNode) && isFile(finalDestNode)) {
      return {
        output: `mv: cannot overwrite non-directory '${args[1]}' with directory '${args[0]}'`,
        exitCode: 1,
      };
    }
    if (isDirectory(srcNode) && isDirectory(finalDestNode)) {
      return {
        output: `mv: cannot move '${args[0]}' to '${args[1]}': Directory not empty or already exists`,
        exitCode: 1,
      };
    }
    if (isFile(srcNode) && isDirectory(finalDestNode)) {
      // Shouldn't reach: if dest was a dir, we already retargeted into it.
      return {
        output: `mv: cannot overwrite directory '${args[1]}' with non-directory '${args[0]}'`,
        exitCode: 1,
      };
    }
  }

  const securityViolation = opTouchesProtectedPath(ctx.fs, srcPath, "mv", {
    computerId: ctx.activeComputer,
    homeDir: ctx.homeDir,
    destPath,
  }) ?? undefined;

  // --- File branch ---
  if (isFile(srcNode)) {
    const existedBefore = !!finalDestNode;
    const writeResult = ctx.fs.writeFile(destPath, srcNode.content);
    if (writeResult.error) {
      return { output: writeResult.error, exitCode: 1 };
    }
    const removeResult = writeResult.fs!.removeNode(srcPath);
    if (removeResult.error) {
      return { output: removeResult.error, exitCode: 1 };
    }
    return {
      output: "",
      newFs: removeResult.fs,
      triggerEvents: [
        { type: existedBefore ? "file_modified" : "file_created", detail: destPath },
        { type: "file_removed", detail: srcPath },
      ],
      securityViolation,
    };
  }

  // --- Directory branch ---
  // Rewrite the top-level node's name so it matches its new basename (handles rename).
  const renamed: DirectoryNode = { ...srcNode, name: basename(destPath) };
  const insertResult = ctx.fs.insertNode(destPath, renamed);
  if (insertResult.error) {
    return { output: `mv: ${insertResult.error}`, exitCode: 1 };
  }
  const removeResult = insertResult.fs!.removeNode(srcPath);
  if (removeResult.error) {
    return { output: removeResult.error, exitCode: 1 };
  }
  return {
    output: "",
    newFs: removeResult.fs,
    triggerEvents: buildMoveEvents(srcNode, srcPath, destPath),
    securityViolation,
  };
};

register("mv", mv, "Move or rename files and directories", HELP_TEXTS.mv);
setKnownFlags("mv", {});
