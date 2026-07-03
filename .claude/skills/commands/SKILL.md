---
name: commands
description: "Command parser, registry, pipeline execution, and how to add new commands. This is a SHARED @tt/core engine skill — the generic parser/registry/pipeline lives in packages/core/src/commands and is consumed by both apps/termoil and apps/term-crunch. Use this skill whenever adding a new terminal command, modifying the command parser or pipeline, working on applyResult.ts/computeEffects(), or touching files under the commands engine (resolve bare src/engine/commands/... paths as packages/core/src/commands or apps/termoil/src/engine/commands), except dbt.ts, mail.ts, snow.ts which have their own skills."
---

# Command System

Parses terminal input, dispatches to registered handlers, chains pipelines, and computes side effects — all as pure functions. **Shared `@tt/core` engine** (`packages/core/src/commands`), consumed by both apps.

Code map: `commands/{types,registry,parser,runPipeline,applyResult,flagValidation,redirection,helpTexts}.ts` + `builtins/` (one file per command; `git.ts`/`dbt.ts`/`snow.ts` are core builtins, `mail.ts` is app-only). Interactive modes: `session/types.ts` (`ISession`/`SessionResult`), `pager/` (less). Orchestration: the store-agnostic chain/pipe loop is core `runPipeline.ts`; the app hooks are thin wrappers around it — `useTerminal.ts` (context building/effects application), `useCommandLine.ts` (input buffer/history/suggestions), `useComputerTransitions.ts`. Read the type definitions in `commands/types.ts` and `applyResult.ts` directly — they are not mirrored here.

## Parser (`parser.ts`)

