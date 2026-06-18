const ESC = "\x1b[";

export const ansi = {
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  italic: `${ESC}3m`,
  underline: `${ESC}4m`,
  reverse: `${ESC}7m`,

  // Foreground colors
  black: `${ESC}30m`,
  red: `${ESC}31m`,
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  blue: `${ESC}34m`,
  magenta: `${ESC}35m`,
  cyan: `${ESC}36m`,
  white: `${ESC}37m`,

  // Bright foreground
  brightBlack: `${ESC}90m`,
  brightRed: `${ESC}91m`,
  brightGreen: `${ESC}92m`,
  brightYellow: `${ESC}93m`,
  brightBlue: `${ESC}94m`,
  brightMagenta: `${ESC}95m`,
  brightCyan: `${ESC}96m`,
  brightWhite: `${ESC}97m`,
};

export function colorize(text: string, ...codes: string[]): string {
  return codes.join("") + text + ansi.reset;
}

export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

const CSV_PALETTE = [
  ansi.red,
  ansi.yellow,
  ansi.green,
  ansi.cyan,
  ansi.blue,
  ansi.magenta,
  ansi.brightRed,
  ansi.brightGreen,
];

function parseCsvFields(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

export function colorizeCsv(content: string): string {
  const lines = content.split("\n");
  return lines
    .map((line, lineIdx) => {
      if (line === "") return line;
      const fields = parseCsvFields(line);
      const colored = fields.map((field, i) => {
        const color = CSV_PALETTE[i % CSV_PALETTE.length];
        return lineIdx === 0
          ? colorize(field, ansi.bold, color)
          : colorize(field, color);
      });
      return colored.join(",");
    })
    .join("\n");
}
