import { Terminal } from "@xterm/xterm";
import { ISession, SessionResult } from "../session/types";
import { stripAnsi } from "../../lib/ansi";
import { parsePagerInput, PagerAction } from "./keymap";
import { render } from "./render";
import { LessSessionInfo } from "./types";
import type { MachineId } from "@tt/core/machine";

interface LessState {
  lines: string[];
  topLine: number;
  mode: "view" | "search" | "help";
  searchInputBuffer: string;
  searchDirection: "fwd" | "back";
  searchPattern: string;
  searchHits: number[];
  currentHitIdx: number;
}

export class LessSession implements ISession {
  private terminal: Terminal;
  private filename: string | null;
  private state: LessState;
  private transitionAfterClose: MachineId | undefined;

  constructor(terminal: Terminal, info: LessSessionInfo) {
    this.terminal = terminal;
    this.filename = info.filename;
    this.transitionAfterClose = info.transitionAfterClose;
    const content = info.content;
    const lines = content === "" ? [] : content.split("\n");
    if (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }
    this.state = {
      lines,
      topLine: 0,
      mode: "view",
      searchInputBuffer: "",
      searchDirection: "fwd",
      searchPattern: "",
      searchHits: [],
      currentHitIdx: -1,
    };
  }

  enter(): void {
    this.terminal.write("\x1b[?1049h\x1b[?25l");
    this.draw();
  }

  resize(): void {
    this.clampTopLine();
    this.draw();
  }

  canClose(): boolean {
    return true;
  }

  handleInput(data: string): SessionResult {
    const actions = parsePagerInput(data);

    for (const action of actions) {
      if (this.state.mode === "help") {
        this.state.mode = "view";
        this.draw();
        continue;
      }
      if (this.state.mode === "search") {
        const result = this.handleSearchAction(action);
        if (result) return result;
        continue;
      }
      const result = this.handleViewAction(action);
      if (result) return result;
    }
    return { type: "continue" };
  }

  private handleViewAction(action: PagerAction): SessionResult | null {
    switch (action.type) {
      case "arrowDown":
      case "enter":
        this.scrollBy(1);
        break;
      case "arrowUp":
        this.scrollBy(-1);
        break;
      case "pageDown":
        this.scrollBy(this.viewportRows());
        break;
      case "pageUp":
        this.scrollBy(-this.viewportRows());
        break;
      case "home":
        this.state.topLine = 0;
        this.draw();
        break;
      case "end":
        this.scrollToBottom();
        break;
      case "ctrlC":
        return this.exit();
      case "ctrlL":
        this.draw();
        break;
      case "escape":
        break;
      case "char": {
        const ch = action.ch;
        if (ch === "q") return this.exit();
        if (ch === "j") this.scrollBy(1);
        else if (ch === "k") this.scrollBy(-1);
        else if (ch === " " || ch === "f") this.scrollBy(this.viewportRows());
        else if (ch === "b") this.scrollBy(-this.viewportRows());
        else if (ch === "g") {
          this.state.topLine = 0;
          this.draw();
        } else if (ch === "G") {
          this.scrollToBottom();
        } else if (ch === "/") {
          this.beginSearch("fwd");
        } else if (ch === "?") {
          this.beginSearch("back");
        } else if (ch === "n") {
          this.advanceMatch(this.state.searchDirection);
        } else if (ch === "N") {
          this.advanceMatch(this.state.searchDirection === "fwd" ? "back" : "fwd");
        } else if (ch === "h") {
          this.state.mode = "help";
          this.draw();
        }
        break;
      }
      default:
        break;
    }
    return null;
  }

  private handleSearchAction(action: PagerAction): SessionResult | null {
    switch (action.type) {
      case "enter":
        this.commitSearch();
        break;
      case "escape":
      case "ctrlC":
        this.cancelSearch();
        break;
      case "backspace":
        this.state.searchInputBuffer = this.state.searchInputBuffer.slice(0, -1);
        this.draw();
        break;
      case "ctrlL":
        this.draw();
        break;
      case "char":
        this.state.searchInputBuffer += action.ch;
        this.draw();
        break;
      default:
        break;
    }
    return null;
  }

