import { CommandHandler } from "../types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { resolvePath } from "../../../lib/pathUtils";
import { isFile, isDirectory, DirectoryNode } from "../../filesystem/types";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { HELP_TEXTS } from "./helpTexts";

function copyDir(
  fs: VirtualFS,
  srcPath: string,
  destPath: string,
  createdPaths: string[],
  modifiedPaths: string[],
  createdDirPaths: string[]
): { fs: VirtualFS; error?: string } {
  const srcNode = fs.getNode(srcPath);
  if (!srcNode || !isDirectory(srcNode)) {
    return { fs, error: `cp: cannot access '${srcPath}': No such file or directory` };
  }
  let currentFs = fs;

  const destNode = currentFs.getNode(destPath);
  if (!destNode) {
    const mk = currentFs.makeDirectory(destPath);
    if (mk.error) {
      return { fs: currentFs, error: mk.error.replace(/^mkdir: /, "cp: ") };
    }
    currentFs = mk.fs!;
    createdDirPaths.push(destPath);
  } else if (!isDirectory(destNode)) {
    return {
      fs: currentFs,
      error: `cp: cannot overwrite non-directory '${destPath}' with directory '${srcPath}'`,
    };
  }

  for (const child of Object.values((srcNode as DirectoryNode).children)) {
    const childSrc = srcPath + "/" + child.name;
    const childDest = destPath + "/" + child.name;
    if (isFile(child)) {
      const existedBefore = !!currentFs.getNode(childDest);
      const result = currentFs.writeFile(childDest, child.content);
      if (result.error) return { fs: currentFs, error: result.error };
      if (result.fs) currentFs = result.fs;
      (existedBefore ? modifiedPaths : createdPaths).push(childDest);
    } else if (isDirectory(child)) {
      const result = copyDir(currentFs, childSrc, childDest, createdPaths, modifiedPaths, createdDirPaths);
      if (result.error) return result;
      currentFs = result.fs;
    }
  }
  return { fs: currentFs };
}

const cp: CommandHandler = (args, flags, ctx) => {
  if (args.length < 2) {
    return { output: "cp: missing operand\nUsage: cp SOURCE DEST" };
  }

  const srcPath = resolvePath(args[0], ctx.cwd, ctx.homeDir);
  let destPath = resolvePath(args[1], ctx.cwd, ctx.homeDir);

  const srcNode = ctx.fs.getNode(srcPath);
  if (!srcNode) {
    return { output: `cp: cannot stat '${args[0]}': No such file or directory`, exitCode: 1 };
  }

  if (!isFile(srcNode)) {
    if (!flags["r"] && !flags["R"]) {
      return { output: `cp: omitting directory '${args[0]}'`, exitCode: 1 };
    }
    // Recursive copy
    const destNode = ctx.fs.getNode(destPath);
    if (destNode && isDirectory(destNode)) {
      destPath = destPath + "/" + srcNode.name;
    }
    const securityViolation = ctx.security?.checkPathOp(ctx.fs, srcPath, "cp", {
      computerId: ctx.activeComputer,
      homeDir: ctx.homeDir,
      destPath,
      command: `cp -r ${args[0]} ${args[1]}`,
    }) ?? undefined;
    const createdPaths: string[] = [];
    const modifiedPaths: string[] = [];
    const createdDirPaths: string[] = [];
    const result = copyDir(ctx.fs, srcPath, destPath, createdPaths, modifiedPaths, createdDirPaths);
    if (result.error) return { output: result.error, exitCode: 1 };
    return {
      output: "",
      newFs: result.fs,
      triggerEvents: [
        ...createdDirPaths.map((p) => ({ type: "directory_created" as const, detail: p })),
        ...createdPaths.map((p) => ({ type: "file_created" as const, detail: p })),
        ...modifiedPaths.map((p) => ({ type: "file_modified" as const, detail: p })),
      ],
      securityViolation,
    };
  }

  // If dest is a directory, copy source into it
  const destNode = ctx.fs.getNode(destPath);
  if (destNode && isDirectory(destNode)) {
    destPath = destPath + "/" + srcNode.name;
  }

  const securityViolation = ctx.security?.checkPathOp(ctx.fs, srcPath, "cp", {
    computerId: ctx.activeComputer,
    homeDir: ctx.homeDir,
    destPath,
    command: `cp ${args[0]} ${args[1]}`,
  }) ?? undefined;

  const existedBefore = !!ctx.fs.getNode(destPath);
  const writeResult = ctx.fs.writeFile(destPath, srcNode.content);
  if (writeResult.error) {
    return { output: writeResult.error, exitCode: 1 };
  }

  return {
    output: "",
    newFs: writeResult.fs,
    triggerEvents: [
      { type: existedBefore ? "file_modified" : "file_created", detail: destPath },
    ],
    securityViolation,
  };
};

register("cp", cp, "Copy files", HELP_TEXTS.cp);
setKnownFlags("cp", { short: ["r", "R"] });
