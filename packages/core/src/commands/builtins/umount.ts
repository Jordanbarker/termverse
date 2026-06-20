import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { HELP_TEXTS } from "./helpTexts";
import { Mount, normalizeMountKey } from "@tt/core/filesystem/mounts";
import { dir } from "@tt/core/filesystem/builders";
import { basename } from "@tt/core/lib/pathUtils";

function findMount(arg: string, ctx: { mounts?: Record<string, Mount>; cwd: string; homeDir: string }): { key: string; mount: Mount } | null {
  const mounts = ctx.mounts ?? {};

  const asPath = normalizeMountKey(arg, ctx.cwd, ctx.homeDir);
  if (mounts[asPath]) return { key: asPath, mount: mounts[asPath] };

  for (const [key, m] of Object.entries(mounts)) {
    if (m.device === arg) return { key, mount: m };
  }
  return null;
}

const umount: CommandHandler = (args, _flags, ctx) => {
  if (args.length !== 1) {
    return { output: "umount: bad usage\nTry 'umount --help' for more information.", exitCode: 1 };
  }

  const found = findMount(args[0], ctx);
  if (!found) {
    return { output: `umount: ${args[0]}: not mounted`, exitCode: 1 };
  }

  const empty = dir(basename(found.key), {});
  const insertResult = ctx.fs.insertNode(found.key, empty);
  if (insertResult.error || !insertResult.fs) {
    return { output: `umount: ${insertResult.error ?? "failed"}`, exitCode: 1 };
  }

  const mounts = ctx.mounts ?? {};
  const newMounts: Record<string, Mount> = { ...mounts };
  delete newMounts[found.key];

  return {
    output: "",
    newFs: insertResult.fs,
    newMounts,
  };
};

register("umount", umount, "Unmount a filesystem", HELP_TEXTS.umount);
