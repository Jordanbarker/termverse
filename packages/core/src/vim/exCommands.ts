/** Parsed ex (":") command directives the session executes. */
export type ExDirective =
  | { kind: "none" }
  | { kind: "write"; path?: string; quit: boolean; onlyIfModified: boolean }
  | { kind: "quit"; force: boolean }
  | { kind: "gotoLine"; line: number }
  | { kind: "error"; message: string };

/** Parse the text typed after ":". Supports :w [file], :q, :q!, :wq, :x, :{line}. */
export function parseExCommand(raw: string): ExDirective {
  const input = raw.trim();
  if (input === "") return { kind: "none" };

  if (/^\d+$/.test(input)) {
    return { kind: "gotoLine", line: parseInt(input, 10) };
  }

  const match = input.match(/^([A-Za-z]+)(!?)(?:\s+(\S.*))?$/);
  if (match) {
    const [, cmd, bang, arg] = match;
    const force = bang === "!";
    switch (cmd) {
      case "w":
      case "write":
        return { kind: "write", path: arg?.trim(), quit: false, onlyIfModified: false };
      case "wq":
        return { kind: "write", path: arg?.trim(), quit: true, onlyIfModified: false };
      case "x":
      case "xit":
        if (!arg) return { kind: "write", quit: true, onlyIfModified: true };
        break;
      case "q":
      case "quit":
        if (!arg) return { kind: "quit", force };
        break;
    }
  }

  return { kind: "error", message: `E492: Not an editor command: ${input}` };
}
