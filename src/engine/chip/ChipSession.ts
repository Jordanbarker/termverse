import { Terminal } from "@xterm/xterm";
import { VirtualFS } from "../filesystem/VirtualFS";
import { ISession, SessionResult } from "../session/types";
import { ChipSessionInfo, ChipMenuItem, ChipExchange } from "./types";
import { getMenuItems } from "../../story/chip/menuItems";
import { renderTranscript, transcriptFilename } from "./transcript";
import {
  renderHeader,
  renderSeparator,
  renderMenu,
  renderFooter,
  renderHintLine,
  renderUserMessage,
  renderChipResponseLines,
} from "./render";
import { CTRL_C } from "../terminal/keyCodes";
import { GameEvent } from "../mail/delivery";
import {
  CHIP_THINKING_DELAY_MS,
  CHIP_CHAT_LINE_INTERVAL_MS,
  CHIP_COMMAND_LINE_INTERVAL_MS,
  CHIP_MENU_LINE_INTERVAL_MS,
} from "../../lib/timing";

export class ChipSession implements ISession {
  private terminal: Terminal;
  private fs: VirtualFS;
  private homeDir: string;
  private info: ChipSessionInfo;
  private menuItems: ChipMenuItem[];
  private selectedIndex = 0;

  private collectedEvents: GameEvent[] = [];
  private escBuffer = "";
  private menuLineCount = 0;
  private currentPrompt = "How can I help you today?";
  private usedItemIds = new Set<string>();
  private expanded = false;
  private onUsedTopicsChange?: (topics: string[]) => void;

  private transcript: ChipExchange[] = [];
  private sessionStart: Date;
  private getGameNow: () => Date;

  private isAnimating = false;
  private animationTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingAnimationItem: ChipMenuItem | null = null;
  private animationLinesWritten = 0;

  constructor(
    terminal: Terminal,
    fs: VirtualFS,
    homeDir: string,
    info: ChipSessionInfo,
    sessionStart: Date,
    getGameNow: () => Date,
    onUsedTopicsChange?: (topics: string[]) => void
  ) {
    this.terminal = terminal;
    this.fs = fs;
    this.homeDir = homeDir;
    this.info = info;
    this.sessionStart = sessionStart;
    this.getGameNow = getGameNow;
    this.menuItems = getMenuItems(info.storyFlags, info.currentComputer);
    this.onUsedTopicsChange = onUsedTopicsChange;

    const saved = info.storyFlags.used_chip_topics;
    if (typeof saved === "string" && saved) {
      saved.split(",").forEach((id) => this.usedItemIds.add(id));
    }
  }

  enter(): void {
    const width = this.getWidth();
    const header = renderHeader(width);
    const separator = renderSeparator(width);
    const menu = this.buildMenuOutput(this.currentPrompt);
    this.terminal.write(`\x1b[?25l\r\n${header}\r\n${separator}\r\n${menu}`);
  }

  private getVisibleItems(): ChipMenuItem[] {
    if (this.expanded || this.usedItemIds.size === 0) {
      return this.menuItems;
    }
    return this.menuItems.filter(
      (item) => !this.usedItemIds.has(item.id)
    );
  }

