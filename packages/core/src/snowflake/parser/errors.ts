import { TokenPosition } from "../lexer/tokens";

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly position?: TokenPosition
  ) {
    super(message);
    this.name = "ParseError";
  }

  format(sql?: string): string {
    if (!this.position || !sql) return this.message;

    const lines = sql.split("\n");
    const lineIdx = this.position.line - 1;
    const line = lines[lineIdx] ?? "";
    const pointer = " ".repeat(this.position.column - 1) + "^";

    return `${this.message}\n  ${line}\n  ${pointer} (line ${this.position.line}, column ${this.position.column})`;
  }
}
