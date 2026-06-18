import { Terminal } from "@xterm/xterm";
import { getPyodide, PyodideInterface } from "./pyodideLoader";
import { colorize, ansi } from "../../lib/ansi";
import { isBackspace, isPrintable, CTRL_C, CTRL_D } from "@tt/core/terminal/keyCodes";
import { ISession, SessionResult } from "../session/types";

export class PythonReplSession implements ISession {
  private terminal: Terminal;
  private pyodide: PyodideInterface | null = null;
  private lineBuffer = "";

  constructor(terminal: Terminal) {
    this.terminal = terminal;
  }

  async enter(): Promise<void> {
    this.terminal.write(colorize("Loading Python runtime...", ansi.dim) + "\r\n");
    try {
      this.pyodide = await getPyodide();
      this.terminal.write(
        `Python ${this.pyodide.version} (Pyodide)\r\n` +
        `Type "exit()" or press Ctrl+D to exit.\r\n` +
        ">>> "
      );
    } catch {
      this.terminal.write(
        colorize("Failed to load Python runtime. Check your internet connection.", ansi.red) + "\r\n"
      );
      // Signal exit so useTerminal cleans up
      this.pyodide = null;
    }
  }

  isReady(): boolean {
    return this.pyodide !== null;
  }

  handleInput(data: string): SessionResult {
    if (!this.pyodide) return { type: "exit" };

    for (let i = 0; i < data.length; i++) {
      const char = data[i];
      const code = char.charCodeAt(0);

      if (code === CTRL_D) {
        this.terminal.write("\r\n");
        return { type: "exit" };
      }

      if (code === CTRL_C) {
        this.lineBuffer = "";
        this.terminal.write("^C\r\n>>> ");
        continue;
      }

      if (char === "\r" || char === "\n") {
        this.terminal.write("\r\n");
        const line = this.lineBuffer;
        this.lineBuffer = "";

        if (line === "exit()" || line === "quit()") {
          return { type: "exit" };
        }

        if (line.trim()) {
          this.executeLine(line);
        }

        this.terminal.write(">>> ");
        continue;
      }

      if (isBackspace(code)) {
        if (this.lineBuffer.length > 0) {
          this.lineBuffer = this.lineBuffer.slice(0, -1);
          this.terminal.write("\b \b");
        }
        continue;
      }

      if (isPrintable(code)) {
        this.lineBuffer += char;
        this.terminal.write(char);
      }
    }

    return { type: "continue" };
  }

  private executeLine(code: string): void {
    if (!this.pyodide) return;

    let output = "";
    this.pyodide.setStdout({
      batched: (text: string) => {
        output += text + "\n";
      },
    });
    this.pyodide.setStderr({
      batched: (text: string) => {
        output += text + "\n";
      },
    });

    try {
      const result = this.pyodide.runPython(code);
      if (output) {
        this.terminal.write(output.replace(/\n$/, "").replace(/\n/g, "\r\n") + "\r\n");
      } else if (result !== undefined && result !== null) {
        const repr = String(result);
        this.terminal.write(repr + "\r\n");
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // Check for SystemExit — treat as normal exit request
      if (errMsg.includes("SystemExit")) {
        return;
      }
      // Show last line of traceback for cleanliness
      const lines = errMsg.split("\n").filter((l) => l.trim());
      const lastLine = lines[lines.length - 1] || errMsg;
      this.terminal.write(colorize(lastLine, ansi.red) + "\r\n");
    }
  }
}