  handleInput(data: string): SessionResult | null {
    for (let i = 0; i < data.length; i++) {
      const char = data[i];
      const code = char.charCodeAt(0);

      // During animation, only Ctrl+C is accepted (skip to end)
      if (this.isAnimating) {
        if (code === CTRL_C) {
          this.skipAnimation();
        }
        continue;
      }

      // Handle escape sequences for arrow keys
      if (code === 0x1b) {
        this.escBuffer = "\x1b";
        continue;
      }
      if (this.escBuffer === "\x1b" && char === "[") {
        this.escBuffer = "\x1b[";
        continue;
      }
      if (this.escBuffer.startsWith("\x1b[") && this.escBuffer.length >= 2) {
        // CSI parameter byte — accumulate
        if (char >= "0" && char <= "?") {
          this.escBuffer += char;
          continue;
        }
        // Final byte — act on it, then reset
        this.escBuffer = "";
        if (char === "A" || char === "B") {
          const len = this.getVisibleItems().length;
          if (len > 0) {
            const delta = char === "A" ? -1 : 1;
            this.selectedIndex = ((this.selectedIndex + delta) % len + len) % len;
            this.redrawMenu();
          }
          continue;
        }
        continue;
      }
      this.escBuffer = "";

      // Ctrl+C or q — exit
      if (code === CTRL_C || char === "q") {
        return this.exitSession();
      }

      // a — toggle used items visibility
      if (char === "a") {
        if (this.usedItemIds.size > 0) {
          this.expanded = !this.expanded;
          this.selectedIndex = 0;
          this.redrawMenu();
        }
        continue;
      }

      // Number keys — jump to item
      if (char >= "1" && char <= "9") {
        const idx = parseInt(char, 10) - 1;
        const visibleItems = this.getVisibleItems();
        if (idx < visibleItems.length) {
          this.selectedIndex = idx;
          if (visibleItems[idx].id === "exit") return this.exitSession();
          this.selectCurrent();
        }
        continue;
      }

      // Enter — select current item
      if (char === "\r" || char === "\n") {
        const visibleItems = this.getVisibleItems();
        if (visibleItems[this.selectedIndex].id === "exit") return this.exitSession();
        this.selectCurrent();
      }

    }

    return null;
  }

  private exitSession(): SessionResult {
    const clear = this.buildClearSequence();
    this.terminal.write(clear + "\x1b[?25h");
    return {
      type: "exit",
      newFs: this.flushTranscript(),
      triggerEvents:
        this.collectedEvents.length > 0
          ? this.collectedEvents
          : undefined,
    };
  }

  private flushTranscript(): VirtualFS | undefined {
    if (this.transcript.length === 0) return undefined;
    if (this.info.currentComputer !== "nexacorp") return undefined;

    const filename = transcriptFilename(this.sessionStart);
    const path = `${this.homeDir}/.chip/sessions/${filename}`;
    const content = renderTranscript(
      this.transcript,
      this.sessionStart,
      this.homeDir
    );
    const result = this.fs.writeFile(path, content);
    return result.fs;
  }

  private selectCurrent(): void {
    const visibleItems = this.getVisibleItems();
    const item = visibleItems[this.selectedIndex];

    // Mark as used
    this.usedItemIds.add(item.id);
    this.onUsedTopicsChange?.([...this.usedItemIds]);

    this.transcript.push({ timestamp: this.getGameNow(), role: "user", text: item.label });
    this.transcript.push({ timestamp: this.getGameNow(), role: "chip", text: item.response });

    // Collect trigger events
    if (item.triggerEvents) {
      this.collectedEvents.push(...item.triggerEvents);
    }

    // Refresh menu items
    const usedStr = [...this.usedItemIds].join(",");
    this.info.storyFlags = { ...this.info.storyFlags, used_chip_topics: usedStr };
    this.menuItems = getMenuItems(this.info.storyFlags, this.info.currentComputer);

    // Write clear + user message immediately
    const clear = this.buildClearSequence();
    const userMsg = renderUserMessage(item.label);
    this.terminal.write(`${clear}\r\n${userMsg}\r\n`);
    this.animationLinesWritten = 2; // blank line + user message

    // Start animated response
    this.isAnimating = true;
    this.pendingAnimationItem = item;

    const width = this.getWidth();
    const lines = renderChipResponseLines(item.response, width);

    this.animationTimer = setTimeout(() => {
      this.terminal.write("\r\n");
      this.animationLinesWritten++;
      this.writeLineByLine(lines, 0);
    }, CHIP_THINKING_DELAY_MS);
  }

  private writeLineByLine(
    lines: { line: string; isCommand: boolean }[],
    index: number
  ): void {
    if (!this.isAnimating) return;

    if (index >= lines.length) {
      this.finishResponse();
      return;
    }

    this.terminal.write(lines[index].line + "\r\n");
    this.animationLinesWritten++;

    const nextDelay =
      index + 1 < lines.length && lines[index + 1].isCommand
        ? CHIP_COMMAND_LINE_INTERVAL_MS
        : CHIP_CHAT_LINE_INTERVAL_MS;

    this.animationTimer = setTimeout(() => {
      this.writeLineByLine(lines, index + 1);
    }, nextDelay);
  }

