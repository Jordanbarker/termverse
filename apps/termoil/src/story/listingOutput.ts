/**
 * App-side rendering for the `save`/`load` slot list and the `cheat` checkpoint
 * list. These read termoil save slots + checkpoint definitions, so they live in
 * the story layer and are injected into computeEffects via ApplyContext.
 */
import { colorize, ansi } from "@tt/core/lib/ansi";
import { listSaveSlots, formatSlotName } from "../state/saveManager";
import { CHECKPOINTS } from "./checkpoints";

/** Rendered output for the `listSaves` game action (save slot summary). */
export function renderSavesList(): string {
  const slots = listSaveSlots();
  const lines = [
    colorize("Save Slots:", ansi.bold + ansi.cyan),
    "",
  ];
  for (const slot of slots) {
    const label = formatSlotName(slot.slotId);
    if (slot.empty) {
      const indicator = colorize("○", ansi.dim);
      lines.push(`  ${indicator} ${colorize(label.padEnd(10), ansi.bold)}  ${colorize("(empty)", ansi.dim)}`);
    } else {
      const indicator = colorize("●", ansi.cyan);
      const chapterNum = slot.currentChapter.replace("chapter-", "");
      const chapterLabel = colorize(`Ch. ${chapterNum}`, ansi.dim);
      const date = new Date(slot.timestamp).toLocaleString(undefined, {
        dateStyle: "short",
        timeStyle: "short",
      });
      lines.push(`  ${indicator} ${colorize(label.padEnd(10), ansi.bold)}  ${slot.label}  ${chapterLabel}  ${colorize(date, ansi.dim)}`);
    }
  }
  lines.push("");
  lines.push(`Use ${colorize("save 1|2|3", ansi.cyan)} or ${colorize("load 1|2|3", ansi.cyan)}`);
  return lines.join("\n");
}

/** Rendered output for the `listCheckpoints` game action (cheat checkpoints). */
export function renderCheckpointsList(): string {
  const lines = [
    colorize("Checkpoints:", ansi.bold + ansi.cyan),
    "",
  ];
  for (let i = 0; i < CHECKPOINTS.length; i++) {
    const cp = CHECKPOINTS[i];
    const num = colorize(`${i + 1}.`, ansi.cyan);
    const name = colorize(cp.id.padEnd(12), ansi.bold);
    const desc = colorize(cp.description, ansi.dim);
    lines.push(`  ${num} ${name} ${desc}`);
  }
  lines.push("");
  lines.push(`Use ${colorize("cheat 1|2|3", ansi.cyan)} to load a checkpoint`);
  return lines.join("\n");
}