`parseInput` (tokenize respecting quotes), `parsePipeline` (split on unquoted `|`), `parseChainedPipeline` (split on `&&`/`||`/`;` first, then each segment's pipeline), plus `splitOnPipe`/`splitOnChainOperators`. Flag parsing: `-x` → `{x:true}`, `-xyz` → three flags, `--flag` → `{flag:true}`.

All quote-aware scanning (tokenize, pipe/chain splitting, alias expansion, continuation detection) goes through the private `scanQuoted` visitor helper at the top of `parser.ts` — use it rather than hand-rolling another quote loop. Rules: `'`/`"` toggle unless the other is active, no backslash escaping.

`analyzeIncompleteInput(input)` detects zsh secondary-prompt continuation (unterminated quote, trailing `\`/`|`/`&&`/`||`); `null` = submittable. It has no opinion on trailing `&`/`;` (not continuation in zsh). Consumed by `@tt/core/terminal/lineEditor`'s `LineEditor`, which accumulates physical lines into `pendingLines` and defers submission until the joined input parses clean.

## Flag validation (`flagValidation.ts`)

The dispatcher rejects unknown flags by default (coreutils-style `<cmd>: invalid option -- 'z'`, exit 2). Each command declares known flags via `setKnownFlags(name, {short, long})` after `register(...)` (`{}` for none). `--help` always short-circuits before validation. Three opt-out cases (call `skipFlagValidation(name)` and validate in-handler):
- **rawArgs-driven** (`find`, `head`, `tail`, `tree`) — the parser shatters `-name`/`-5`/`-L N`, so the handler re-parses `ctx.rawArgs`.
- **Per-subcommand** (`git`) — each subcommand has its own set; validated with `rejectUnknownFlags(..., {style: "git"})` (exit 129).
- **Custom prefix** (`snow`) — `rejectUnknownFlags("snow sql", ...)` so the error reads `snow sql:`.

## Chaining, pipelines, redirection

`&&`/`||`/`;` supported; pipes bind tighter (`cmd1 && cmd2 | cmd3` = `[cmd1] && [cmd2|cmd3]`). `parseChainedPipeline(raw, shell?)` splits chain operators first (consuming `||` before `splitOnPipe` misreads it). Syntax-error wording follows the `shell` param: interactive shell → zsh (`` zsh: parse error near `&&' ``, default); `bash.ts` passes `"bash"` for script lines (exit 2). Unknown commands → `zsh: command not found: <name>` (exit 127) + dimmed `Type 'help'` hint. Execution (`runPipeline.ts`, shared core): `runPipeline(opts)` runs the outer loop over `ChainSegment[]` and the inner per-pipe loop — chain-operator gating, stdin threading (`stripAnsi`-cleaned), trigger-event + security-violation accumulation, FS/mounts accumulation, optional redirection (`opts.redirection`, off in term-crunch) and intermediate `file_read` events (`opts.intermediateFileReadEvents`, termoil-only). App specifics are injected: `buildContext` builds each `CommandContext`, `applySegment` applies effects per segment (termoil: computeEffects + store/story-flag writes, term-crunch: minimal computeEffects) and returns `{newCwd, stopChain, earlyReturn}`; sessions/incremental/transitions (`isChainEarlyReturn`) stop the chain. History append is the shared `appendZshHistory` in `terminal/zshHistory.ts`. Bash scripts (`bash.ts`) still run their own loop over the same primitives.

**Redirection (`redirection.ts`)** — zsh-realistic stdout redirect, consumed by `runPipeline.ts`/`bash.ts`/`scripts/play.ts`:
- `extractStdoutRedirect` collects **every** unquoted `>`/`>>` (zsh `multios` — all targets get output) and strips stderr redirects. A target-less `>` sets a `parseError` (exit 1, segment skipped).
- `precheckRedirects` validates targets **before** the pipeline runs (zsh opens redirect files before exec): dir target → `zsh: is a directory:`, missing parent → `zsh: no such file or directory:`. On error nothing executes (no output, no events, no FS change).
- `applyRedirection` writes to every target, emitting `file_created`/`file_modified` and running the `isLogTamperPath` tripwire per target; `>>` append is newline-aware. `VirtualFS.writeFile` refuses to overwrite a directory, so `echo x > some-dir` can't destroy a tree.

## Line splitting (`src/lib/textUtils.ts`)

`splitLines(content)` drops the single trailing empty element a final `\n` produces (`"" → []`). Use it in any line-oriented command (`sort`/`uniq`/`grep`/`head`/`tail` do) instead of bare `content.split("\n")`, which invents a phantom empty line for files ending in a newline.

## Effect computation (`applyResult.ts`)

`computeEffects(result, applyCtx)` is a **pure function** (no terminal/state access) returning `AppliedEffects`. It: builds the event list (always `command_executed`; `readsFiles: true` commands auto-add a `file_read` per file arg — declared via the 5th `register()` param, `grep 'register(' | grep ', true)`); processes story-flag triggers for the active computer; checks email/piper deliveries per event; detects the `nexacorp_followup`-read transition; and the NexaCorp `diff`-on-`.bak` → `discovered_log_tampering` special case. `ApplyContext`/`AppliedEffects` shapes are in `applyResult.ts` — read them there.

**`GameEvent` vocabulary** (union in `engine/mail/delivery.ts`) — emitters worth knowing: `directory_created` fires for `mkdir`/`cp -r`/`mv` (dest + every nested sub-dir); `directory_removed` for `mv`/`rm -r`; `file_created` vs `file_modified` is decided by `fs.getNode(path)` **before** the write; `file_removed` for `rm`/`mv` source-side (every file under an `rm -r` subtree). The matcher supports `path` (exact) for all events; `file_read`/`file_created`/`file_modified` also support `pathPrefix`.

## Sessions (`session/types.ts`)

`ISession` (`enter`/`handleInput`/optional `canClose`/`resize`) + `SessionResult`. Session kinds: editor (nano), snow-sql, pythonRepl, prompt, ssh, chip, piper, less. **Alt-screen sessions (editor, piper, less)** are recognized in `useSessionRouter.routeInput`'s `usedAltScreen` check so the post-session prompt writes cleanly — add new alt-screen sessions to that list.

## Command availability (`availability.ts`)

`isCommandAvailable(name, computer, storyFlags)` gates access; gate data is in `story/commandGates.ts`. See the **narrative skill** for per-computer gating.

## Adding a new command

1. Create `builtins/{name}.ts`: a `CommandHandler` `(args, flags, ctx) => CommandResult` using `ctx.fs/cwd/stdin/...`; `register("name", handler, "desc", HELP_TEXTS.name)` + `setKnownFlags("name", {...})` at the bottom.
2. Add the help entry to `HELP_TEXTS` in `helpTexts.ts`.
3. `import "./name";` in `builtins/index.ts`.
4. Add `__tests__/name.test.ts`.

Look at a neighbouring builtin for the pattern that fits (read-only, FS mutation, piped-input, interactive-session, event-triggering). Design invariants: pure functions (no store access), immutable FS (mutations return `newFs`), engine imports types from `state/types.ts` but never Zustand, always `resolvePath(arg, ctx.cwd, ctx.homeDir)`, colors via `colorize()`/`ansi` from `src/lib/ansi.ts`.

## Block devices and mounts (`lsblk`, `mount`, `umount`)

Tooling in `builtins/{lsblk,mount,umount}.ts`; story-side registry `src/story/blockDevices.ts` (`BLOCK_DEVICES`, each entry optionally `visibleFlag` + `getContents()`). Every computer has a baseline **system disk** via `systemDisk(...)` so `lsblk` always shows a real machine; a `mountpoint?` field marks a static baseline mount (`mount` refuses to re-mount it). `getRootDevice(computer)` is the single source for `df`'s Filesystem column. `mount` wraps children via `dir(basename(mountpath), ...)` so `node.name` matches, refuses non-empty targets, and emits `mounted_usb_drive` only for `/dev/sdb1` at `/mnt/usb`. The `Mounts` registry is per-computer, rides the same accumulator pattern as `fs` (read from `computerState[id].mounts` → `ctx.mounts` → `result.newMounts`, committed once by `useTerminal` via `setComputerMounts`); key via `normalizeMountKey(input, cwd, homeDir)`.
