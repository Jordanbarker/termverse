import { colorize, ansi } from "./ansi";

const PYTHON_KEYWORDS = new Set([
  "def", "class", "import", "from", "return", "if", "elif", "else",
  "for", "while", "try", "except", "finally", "with", "as", "in",
  "not", "and", "or", "is", "lambda", "yield", "raise", "pass",
  "break", "continue", "True", "False", "None", "async", "await",
  "del", "global", "nonlocal", "assert",
]);

const PYTHON_BUILTINS = new Set([
  "print", "len", "range", "str", "int", "float", "list", "dict",
  "set", "tuple", "type", "isinstance", "enumerate", "zip", "map",
  "filter", "sorted", "reversed", "open", "super", "property",
  "staticmethod", "classmethod", "self", "bool", "bytes", "hex",
  "oct", "bin", "abs", "min", "max", "sum", "round", "input",
  "hasattr", "getattr", "setattr", "delattr", "callable", "iter",
  "next", "hash", "id", "repr", "format", "vars", "dir",
  "Exception", "ValueError", "TypeError", "KeyError", "IndexError",
  "AttributeError", "RuntimeError", "StopIteration", "FileNotFoundError",
  "ImportError", "OSError", "IOError", "NotImplementedError",
]);

const STRING_PREFIXES = new Set([
  "r", "R", "b", "B", "f", "F",
  "rb", "rB", "Rb", "RB", "br", "bR", "Br", "BR",
  "fr", "fR", "Fr", "FR", "rf", "rF", "Rf", "RF",
]);

function isQuote(ch: string): boolean {
  return ch === "'" || ch === '"';
}

/** Scan a quoted string starting at position i (which points at the opening quote).
 *  Returns the index just past the closing quote. */
function scanString(code: string, i: number, len: number): number {
  const q = code[i];
  // Check for triple-quote
  if (i + 2 < len && code[i + 1] === q && code[i + 2] === q) {
    let j = i + 3;
    while (j < len) {
      if (code[j] === "\\" && j + 1 < len) {
        j += 2; // skip escaped char
      } else if (j + 2 < len && code[j] === q && code[j + 1] === q && code[j + 2] === q) {
        return j + 3;
      } else {
        j++;
      }
    }
    return len; // unclosed triple-quote
  }
  // Single-line string
  let j = i + 1;
  while (j < len) {
    if (code[j] === "\\" && j + 1 < len) {
      j += 2;
    } else if (code[j] === q) {
      return j + 1;
    } else if (code[j] === "\n") {
      return j; // unterminated at newline
    } else {
      j++;
    }
  }
  return len; // unclosed
}

/**
 * Lightweight Python syntax highlighter that produces ANSI-colored output.
 * Handles keywords, builtins, strings (with prefixes), comments, decorators, and numbers.
 */
export function highlightPython(code: string): string {
  let out = "";
  let i = 0;
  const len = code.length;

  // Shebang: #! at position 0
  if (len >= 2 && code[0] === "#" && code[1] === "!") {
    const nl = code.indexOf("\n", 0);
    if (nl !== -1) {
      out += colorize(code.slice(0, nl), ansi.dim);
      i = nl;
    } else {
      return colorize(code, ansi.dim);
    }
  }

  while (i < len) {
    const ch = code[i];

    // Comments: # to end of line
    if (ch === "#") {
      const nl = code.indexOf("\n", i);
      if (nl !== -1) {
        out += colorize(code.slice(i, nl), ansi.dim);
        i = nl;
      } else {
        out += colorize(code.slice(i), ansi.dim);
        i = len;
      }
      continue;
    }

    // Strings starting with a quote
    if (isQuote(ch)) {
      const end = scanString(code, i, len);
      out += colorize(code.slice(i, end), ansi.green);
      i = end;
      continue;
    }

    // Decorators: @ followed by identifier chars (at line start or after whitespace)
    if (ch === "@") {
      let j = i + 1;
      while (j < len && /[a-zA-Z0-9_.]/.test(code[j])) j++;
      if (j > i + 1) {
        out += colorize(code.slice(i, j), ansi.yellow);
        i = j;
      } else {
        out += ch;
        i++;
      }
      continue;
    }

    // Numbers
    if (/[0-9]/.test(ch)) {
      let j = i + 1;
      // Hex, octal, binary
      if (ch === "0" && j < len && /[xXoObB]/.test(code[j])) {
        j++;
        while (j < len && /[0-9a-fA-F_]/.test(code[j])) j++;
      } else {
        while (j < len && /[0-9._]/.test(code[j])) j++;
        // Scientific notation
        if (j < len && /[eE]/.test(code[j])) {
          j++;
          if (j < len && /[+-]/.test(code[j])) j++;
          while (j < len && /[0-9_]/.test(code[j])) j++;
        }
      }
      // Don't color if followed by word char (part of identifier)
      if (j < len && /[a-zA-Z_]/.test(code[j])) {
        out += code.slice(i, j);
        i = j;
      } else {
        out += colorize(code.slice(i, j), ansi.magenta);
        i = j;
      }
      continue;
    }

    // Words (identifiers, keywords, builtins, string prefixes)
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i + 1;
      while (j < len && /[a-zA-Z0-9_]/.test(code[j])) j++;
      const word = code.slice(i, j);

      // Check if this is a string prefix (e.g. f"...", rb'...')
      if (STRING_PREFIXES.has(word) && j < len && isQuote(code[j])) {
        const end = scanString(code, j, len);
        out += colorize(code.slice(i, end), ansi.green);
        i = end;
        continue;
      }

      if (PYTHON_KEYWORDS.has(word)) {
        out += colorize(word, ansi.cyan);
      } else if (PYTHON_BUILTINS.has(word)) {
        out += colorize(word, ansi.blue);
      } else {
        out += word;
      }
      i = j;
      continue;
    }

    // Everything else
    out += ch;
    i++;
  }

  return out;
}
