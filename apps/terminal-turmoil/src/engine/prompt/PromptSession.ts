import { Terminal } from "@xterm/xterm";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { PromptSessionInfo } from "./types";
import { getSentDir } from "../mail/mailUtils";
import { colorize, ansi } from "@tt/core/lib/ansi";
import { isBackspace, CTRL_C } from "@tt/core/terminal/keyCodes";
import { ISession, SessionResult } from "@tt/core/session/types";

export class PromptSession implements ISession {
  private terminal: Terminal;
  private info: PromptSessionInfo;
  private fs: VirtualFS;
  private username: string;
  private inputBuffer = "";

  constructor(
    terminal: Terminal,
    info: PromptSessionInfo,
    fs: VirtualFS,
    username: string
  ) {
    this.terminal = terminal;
    this.info = info;
    this.fs = fs;
    this.username = username;
  }

  enter(): void {
    this.terminal.write(`\r\n${this.info.promptText}`);
  }

  handleInput(data: string): SessionResult | null {
    for (let i = 0; i < data.length; i++) {
      const char = data[i];
      const code = char.charCodeAt(0);

      // Ctrl+C — cancel
      if (code === CTRL_C) {
        this.terminal.write("^C");
        return { type: "exit" };
      }

      // Enter — validate and resolve
      if (char === "\r" || char === "\n") {
        this.terminal.write("\r\n");

        if (this.inputBuffer === "") {
          this.terminal.write(this.info.promptText);
          continue;
        }

        const num = parseInt(this.inputBuffer, 10);
        if (isNaN(num) || num < 1 || num > this.info.options.length) {
          this.terminal.write(
            colorize(`Invalid selection. Please enter 1-${this.info.options.length}.`, ansi.red) +
            `\r\n${this.info.promptText}`
          );
          this.inputBuffer = "";
          continue;
        }

        return this.resolveSelection(num - 1);
      }

      if (isBackspace(code)) {
        if (this.inputBuffer.length > 0) {
          this.inputBuffer = this.inputBuffer.slice(0, -1);
          this.terminal.write("\b \b");
        }
        continue;
      }

      // Only accept digits
      if (char >= "0" && char <= "9") {
        this.inputBuffer += char;
        this.terminal.write(char);
      }
    }

    return null; // still waiting for input
  }

  private resolveSelection(index: number): SessionResult {
    const option = this.info.options[index];
    let currentFs = this.fs;

    // Save reply email to sent/ if provided
    if (option.replyEmail) {
      const email = option.replyEmail;
      const filename = option.replyFilename ?? `sent_${email.id}`;
      const content = [
        `From: ${email.from}`,
        `To: ${email.to}`,
        `Date: ${email.date}`,
        `Subject: ${email.subject}`,
        "",
        email.body,
      ].join("\n");

      const result = currentFs.writeFile(
        `${getSentDir(this.username)}/${filename}`,
        content
      );
      if (result.fs) {
        currentFs = result.fs;
      }
    }

    const output = option.output ?? colorize("Reply sent.", ansi.green);

    return {
      type: "exit",
      output,
      newFs: currentFs !== this.fs ? currentFs : undefined,
      triggerEvents: option.triggerEvents,
    };
  }
}