  private beginSearch(direction: "fwd" | "back"): void {
    this.state.mode = "search";
    this.state.searchDirection = direction;
    this.state.searchInputBuffer = "";
    this.draw();
  }

  private cancelSearch(): void {
    this.state.mode = "view";
    this.state.searchInputBuffer = "";
    this.draw();
  }

  private commitSearch(): void {
    const pattern = this.state.searchInputBuffer;
    this.state.mode = "view";
    if (pattern === "") {
      this.state.searchInputBuffer = "";
      this.draw();
      return;
    }
    this.state.searchPattern = pattern;
    this.state.searchHits = this.buildHits(pattern);
    this.state.searchInputBuffer = "";
    this.jumpToInitialHit();
    this.draw();
  }

  private buildHits(pattern: string): number[] {
    const hits: number[] = [];
    for (let i = 0; i < this.state.lines.length; i++) {
      if (stripAnsi(this.state.lines[i]).includes(pattern)) {
        hits.push(i);
      }
    }
    return hits;
  }

  private jumpToInitialHit(): void {
    const hits = this.state.searchHits;
    if (hits.length === 0) {
      this.state.currentHitIdx = -1;
      return;
    }
    const viewportRows = this.viewportRows();
    const bottom = this.state.topLine + viewportRows - 1;
    let idx: number;
    if (this.state.searchDirection === "fwd") {
      const found = hits.findIndex((h) => h >= this.state.topLine);
      idx = found === -1 ? 0 : found;
    } else {
      idx = 0;
      for (let i = 0; i < hits.length; i++) {
        if (hits[i] <= bottom) idx = i;
        else break;
      }
    }
    this.state.currentHitIdx = idx;
    this.jumpTo(hits[idx]);
  }

  private advanceMatch(direction: "fwd" | "back"): void {
    const hits = this.state.searchHits;
    if (hits.length === 0) return;
    let idx = this.state.currentHitIdx;
    if (idx === -1) idx = 0;
    else if (direction === "fwd") idx = (idx + 1) % hits.length;
    else idx = (idx - 1 + hits.length) % hits.length;
    this.state.currentHitIdx = idx;
    this.jumpTo(hits[idx]);
    this.draw();
  }

  private jumpTo(lineIdx: number): void {
    const viewportRows = this.viewportRows();
    if (lineIdx >= this.state.topLine && lineIdx <= this.state.topLine + viewportRows - 1) {
      return;
    }
    this.state.topLine = lineIdx;
    this.clampTopLine();
  }

  private scrollBy(delta: number): void {
    this.state.topLine += delta;
    this.clampTopLine();
    this.draw();
  }

  private scrollToBottom(): void {
    this.state.topLine = Math.max(0, this.state.lines.length - this.viewportRows());
    this.draw();
  }

  private clampTopLine(): void {
    const max = Math.max(0, this.state.lines.length - this.viewportRows());
    if (this.state.topLine > max) this.state.topLine = max;
    if (this.state.topLine < 0) this.state.topLine = 0;
  }

  private viewportRows(): number {
    return Math.max(1, this.terminal.rows - 1);
  }

  private draw(): void {
    render(this.terminal, {
      lines: this.state.lines,
      topLine: this.state.topLine,
      mode: this.state.mode,
      searchInputBuffer: this.state.searchInputBuffer,
      searchDirection: this.state.searchDirection,
      searchPattern: this.state.searchPattern,
      filename: this.filename,
    });
  }

  private exit(): SessionResult {
    this.terminal.write("\x1b[?25h\x1b[?1049l");
    return this.transitionAfterClose
      ? { type: "exit", transitionTo: this.transitionAfterClose }
      : { type: "exit" };
  }
}
