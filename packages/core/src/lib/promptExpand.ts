/**
 * Expand zsh-style prompt sequences into display strings with ANSI codes.
 *
 * Supported sequences:
 *   %n  → username          %m / %M  → hostname (short / full)
 *   %~  → cwd with ~ sub    %d / %/  → full cwd
 *   %#  → $ (normal) or # (root)
 *   %%  → literal %
 *   %B / %b → bold on / off
 *   %F{color} / %f → foreground color on / off
 */

const COLOR_CODES: Record<string, string> = {
  black: "30",
  red: "31",
  green: "32",
  yellow: "33",
  blue: "34",
  magenta: "35",
  cyan: "36",
  white: "37",
  default: "39",
};

export interface PromptVars {
  username: string;
  hostname: string;
  cwd: string;
  homeDir: string;
}

export function expandZshPrompt(template: string, vars: PromptVars): string {
  let result = "";
  let i = 0;

  while (i < template.length) {
    if (template[i] === "%" && i + 1 < template.length) {
      const next = template[i + 1];

      switch (next) {
        case "%":
          result += "%";
          i += 2;
          break;
        case "n":
          result += vars.username;
          i += 2;
          break;
        case "m":
        case "M": {
          const host = next === "m" ? vars.hostname.split(".")[0] : vars.hostname;
          result += host;
          i += 2;
          break;
        }
        case "~": {
          result += vars.cwd.startsWith(vars.homeDir)
            ? "~" + vars.cwd.slice(vars.homeDir.length)
            : vars.cwd;
          i += 2;
          break;
        }
        case "d":
        case "/":
          result += vars.cwd;
          i += 2;
          break;
        case "#":
          result += "$";
          i += 2;
          break;
        case "B":
          result += "\x1b[1m";
          i += 2;
          break;
        case "b":
          result += "\x1b[22m";
          i += 2;
          break;
        case "F": {
          // %F{color}
          const braceStart = i + 2;
          if (braceStart < template.length && template[braceStart] === "{") {
            const braceEnd = template.indexOf("}", braceStart);
            if (braceEnd !== -1) {
              const colorName = template.slice(braceStart + 1, braceEnd).toLowerCase();
              const code = COLOR_CODES[colorName] ?? "39";
              result += `\x1b[${code}m`;
              i = braceEnd + 1;
            } else {
              result += "%F";
              i += 2;
            }
          } else {
            result += "%F";
            i += 2;
          }
          break;
        }
        case "f":
          result += "\x1b[39m";
          i += 2;
          break;
        default:
          // Unknown sequence — pass through literally
          result += "%" + next;
          i += 2;
          break;
      }
    } else {
      result += template[i];
      i++;
    }
  }

  return result;
}
