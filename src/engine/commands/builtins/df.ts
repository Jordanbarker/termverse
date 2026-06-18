import { CommandHandler } from "../types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { formatSize } from "@tt/core/lib/formatSize";
import { FSNode, isFile, isDirectory } from "@tt/core/filesystem/types";
import { HELP_TEXTS } from "./helpTexts";

function sumFileBytes(node: FSNode): number {
  if (isFile(node)) return node.content.length;
  if (isDirectory(node)) {
    return Object.values(node.children).reduce((sum, child) => sum + sumFileBytes(child), 0);
  }
  return 0;
}

const TOTAL_BYTES: Record<string, number> = {
  home: 512 * 1024 ** 3,       // 512G
  nexacorp: 1024 ** 4,          // 1T
  devcontainer: 50 * 1024 ** 3, // 50G
};

function detectComputer(homeDir: string): string {
  // /home/ren → home, /home/ren.chen → nexacorp or devcontainer
  const username = homeDir.split("/").pop() ?? "";
  return username.includes(".") ? "nexacorp" : "home";
}

const df: CommandHandler = (_args, flags, ctx) => {
  const humanReadable = flags["h"] || flags["human-readable"];
  const used = sumFileBytes(ctx.fs.root);

  let computer = ctx.activeComputer ?? detectComputer(ctx.homeDir);
  if (computer === "devcontainer") computer = "devcontainer";
  const total = TOTAL_BYTES[computer] ?? TOTAL_BYTES.nexacorp;
  const avail = total - used;
  const usePercent = total > 0 ? Math.max(1, Math.round((used / total) * 100)) : 0;

  const fmt = (n: number) => formatSize(n, humanReadable);

  const device = ctx.devices?.rootDevice()?.devicePath ?? "/dev/sda1";

  const header = "Filesystem      Size  Used Avail Use% Mounted on";
  const row = [
    device.padEnd(16),
    fmt(total).padStart(4),
    fmt(used).padStart(5),
    fmt(avail).padStart(5),
    `${usePercent}%`.padStart(4),
    " /",
  ].join(" ");

  return { output: `${header}\n${row}` };
};

register("df", df, "Report filesystem disk space usage", HELP_TEXTS.df);
setKnownFlags("df", { short: ["h"], long: ["human-readable"] });
