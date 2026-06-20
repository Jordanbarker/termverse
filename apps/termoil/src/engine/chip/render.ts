import { colorize, ansi } from "@tt/core/lib/ansi";
import { ChipMenuItem } from "./types";

const VERSION = "v0.1.63";

export function renderHeader(width: number): string {
  const title = `Chip ${VERSION}`;
  const welcome = "Welcome!";
  const top = colorize(`\u256D\u2500\u2500\u2500 ${title} ${"─".repeat(Math.max(0, width - title.length - 7))}\u256E`, ansi.cyan);
  const mid = colorize(`\u2502`, ansi.cyan) + colorize(`  ${welcome}`, ansi.brightCyan) + " ".repeat(Math.max(0, width - welcome.length - 4)) + colorize(`\u2502`, ansi.cyan);
  const bot = colorize(`\u2570${"─".repeat(Math.max(0, width - 2))}\u256F`, ansi.cyan);
  return [top, mid, bot].join("\r\n");
}

export function renderSeparator(width: number): string {
  return colorize("╌".repeat(width), ansi.dim);
}

export function renderMenu(
  items: ChipMenuItem[],
  selectedIndex: number,
  prompt: string,
  usedIds?: Set<string>
): string {
  const lines: string[] = prompt ? [prompt] : [];
  for (let i = 0; i < items.length; i++) {
    const marker = i === selectedIndex ? colorize(" \u276F ", ansi.cyan + ansi.bold) : "   ";
    const num = `${i + 1}.`;
    const isUsed = usedIds?.has(items[i].id);
    let label: string;
    if (i === selectedIndex) {
      label = colorize(`${num} ${items[i].label}`, isUsed ? ansi.dim + ansi.bold : ansi.bold);
    } else if (isUsed) {
      label = colorize(`${num} ${items[i].label}`, ansi.dim);
    } else {
      label = `${num} ${items[i].label}`;
    }
    lines.push(`${marker}${label}`);
  }
  return lines.join("\r\n");
}

export function renderHintLine(count: number, expanded: boolean): string {
  const text = expanded
    ? "── hide previous (a) ──"
    : `── ${count} previous topic${count === 1 ? "" : "s"} (a) ──`;
  return colorize(`   ${text}`, ansi.dim);
}

export function renderFooter(width: number): string {
  const border = colorize("─".repeat(width), ansi.dim);
  const status = colorize("\u23F5\u23F5 bypass permissions on", ansi.red);
  return `${border}\r\n${status}`;
}

export function renderUserMessage(text: string): string {
  return colorize(`> ${text}`, ansi.brightWhite + ansi.bold);
}

export function renderChipResponse(text: string, width: number): string {
  return colorize(wordWrap(text, width), ansi.brightCyan);
}

export interface ChipResponseLine {
  line: string;
  isCommand: boolean;
}

export function renderChipResponseLines(
  text: string,
  width: number
): ChipResponseLine[] {
  const wrapped = wordWrap(text, width);
  const rawLines = wrapped.split("\r\n");
  const result: ChipResponseLine[] = [];
  let inCommandBlock = false;

  for (const raw of rawLines) {
    if (raw.startsWith("$")) {
      inCommandBlock = true;
    } else if (raw.trim() === "") {
      inCommandBlock = false;
    }

    result.push({
      line: colorize(raw, ansi.brightCyan),
      isCommand: inCommandBlock,
    });
  }

  return result;
}

function wordWrap(text: string, width: number): string {
  if (width <= 0) return text;
  const paragraphs = text.split("\n");
  const wrapped = paragraphs.map((para) => {
    const indentMatch = para.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : "";
    const effectiveWidth = width - indent.length;
    if (effectiveWidth <= 0) return para;
    const trimmed = para.slice(indent.length);
    const words = trimmed.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      if (current.length + word.length + 1 > effectiveWidth && current.length > 0) {
        lines.push(indent + current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    if (current) lines.push(indent + current);
    return lines.join("\r\n");
  });
  return wrapped.join("\r\n");
}
