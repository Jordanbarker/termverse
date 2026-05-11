import { Terminal } from "@xterm/xterm";
import { SnowflakeState } from "../state";
import { SessionContext } from "./context";
import { execute } from "../executor/executor";
import { formatResultSet, formatStatusMessage, formatError } from "../formatter/table_formatter";
import { colorize, ansi } from "../../../lib/ansi";
import { isBackspace, isPrintable, CTRL_C, CTRL_D } from "../../terminal/keyCodes";
import { findPrevWordBoundary, findNextWordBoundary } from "../../terminal/wordBoundary";
import { ISession, SessionResult } from "../../session/types";
import { GameEvent } from "../../mail/delivery";

/**
 * Interactive Snowflake CLI SQL REPL session.
 * Runs inline (not alt screen buffer) — accumulates SQL input until `;`,
 * then executes and renders results.
 */
export class SnowSqlSession implements ISession {
  private inputBuffer = "";
  private cursorPos = 0;
  private escBuffer = "";
  private history: string[] = [];
  private historyIndex = -1;
  private savedInput = "";
  private context: SessionContext;
  private state: SnowflakeState;
  private terminal: Terminal;
  private onStateChange: (state: SnowflakeState) => void;
  private onReleaseLock?: () => void;
  private getGameNow?: () => Date;
  private pendingEvents: GameEvent[] = [];
  private queriedCampaign = false;

  constructor(
    terminal: Terminal,
    state: SnowflakeState,
    context: SessionContext,
    onStateChange: (state: SnowflakeState) => void,
    onReleaseLock?: () => void,
    getGameNow?: () => Date
  ) {
    this.terminal = terminal;
    this.state = state;
    this.context = context;
    this.onStateChange = onStateChange;
    this.onReleaseLock = onReleaseLock;
    this.getGameNow = getGameNow;
  }

  canClose(): boolean {
    this.onReleaseLock?.();
    return true;
  }

  enter(): void {
    const lines = [
      "",
      colorize("Snowflake CLI v3.4.0", ansi.cyan + ansi.bold),
      colorize("Type SQL statements (ending with ;) or 'exit' to quit.", ansi.dim),
      "",
    ];
    this.terminal.write(lines.join("\r\n"));
    this.writePrompt();
  }

  handleInput(data: string): SessionResult {
    for (let i = 0; i < data.length; i++) {
      const char = data[i];
      const code = char.charCodeAt(0);

      // Escape sequence buffering (arrow keys, modifier sequences, ESC+DEL)
      if (code === 0x1b) {
        this.escBuffer = "\x1b";
        continue;
      }
      if (this.escBuffer === "\x1b") {
        if (char === "[") {
          this.escBuffer = "\x1b[";
          continue;
        }
        // ESC + DEL = Ctrl+Backspace
        if (code === 127) {
          this.escBuffer = "";
          this.deleteWordBackward();
          continue;
        }
        // Unknown ESC sequence — drop silently
        this.escBuffer = "";
        continue;
      }
      if (this.escBuffer.startsWith("\x1b[")) {
        // CSI parameter byte — accumulate
        if (char >= "0" && char <= "?") {
          this.escBuffer += char;
          continue;
        }
        // Final byte — extract params BEFORE resetting buffer
        const params = this.escBuffer.slice(2);
        this.escBuffer = "";
        const parts = params.split(";");
        const keyCode = parts[0] ? parseInt(parts[0], 10) : 0;
        const modifier = parts.length > 1 ? parseInt(parts[1], 10) : 0;
        const isWordSkip = modifier === 3 || modifier === 5;

        if (char === "A") {
          this.historyUp();
        } else if (char === "B") {
          this.historyDown();
        } else if (char === "C") {
          if (isWordSkip) {
            this.cursorWordRight();
          } else if (this.cursorPos < this.inputBuffer.length) {
            this.cursorPos++;
            this.terminal.write("\x1b[C");
          }
        } else if (char === "D") {
          if (isWordSkip) {
            this.cursorWordLeft();
          } else if (this.cursorPos > 0) {
            this.cursorPos--;
            this.terminal.write("\x1b[D");
          }
        } else if (char === "~" && keyCode === 3) {
          if (isWordSkip) this.deleteWordForward();
          else this.deleteForward();
        }
        continue;
      }

      if (code === CTRL_D && this.inputBuffer.length === 0) {
        this.terminal.write("\r\n");
        return { type: "exit", newState: this.state, triggerEvents: this.pendingEvents.length ? this.pendingEvents : undefined };
      }

      if (char === "\r" || char === "\n") {
        this.terminal.write("\r\n");
        const trimmed = this.inputBuffer.trim();
        const meta = trimmed.replace(/;+$/, "").toLowerCase();

        if (meta === "quit" || meta === "exit") {
          return { type: "exit", newState: this.state, triggerEvents: this.pendingEvents.length ? this.pendingEvents : undefined };
        }

        if (meta === "settings") {
          this.showSettings();
          this.resetInput();
          this.writePrompt();
          continue;
        }

        if (meta === "help") {
          this.showHelp();
          this.resetInput();
          this.writePrompt();
          continue;
        }

        // Check if input ends with semicolon
        if (trimmed.endsWith(";")) {
          const sql = trimmed.slice(0, -1).trim();
          if (sql) {
            this.history.push(this.inputBuffer.trim());
            this.executeSql(sql);
          }
          this.resetInput();
          this.writePrompt();
        } else if (trimmed === "") {
          this.resetInput();
          this.writePrompt();
        } else {
          // Multi-line input — show continuation prompt
          this.inputBuffer += "\n";
          this.cursorPos = this.inputBuffer.length;
          this.writeContinuationPrompt();
        }
      } else if (code === 23) {
        // Ctrl+W — delete previous word
        this.deleteWordBackward();
      } else if (isBackspace(code)) {
        if (this.cursorPos > 0) {
          const before = this.inputBuffer.slice(0, this.cursorPos - 1);
          const after = this.inputBuffer.slice(this.cursorPos);
          this.inputBuffer = before + after;
          this.cursorPos--;
          // Move back, write remaining chars + space to erase last char, move cursor back
          this.terminal.write("\b" + after + " " + "\x1b[" + (after.length + 1) + "D");
        }
      } else if (code === CTRL_C) {
        this.terminal.write("^C\r\n");
        this.resetInput();
        this.writePrompt();
      } else if (isPrintable(code)) {
        const before = this.inputBuffer.slice(0, this.cursorPos);
        const after = this.inputBuffer.slice(this.cursorPos);
        this.inputBuffer = before + char + after;
        this.cursorPos++;
        this.terminal.write(char + after);
        if (after.length > 0) {
          this.terminal.write("\x1b[" + after.length + "D");
        }
      }
    }

    return { type: "continue" };
  }