  private skipAnimation(): void {
    if (!this.isAnimating || !this.pendingAnimationItem) return;

    if (this.animationTimer) {
      clearTimeout(this.animationTimer);
      this.animationTimer = null;
    }

    // Clear partially written lines
    const up = this.animationLinesWritten - 1;
    const clearSeq = up > 0 ? `\x1b[${up}A\r\x1b[J` : `\r\x1b[J`;

    const width = this.getWidth();
    const userMsg = renderUserMessage(this.pendingAnimationItem.label);
    const lines = renderChipResponseLines(this.pendingAnimationItem.response, width);
    const fullResponse = lines.map((l) => l.line).join("\r\n");

    this.selectedIndex = 0;
    this.expanded = false;
    this.currentPrompt = "";
    const separator = renderSeparator(width);
    const menu = this.buildMenuOutput(this.currentPrompt);
    this.terminal.write(
      `${clearSeq}\r\n${userMsg}\r\n\r\n${fullResponse}\r\n\r\n${separator}\r\n${menu}`
    );

    this.isAnimating = false;
    this.pendingAnimationItem = null;
    this.animationLinesWritten = 0;
  }

  private finishResponse(): void {
    const width = this.getWidth();
    const separator = renderSeparator(width);
    this.selectedIndex = 0;
    this.expanded = false;
    this.currentPrompt = "";
    const menuLines = this.buildMenuLines(this.currentPrompt);
    const allLines = [separator, ...menuLines];
    this.writeMenuLineByLine(allLines, 0);
  }

  private writeMenuLineByLine(lines: string[], index: number): void {
    if (!this.isAnimating) return;

    if (index >= lines.length) {
      this.isAnimating = false;
      this.pendingAnimationItem = null;
      this.animationTimer = null;
      this.animationLinesWritten = 0;
      return;
    }

    this.terminal.write(`\r\n${lines[index]}`);
    this.animationLinesWritten++;

    this.animationTimer = setTimeout(() => {
      this.writeMenuLineByLine(lines, index + 1);
    }, CHIP_MENU_LINE_INTERVAL_MS);
  }

  private buildMenuLines(prompt: string): string[] {
    const width = this.getWidth();
    const visibleItems = this.getVisibleItems();
    const usedIds = this.expanded ? this.usedItemIds : undefined;
    const menu = renderMenu(visibleItems, this.selectedIndex, prompt, usedIds);
    const footer = renderFooter(width);
    const hasHint = this.usedItemIds.size > 0;
    const hasPrompt = prompt.length > 0;
    this.menuLineCount = visibleItems.length + (hasPrompt ? 1 : 0) + (hasHint ? 1 : 0) + 2;

    const lines: string[] = menu.split("\r\n");
    if (hasHint) {
      lines.push(renderHintLine(this.usedItemIds.size, this.expanded));
    }
    lines.push(...footer.split("\r\n"));
    return lines;
  }

  private buildMenuOutput(prompt: string): string {
    const width = this.getWidth();
    const visibleItems = this.getVisibleItems();
    const usedIds = this.expanded ? this.usedItemIds : undefined;
    const menu = renderMenu(visibleItems, this.selectedIndex, prompt, usedIds);
    const footer = renderFooter(width);
    const hasHint = this.usedItemIds.size > 0;
    // Count lines to move up from last line to first for redraw:
    // items (n) + hint (0 or 1) + border (1) + bypass status (1)
    const hasPrompt = prompt.length > 0;
    this.menuLineCount = visibleItems.length + (hasPrompt ? 1 : 0) + (hasHint ? 1 : 0) + 2;
    if (hasHint) {
      const hint = renderHintLine(this.usedItemIds.size, this.expanded);
      return `${menu}\r\n${hint}\r\n${footer}`;
    }
    return `${menu}\r\n${footer}`;
  }

  private buildClearSequence(): string {
    if (this.menuLineCount > 0) {
      const up = this.menuLineCount - 1;
      const seq = up > 0 ? `\x1b[${up}A\r\x1b[J` : `\r\x1b[J`;
      this.menuLineCount = 0;
      return seq;
    }
    return "";
  }

  private redrawMenu(): void {
    const clear = this.buildClearSequence();
    const menu = this.buildMenuOutput(this.currentPrompt);
    this.terminal.write(clear + menu);
  }

  private getWidth(): number {
    return Math.min(this.terminal.cols, 80);
  }
}
