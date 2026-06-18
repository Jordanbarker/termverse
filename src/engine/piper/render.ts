import { colorize, ansi } from "@tt/core/lib/ansi";
import { PiperMessage, PiperReplyOption } from "./types";

export function renderPiperHeader(title: string, width: number, description?: string): string {
  const top = colorize(`\u256D\u2500\u2500\u2500 ${title} ${"─".repeat(Math.max(0, width - title.length - 7))}\u256E`, ansi.magenta);
  const bot = colorize(`\u2570${"─".repeat(Math.max(0, width - 2))}\u256F`, ansi.magenta);
  if (description) {
    const descLine = colorize(`\u2502`, ansi.magenta) + colorize(`  ${description}`, ansi.dim) + " ".repeat(Math.max(0, width - description.length - 4)) + colorize(`\u2502`, ansi.magenta);
    return [top, descLine, bot].join("\r\n");
  }
  return [top, bot].join("\r\n");
}

export function renderChannelList(
  channels: { name: string; type: "channel" | "dm"; unread: number }[],
  selectedIndex: number,
  _width: number
): string {
  const lines: string[] = [];

  // Separate channels and DMs
  const channelItems = channels.filter((c) => c.type === "channel");
  const dmItems = channels.filter((c) => c.type === "dm");

  let globalIdx = 0;

  if (channelItems.length > 0) {
    lines.push(colorize("  Channels", ansi.dim));
    for (const ch of channelItems) {
      const marker = globalIdx === selectedIndex ? colorize(" \u276F ", ansi.magenta + ansi.bold) : "   ";
      const num = `${globalIdx + 1}.`;
      const badge = ch.unread > 0 ? colorize(` (${ch.unread} new)`, ansi.yellow) : "";
      const label = globalIdx === selectedIndex
        ? colorize(`${num} ${ch.name}`, ansi.bold) + badge
        : `${num} ${ch.name}${badge}`;
      lines.push(`${marker}${label}`);
      globalIdx++;
    }
  }

  if (dmItems.length > 0) {
    lines.push("");
    lines.push(colorize("  Direct Messages", ansi.dim));
    for (const ch of dmItems) {
      const marker = globalIdx === selectedIndex ? colorize(" \u276F ", ansi.magenta + ansi.bold) : "   ";
      const num = `${globalIdx + 1}.`;
      const badge = ch.unread > 0 ? colorize(` (${ch.unread} new)`, ansi.yellow) : "";
      const label = globalIdx === selectedIndex
        ? colorize(`${num} ${ch.name}`, ansi.bold) + badge
        : `${num} ${ch.name}${badge}`;
      lines.push(`${marker}${label}`);
      globalIdx++;
    }
  }

  return lines.join("\r\n");
}

export function renderNewMessagesDivider(width: number): string {
  const label = " NEW ";
  const totalDashes = Math.max(0, width - label.length);
  const left = Math.floor(totalDashes / 2);
  const right = totalDashes - left;
  return colorize(`${"─".repeat(left)}${label}${"─".repeat(right)}`, ansi.red);
}

export function renderConversation(messages: PiperMessage[], width: number, unreadCount = 0): string {
  const lines: string[] = [];

  // Find divider insertion point: count NPC messages from end to locate boundary
  let dividerBeforeIndex = -1;
  if (unreadCount > 0) {
    let npcCount = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (!messages[i].isPlayer) {
        npcCount++;
        if (npcCount === unreadCount) {
          dividerBeforeIndex = i;
          break;
        }
      }
    }
  }

  for (let i = 0; i < messages.length; i++) {
    if (i === dividerBeforeIndex) {
      lines.push("");
      lines.push(renderNewMessagesDivider(width));
    }

    const msg = messages[i];
    if (msg.isPlayer) {
      // Player messages: right-aligned style
      const wrapped = wordWrap(msg.body, width - 4);
      lines.push("");
      lines.push(colorize(`  ${wrapped.split("\r\n").join("\r\n  ")}`, ansi.brightWhite + ansi.bold));
    } else {
      // NPC messages: name + timestamp header, then body
      const header = msg.timestamp
        ? `  ${colorize(msg.from, ansi.bold)}${colorize(`  ${msg.timestamp}`, ansi.dim)}`
        : `  ${colorize(msg.from, ansi.bold)}`;
      lines.push("");
      lines.push(header);
      const wrapped = wordWrap(msg.body, width - 4);
      for (const line of wrapped.split("\r\n")) {
        lines.push(`  ${line}`);
      }
    }
  }

  return lines.join("\r\n");
}

export function renderReplyMenu(
  options: PiperReplyOption[],
  selectedIndex: number
): string {
  const lines: string[] = [];
  for (let i = 0; i < options.length; i++) {
    const marker = i === selectedIndex ? colorize(" \u276F ", ansi.magenta + ansi.bold) : "   ";
    const num = `${i + 1}.`;
    const label = i === selectedIndex
      ? colorize(`${num} ${options[i].label}`, ansi.bold)
      : `${num} ${options[i].label}`;
    lines.push(`${marker}${label}`);
  }
  return lines.join("\r\n");
}

export function renderTypingIndicator(name: string): string {
  return colorize(`  ${name} is typing...`, ansi.dim);
}

export function renderSeparator(width: number): string {
  return colorize("╌".repeat(width), ansi.dim);
}

export function renderChannelListFooter(width: number, digitBuffer = ""): string {
  const border = colorize("─".repeat(width), ansi.dim);
  const base = " \u2191/\u2193 navigate  Enter select  q exit";
  const hints = digitBuffer
    ? colorize(base, ansi.dim) + colorize(`  [${digitBuffer}_]`, ansi.magenta + ansi.bold)
    : colorize(base, ansi.dim);
  return `${border}\r\n${hints}`;
}

export function renderConversationFooter(width: number, hasReply: boolean, canScroll = false, digitBuffer = ""): string {
  const border = colorize("─".repeat(width), ansi.dim);
  const base = hasReply
    ? " \u2191/\u2193 navigate  Enter reply  q back"
    : canScroll
      ? " \u2191/\u2193 scroll  q back"
      : " q back";
  const hints = digitBuffer && hasReply
    ? colorize(base, ansi.dim) + colorize(`  [${digitBuffer}_]`, ansi.magenta + ansi.bold)
    : colorize(base, ansi.dim);
  return `${border}\r\n${hints}`;
}

export function renderScrollIndicator(width: number): string {
  const text = " ↑ more messages";
  const padding = Math.max(0, width - text.length);
  return colorize(text + " ".repeat(padding), ansi.dim);
}

function wordWrap(text: string, width: number): string {
  if (width <= 0) return text;
  const paragraphs = text.split("\n");
  const wrapped = paragraphs.map((para) => {
    // Don't wrap lines that start with spaces (pre-formatted)
    if (para.startsWith("  ")) return para;
    const words = para.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      if (current.length + word.length + 1 > width && current.length > 0) {
        lines.push(current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    if (current) lines.push(current);
    return lines.join("\r\n");
  });
  return wrapped.join("\r\n");
}