  private resetInput(): void {
    this.inputBuffer = "";
    this.cursorPos = 0;
    this.historyIndex = -1;
    this.savedInput = "";
  }

  private replaceInput(newInput: string): void {
    const currentLineCount = (this.inputBuffer.match(/\n/g) || []).length + 1;

    // Move up to the first input line
    if (currentLineCount > 1) {
      this.terminal.write(`\x1b[${currentLineCount - 1}A`);
    }

    // Clear from start of line to end of screen, then rewrite prompt
    this.terminal.write("\r\x1b[J");
    this.writePrompt();

    // Write new input with continuation prompts for each line
    const lines = newInput.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) {
        this.terminal.write("\r\n");
        this.writeContinuationPrompt();
      }
      this.terminal.write(lines[i]);
    }

    this.inputBuffer = newInput;
    this.cursorPos = newInput.length;
  }

  private historyUp(): void {
    if (this.history.length === 0) return;
    if (this.historyIndex === -1) {
      this.savedInput = this.inputBuffer;
      this.historyIndex = this.history.length - 1;
    } else if (this.historyIndex > 0) {
      this.historyIndex--;
    } else {
      return;
    }
    this.replaceInput(this.history[this.historyIndex]);
  }

  private historyDown(): void {
    if (this.historyIndex === -1) return;
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.replaceInput(this.history[this.historyIndex]);
    } else {
      this.historyIndex = -1;
      this.replaceInput(this.savedInput);
    }
  }

  private deleteForward(): void {
    if (this.cursorPos >= this.inputBuffer.length) return;
    const before = this.inputBuffer.slice(0, this.cursorPos);
    const after = this.inputBuffer.slice(this.cursorPos + 1);
    this.inputBuffer = before + after;
    this.terminal.write(after + " " + `\x1b[${after.length + 1}D`);
  }

  private deleteWordBackward(): void {
    if (this.cursorPos === 0) return;
    const newPos = findPrevWordBoundary(this.inputBuffer, this.cursorPos);
    const delta = this.cursorPos - newPos;
    if (delta === 0) return;
    const after = this.inputBuffer.slice(this.cursorPos);
    this.inputBuffer = this.inputBuffer.slice(0, newPos) + after;
    this.cursorPos = newPos;
    this.terminal.write(`\x1b[${delta}D` + after + " ".repeat(delta) + `\x1b[${after.length + delta}D`);
  }

  private deleteWordForward(): void {
    if (this.cursorPos >= this.inputBuffer.length) return;
    const endPos = findNextWordBoundary(this.inputBuffer, this.cursorPos);
    const delta = endPos - this.cursorPos;
    if (delta === 0) return;
    const after = this.inputBuffer.slice(endPos);
    this.inputBuffer = this.inputBuffer.slice(0, this.cursorPos) + after;
    this.terminal.write(after + " ".repeat(delta) + `\x1b[${after.length + delta}D`);
  }

  private cursorWordLeft(): void {
    if (this.cursorPos === 0) return;
    const newPos = findPrevWordBoundary(this.inputBuffer, this.cursorPos);
    const delta = this.cursorPos - newPos;
    if (delta > 0) {
      this.cursorPos = newPos;
      this.terminal.write(`\x1b[${delta}D`);
    }
  }

  private cursorWordRight(): void {
    if (this.cursorPos >= this.inputBuffer.length) return;
    const newPos = findNextWordBoundary(this.inputBuffer, this.cursorPos);
    const delta = newPos - this.cursorPos;
    if (delta > 0) {
      this.cursorPos = newPos;
      this.terminal.write(`\x1b[${delta}C`);
    }
  }

  private executeSql(sql: string): void {
    const start = performance.now();
    // Refresh gameNow per statement so the REPL clock tracks story progression
    // (e.g. Piper messages arriving while the REPL is open).
    const ctx = this.getGameNow
      ? { ...this.context, gameNow: this.getGameNow() }
      : this.context;
    const { results, state, context } = execute(sql, this.state, ctx);
    const elapsed = (performance.now() - start) / 1000;

    this.state = state;
    this.context = context;
    this.onStateChange(state);

    if (!this.queriedCampaign && /campaign_metrics/i.test(sql)) {
      this.queriedCampaign = true;
      this.pendingEvents.push({ type: "command_executed", detail: "queried_campaign_metrics" });
    }

    for (const result of results) {
      let output: string;
      switch (result.type) {
        case "resultset":
          output = formatResultSet(result.data, elapsed);
          break;
        case "status":
          output = formatStatusMessage(result.data, elapsed);
          break;
        case "error":
          output = formatError(result.message);
          break;
      }
      this.terminal.write(output.replace(/\n/g, "\r\n") + "\r\n");
    }

    // Discoverability hint: bare SHOW TABLES against an empty schema.
    // RAW_NEXACORP holds the seeded tables; ANALYTICS is the dbt target and lands empty for new players.
    if (
      /^\s*show\s+tables\s*$/i.test(sql) &&
      results.length === 1 &&
      results[0].type === "resultset" &&
      results[0].data.rowCount === 0
    ) {
      const hint = colorize(
        "Hint: this schema has no tables. Try `SHOW TABLES IN ACCOUNT;` or `SHOW SCHEMAS;`.",
        ansi.dim
      );
      this.terminal.write(hint + "\r\n");
    }
  }

  private showHelp(): void {
    const lines = [
      colorize("Snowflake CLI Help", ansi.bold + ansi.yellow),
      "",
      colorize("Commands:", ansi.bold),
      `  ${colorize("help", ansi.cyan)}        Show this help message`,
      `  ${colorize("settings", ansi.cyan)}    Show current session settings`,
      `  ${colorize("exit", ansi.cyan)}        Exit Snowflake CLI (also: quit, Ctrl+D)`,
      "",
      colorize("SQL Statements:", ansi.bold),
      `  End SQL statements with ${colorize(";", ansi.cyan)} to execute`,
      `  ${colorize("SELECT", ansi.cyan)}     Query data from tables`,
      `  ${colorize("SHOW", ansi.cyan)}       List databases, schemas, or tables`,
      `  ${colorize("DESCRIBE", ansi.cyan)}   Show table structure`,
      `  ${colorize("USE", ansi.cyan)}        Switch database or schema`,
      "",
      colorize("Examples:", ansi.bold),
      `  SHOW DATABASES;`,
      `  SHOW SCHEMAS;`,
      `  SHOW TABLES;                       -- current schema`,
      `  SHOW TABLES IN ACCOUNT;            -- every table you can read`,
      `  SHOW TABLES IN SCHEMA RAW_NEXACORP;`,
      `  USE SCHEMA RAW_NEXACORP;`,
      `  SELECT * FROM employees LIMIT 10;`,
    ];
    this.terminal.write(lines.join("\r\n") + "\r\n");
  }

  private showSettings(): void {
    const lines = [
      colorize("Session Settings:", ansi.bold + ansi.yellow),
      `  database    = ${colorize(this.context.currentDatabase, ansi.cyan)}`,
      `  schema      = ${colorize(this.context.currentSchema, ansi.cyan)}`,
      `  warehouse   = ${colorize(this.context.currentWarehouse, ansi.cyan)}`,
      `  role        = ${colorize(this.context.currentRole, ansi.cyan)}`,
      `  user        = ${colorize(this.context.currentUser, ansi.cyan)}`,
    ];
    this.terminal.write(lines.join("\r\n") + "\r\n");
  }

  private writePrompt(): void {
    const prompt = `${colorize(this.context.currentDatabase + "." + this.context.currentSchema, ansi.cyan)}${colorize(">", ansi.bold)} `;
    this.terminal.write(prompt);
  }

  private writeContinuationPrompt(): void {
    const spaces = " ".repeat(this.context.currentDatabase.length + this.context.currentSchema.length + 1);
    this.terminal.write(`${colorize(spaces, ansi.dim)}${colorize(">", ansi.bold)} `);
  }
}
