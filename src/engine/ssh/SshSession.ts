import { Terminal } from "@xterm/xterm";
import { VirtualFS } from "../filesystem/VirtualFS";
import { ISession, SessionResult } from "../session/types";
import { isBackspace, CTRL_C } from "../terminal/keyCodes";
import { colorize, ansi } from "../../lib/ansi";
import type { MachineId } from "../machine";
import type { GameEvent } from "../mail/delivery";

const FAKE_FINGERPRINT = "SHA256:nThbg6kXUpJWGl7E1IGOCspRomTxdCARLviKw6E5SY8";

export class SshSession implements ISession {
  private terminal: Terminal;
  private fs: VirtualFS;
  private host: string;
  private username: string;
  private homeDir: string;
  private targetComputer: MachineId;
  private inputBuffer = "";

  constructor(
    terminal: Terminal,
    fs: VirtualFS,
    host: string,
    username: string,
    homeDir: string,
    targetComputer: MachineId
  ) {
    this.terminal = terminal;
    this.fs = fs;
    this.host = host;
    this.username = username;
    this.homeDir = homeDir;
    this.targetComputer = targetComputer;
  }

  /**
   * Trigger events emitted on a successful connect. Only the home → nexacorp
   * route fires `ssh_connect` (which drives the `first_ssh_connect` story flag
   * named for that connection). Other routes (e.g. chipinfra → erik-pc) emit
   * no objective_completed event — their narrative flag is set on arrival in
   * the transition handler instead.
   */
  private connectTriggerEvents(): GameEvent[] {
    if (this.targetComputer === "nexacorp") {
      return [{ type: "objective_completed", detail: "ssh_connect" }];
    }
    return [];
  }

  enter(): SessionResult | void {
    // Check if host is already in known_hosts
    const knownHostsPath = `${this.homeDir}/.ssh/known_hosts`;
    const knownHosts = this.fs.readFile(knownHostsPath);
    if (
      knownHosts.content !== undefined &&
      knownHosts.content.includes(this.host)
    ) {
      // Already trusted — return exit result directly so the caller
      // can process the transition without waiting for handleInput.
      return {
        type: "exit",
        triggerEvents: this.connectTriggerEvents(),
        transitionTo: this.targetComputer,
      };
    }

    this.terminal.write(
      `\r\nThe authenticity of host '${this.host}' can't be established.` +
        `\r\nED25519 key fingerprint is ${FAKE_FINGERPRINT}.` +
        `\r\nAre you sure you want to continue connecting (yes/no)? `
    );
  }

  handleInput(data: string): SessionResult | null {
    for (let i = 0; i < data.length; i++) {
      const char = data[i];
      const code = char.charCodeAt(0);

      if (code === CTRL_C) {
        this.terminal.write("^C");
        return { type: "exit" };
      }

      if (char === "\r" || char === "\n") {
        this.terminal.write("\r\n");
        const answer = this.inputBuffer.trim().toLowerCase();
        this.inputBuffer = "";

        if (answer === "yes") {
          return this.acceptHost();
        } else if (answer === "no") {
          this.terminal.write(
            colorize("Host key verification failed.", ansi.red)
          );
          return { type: "exit" };
        } else {
          this.terminal.write(
            `Please type 'yes' or 'no': `
          );
          return null;
        }
      }

      if (isBackspace(code)) {
        if (this.inputBuffer.length > 0) {
          this.inputBuffer = this.inputBuffer.slice(0, -1);
          this.terminal.write("\b \b");
        }
        continue;
      }

      // Accept printable characters
      if (code >= 32) {
        this.inputBuffer += char;
        this.terminal.write(char);
      }
    }

    return null;
  }

  private acceptHost(): SessionResult {
    // Write host to known_hosts
    const knownHostsPath = `${this.homeDir}/.ssh/known_hosts`;
    const existing = this.fs.readFile(knownHostsPath);
    const currentContent =
      existing.content !== undefined ? existing.content : "";
    const newContent = currentContent
      ? `${currentContent}\n${this.host} ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIN7vG4k3fR2pLxQ9mMzJYcKs8kT0vN`
      : `${this.host} ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIN7vG4k3fR2pLxQ9mMzJYcKs8kT0vN`;

    const writeResult = this.fs.writeFile(knownHostsPath, newContent);
    const newFs = writeResult.fs || this.fs;

    this.terminal.write(
      `Warning: Permanently added '${this.host}' (ED25519) to the list of known hosts.`
    );

    return {
      type: "exit",
      newFs,
      triggerEvents: this.connectTriggerEvents(),
      transitionTo: this.targetComputer,
    };
  }
}
