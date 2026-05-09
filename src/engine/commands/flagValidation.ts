import { CommandResult } from "./types";

export interface KnownFlags {
  short?: readonly string[];
  long?: readonly string[];
}

export type FlagErrorStyle = "coreutils" | "git";

export interface FlagCheckOptions {
  style?: FlagErrorStyle;
}

const flagWhitelist = new Map<string, KnownFlags>();
const optOuts = new Set<string>();

/** Register the known-flag set for a command. Read by the registry's dispatch. */
export function setKnownFlags(name: string, known: KnownFlags): void {
  flagWhitelist.set(name, known);
}

export function getKnownFlags(name: string): KnownFlags | undefined {
  return flagWhitelist.get(name);
}

/**
 * Opt a command out of registry-level flag validation. Use for commands that
 * re-parse `ctx.rawArgs` themselves (e.g. find -name foo, head -5) or that
 * validate flags inside the handler with a different prefix or error format
 * (e.g. snow sql, git per-subcommand).
 */
export function skipFlagValidation(name: string): void {
  optOuts.add(name);
}

export function shouldValidateFlags(name: string): boolean {
  return !optOuts.has(name);
}

/**
 * Returns a CommandResult error if `flags` contains anything outside the
 * whitelist; otherwise null. Accepts boolean OR string-valued flags so
 * git's value-flag map (Record<string, string | boolean>) works too.
 *
 * `--help` is always allowed: the registry short-circuits on it before
 * dispatch, but skipping it here means git's per-subcommand validator
 * doesn't have to opt every subcommand into accepting it.
 *
 * coreutils style (exit 2):
 *   <cmd>: invalid option -- 'z'
 *   Try '<cmd> --help' for more information.
 *
 * git style (exit 129):
 *   error: unknown switch `z'
 *   error: unknown option `bogus'
 */
export function rejectUnknownFlags(
  command: string,
  flags: Record<string, unknown>,
  known: KnownFlags,
  options: FlagCheckOptions = {},
): CommandResult | null {
  const style = options.style ?? "coreutils";
  const shortSet = new Set(known.short ?? []);
  const longSet = new Set(known.long ?? []);

  for (const flag of Object.keys(flags)) {
    if (flag === "help") continue;
    const isShort = flag.length === 1;
    if (isShort ? shortSet.has(flag) : longSet.has(flag)) continue;

    if (style === "git") {
      const msg = isShort
        ? `error: unknown switch \`${flag}'`
        : `error: unknown option \`${flag}'`;
      return { output: msg, exitCode: 129 };
    }
    const headline = isShort
      ? `${command}: invalid option -- '${flag}'`
      : `${command}: unrecognized option '--${flag}'`;
    return {
      output: `${headline}\nTry '${command} --help' for more information.`,
      exitCode: 2,
    };
  }
  return null;
}
