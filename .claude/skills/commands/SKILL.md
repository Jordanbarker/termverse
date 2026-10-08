---
name: commands
description: "Command parser, registry, pipeline execution, and how to add new commands. This is a SHARED @tt/core engine skill — the generic parser/registry/pipeline lives in packages/core/src/commands and is consumed by both apps/termoil and apps/term-crunch. Use this skill whenever adding a new terminal command, modifying the command parser or pipeline, working on applyResult.ts/computeEffects(), or touching files under the commands engine (resolve bare src/engine/commands/... paths as packages/core/src/commands or apps/termoil/src/engine/commands), except dbt.ts, mail.ts, snow.ts which have their own skills."
---

# Command System

Parses terminal input, dispatches to registered handlers, chains pipelines, and computes side effects — all as pure functions. **Shared `@tt/core` engine** (`packages/core/src/commands`), consumed by both apps.

Code map: `commands/{types,registry,parser,expansion,runPipeline,applyResult,flagValidation,redirection,security,devices,scriptInterceptors,envTriggers,editorTriggers,availability,clock,fsErrors,operands}.ts` + `builtins/` (one file per command, plus `helpTexts.ts`; `git.ts`/`dbt.ts`/`snow.ts` are core builtins).

**Core registers only story-agnostic commands.** Termoil's own builtins live in `apps/termoil/src/engine/commands/builtins/` and self-register from that dir's `index.ts` (which imports core's first): `mail`, `ssh`, `ssh-add`, `coder`, `exit`, `apt`, `chip`, `piper`, `shutdown`, `hostname`, `cheat`, `save`/`load`/`newgame`. Their help text is that dir's `helpTexts.ts` (core's map merged with termoil's entries). `apps/term-crunch/src/__tests__/coreSurface.test.ts` fails if a story command reappears in core. Interactive modes: `session/types.ts` (`ISession`/`SessionResult`), `pager/` (less). Orchestration: the store-agnostic chain/pipe loop is core `runPipeline.ts`; the app hooks (`useTerminal.ts`, `useCommandLine.ts`, `useComputerTransitions.ts`) are thin wrappers. Read the type definitions in `commands/types.ts` and `applyResult.ts` directly — not mirrored here.

## Parser (`parser.ts`)

`parseInput` (tokenize respecting quotes), `parsePipeline` (split on unquoted `|`), `parseChainedPipeline` (split on `&&`/`||`/`;` first, then each segment's pipeline). Flag parsing: `-x` → `{x:true}`, `-xyz` → three flags, `--flag` → `{flag:true}`. Empty pipe segments are rejected as `` parse error near `|' ``, not silently dropped.

All quote-aware scanning goes through the exported `scanQuoted` visitor at the top of `parser.ts` (tokenizer, pipe/chain splitting, alias expansion, continuation detection, `redirection.ts`, `suggest.ts`). Use it rather than hand-rolling another quote loop (`scanQuoted.test.ts` pins the callers). Rules: `'`/`"` toggle unless the other is active, no backslash escaping; a visitor's extra-consumed characters are never visited, so they never toggle quote state. `bash.ts` deliberately keeps its own loops.

`analyzeIncompleteInput(input)` detects zsh secondary-prompt continuation (unterminated quote, trailing `\`/`|`/`&&`/`||`); `null` = submittable; no opinion on trailing `&`/`;`. Consumed by `@tt/core/terminal/lineEditor`'s `LineEditor`, which defers submission until the joined input parses clean.

## Word expansion (`expansion.ts`)

Order for one submitted line: **alias → parse → variables → globs**. Aliases are textual and pre-parse (`expandAliases`); the other two run per chain segment inside `runPipeline` (`expandSegmentWords`), so a just-`export`ed var and `$?` are current (`scripts/play.ts` mirrors this in `prepareSegment`). The env map is read via `buildContext`, never a snapshot, so `export X=1 && echo $X` works.

**Quoted-ness is carried by `parser.tokenizeWords`** (`QuotedWord`: runs tagged `none`/`single`/`double`) — the only thing that survives tokenization to tell `'*.log'` from `*.log`. Expanded argv is rebuilt via `parsedFromTokens`, not re-parsed (a globbed filename may contain a space); `ParsedCommand.raw` stays pre-expansion.

- **`$VAR`** — `$VAR`, `${VAR}`, `${VAR:-default}`, `$1`..`$9` (scripts only), `$?`. Expands unquoted and in double quotes, never in single quotes. Undefined → empty; an unquoted word expanding to nothing disappears from argv. No word splitting. `makeShellLookup` puts `ctx.envVars` first, falling back to shell-managed `HOME`/`USER`/`PWD`; `$?` is the one name env can't shadow.
- **`$?` is the previous line's status, per pane** (within a line: previous segment). Threaded via `RunPipelineOptions.initialExitCode` (termoil/term-crunch: per-pane `Map`s; `play.ts`: a field). Shell state: new pane starts at 0, resets on machine switch/checkpoint load, never persisted.
- **Globs** — `*`, `?`, `[...]` (with `!`/`^` negation and ranges), recursive `**`, matched per path segment (a non-final segment only matches directories). `~/x/*` expands the tilde first; a `~` from a variable is a plain character. Matches deduped + sorted. **`*` never matches a dotfile** unless the component starts with a literal `.`.
- **`**` (globstar)** is a bare `**` component only, matching zero or more levels; the dotfile rule applies at every level. A trailing `**` becomes `**/*`. VirtualFS is symlink-free, so the walk terminates.
- **A malformed pattern degrades to a literal, never throws** (`compilePathPart` catches bad-RegExp classes like `[z-a]`). Both apps' hooks also `catch` around the pipeline call and print `zsh: internal error`, so an engine throw can't hang the game.
- **zsh nomatch, not bash passthrough**: an unmatched pattern prints `zsh: no matches found: <pattern>` and the segment does not run at all (exit 1; no `applySegment`, no `command_executed` event; `play.ts` mirrors via its `rejected` flag). So `find . -name *.log` errors unless quoted.
- **Var-then-glob, one direction only**: metacharacters from a variable's value stay literal (GLOB_SUBST off); only characters typed unquoted can be pattern characters.
- **Scope: argv only, minus assignment words.** Redirect targets are split off before this pass and never expanded. `NAME=VALUE` operands of `export`/`alias` (`ASSIGNMENT_COMMANDS`) skip globbing but still expand variables. Globbing is interactive-shell only: `bash.ts` shares the variable half (script-local vars layered over `ctx.envVars`; `$?` stays literal) but never globs — authored `.sh` files rely on literal patterns.
- **Backslash is not an escape anywhere in this engine.** Quote to make a metacharacter literal.
- **Deliberately NOT supported**: `$(...)`/backticks in the interactive shell (copied through; only `bash.ts` substitutes), brace expansion, arithmetic, process substitution, `~user`.

Expanded argv is what fires events, so `cat *.log` emits one `file_read` per matched file. No trigger may key on a literal `*` argument.

## Suggestions / TAB completion (`@tt/core/suggestions/{suggest,complete}`)

Both the ghost-text suggester and TAB completion resolve filesystem candidates through `listMatchingEntries` in `suggest.ts`: **hidden entries are only offered when the typed prefix starts with `.`** (dotfiles are where the story keeps its secrets). Anything new that lists FS entries for the player goes through that helper, not `fs.listDirectory`.

## Flag validation (`flagValidation.ts`)

The dispatcher rejects unknown flags by default (coreutils-style, exit 2). **Every** command declares known flags via `setKnownFlags(name, {short, long})` after `register(...)`: `{}` when it takes none, one call per alias (lookup is by the typed name). An undeclared command silently rejects every flag, so the omission is a bug: `knownFlags.test.ts` (termoil) walks the registry and fails on any name that neither declares nor opts out (term-crunch mirrors it in `navigation.test.ts`). `--help` short-circuits before validation. Opt-outs (`skipFlagValidation(name)`, validate in-handler):
- **rawArgs-driven** (`find`, `head`, `tail`, `tree`, `tmux`) — the parser shatters `-name`/`-5`/`-L N`, so the handler re-parses `ctx.rawArgs`.
- **Per-subcommand** (`git`) — validated with `rejectUnknownFlags(..., {style: "git"})` (exit 129).
- **Custom prefix** (`snow`) — `rejectUnknownFlags("snow sql", ...)`.
- **Flag pass-through** (`sudo`) — the parser hoists every flag on the line, so `sudo` validates only flags typed before the command name against its own set, then re-classifies the tail via `parser.splitArgsAndFlags` and re-dispatches verbatim.

## Chaining, pipelines, redirection

`&&`/`||`/`;` supported; pipes bind tighter. `parseChainedPipeline(raw, shell?)` picks error wording by the `shell` param: zsh (default, interactive) vs bash (`bash.ts`, exit 2). Unknown commands → `zsh: command not found: <name>` (exit 127) + dimmed hint.

Execution (`runPipeline.ts`, shared core): outer loop over `ChainSegment[]`, inner per-pipe loop — chain gating, stdin threading (`stripAnsi`-cleaned), trigger/security/FS/mounts accumulation, optional redirection (`opts.redirection`, off in term-crunch) and intermediate `file_read` events (`opts.intermediateFileReadEvents`, termoil-only). App specifics are injected: `buildContext` builds each `CommandContext`; `applySegment` applies effects and returns `{newCwd, stopChain, earlyReturn}`. History append is the shared `appendZshHistory`. `bash.ts` runs its own loop over the same primitives, threading the accumulators through every nesting level via its `ScriptState` — anything a script produces must ride that struct out through `executeScript` or the tripwire/effect is silently lost.

**Redirection (`redirection.ts`)** — zsh-realistic stdout redirect, consumed by `runPipeline.ts`/`bash.ts`/`scripts/play.ts`:
- `extractStdoutRedirect` runs `extractStderrRedirect` first, then collects **every** unquoted `>`/`>>` (zsh multios — all targets get output). Target-less `>` → `parseError` (exit 1, segment skipped).
- **stderr tokens**: always stripped; exactly two forms modeled — `2>/dev/null`/`2>>/dev/null` (discard) and `2>&1` (fold into stdout). Any other `2>target` is a `parseError`, not a silent drop. Tokens are stripped from every pipeline stage; the mode applies to the whole segment. All behind `opts.redirection`; `bash.ts` strips tokens with its own `stripStderrRedirects` and ignores the mode.
- `precheckRedirects` validates targets before the pipeline runs (zsh opens redirect files before exec); on error nothing executes.
- `applyRedirection` writes each target's **stdout only**, `stripAnsi`-cleaned, emitting `file_created`/`file_modified` and running the `security.isLogTamperPath(path, machineId)` tripwire per target (the injected policy decides machine scoping; core never compares machine ids). `VirtualFS.writeFile` refuses to overwrite a directory or a file whose owner `w` bit is off, and preserves mode/metadata on overwrite — pass its optional `template` node to give a newly created file the source's mode/metadata (`cp`/`mv` do).

## stdout vs stderr (`CommandResult.output` vs `CommandResult.stderr`)

**Every diagnostic goes in `stderr`, never in `output`.** `output` is stdout: the only channel a pipe hands downstream and the only one `>`/`>>` writes to a file — an error in `output` gets redirected into files and counted by `wc`. `stderrChannel.test.ts` pins the contract.

- Build failures with `errorResult(message, exitCode)` from `fsErrors.ts`. Collect-and-continue commands (`cat`, `ls`, `grep`, `sort`, `rm`, `cp`, `chmod`) return good lines as `output`, bad ones as `stderr`.
- **Only stdout is redirected** (zsh fd 1): a failing command still truncates/creates the target but leaves it empty; the error prints on the terminal.
- `runPipeline` folds **every** stage's stderr into the segment result; `play.ts` mirrors this in `finishSegment`; `bash.ts` accumulates in `ScriptState.stderr` at any depth (so `$(...)` captures stdout only).
- **Rendering is `computeEffects`' job**: `AppliedEffects.output` is the segment's whole `stderr` block then its `output`, joined (not interleaved). A new consumer of `CommandResult` that skips `computeEffects` must print `stderr` itself.
- Deliberately still stdout: `diff`'s exit-1 report, and the per-operand "not found" lines of `which`/`type`/`file` (zsh does the same). Termoil's story builtins (`mail`, `chip`, `piper`, …) also still print on stdout; new code should not add to that list.

## Text helpers (`src/lib/textUtils.ts`)

`splitLines(content)` drops the phantom empty element a final `\n` produces — use it in any line-oriented command instead of bare `content.split("\n")`.

`wordWrap(text, width, preformatted)` is the one prose wrapper for fixed-width panes (chip and piper), joining with `\r\n`. The **required** third argument decides how an indented paragraph is handled: `"preserve"` (piper — pasted log lines must not re-flow) vs `"wrap-indented"` (chip — `skipAnimation` counts emitted rows, so soft-wraps would desync the repaint). Both render paths are pinned by `engine/{chip,piper}/__tests__/renderParity.test.ts`.

## The `-` operand (`operands.ts`)

A bare `-` (read stdin) arrives as a positional arg that looks like a filename. Read-a-file-or-stdin builtins resolve operands through `fileOperands(args)` (`wc`, `sort`, `uniq`, `less` do), or `cat f | wc -` reports `wc: /-: No such file or directory`.

## Game clock (`clock.ts`)

`ctx.clock` is the app's `GameClock` seam; callers use `(ctx.clock ?? realWallClock())` — core's single wall-clock fallback, so `date`, `git commit`, `dbt`, and `snow` can't drift apart.

## FS errors from a builtin (`fsErrors.ts`)

`VirtualFS` error strings are worded for their first callers, so **no builtin surfaces one verbatim**. Read side: `readFileForCommand(name, absPath, ctx)`; write side: `labelFsError(name, error)`. Never hand-roll `.replace("cat:", "head:")`. Both return a string; wrap in `errorResult(...)` so it lands on stderr.

Exit-code convention: **1 = read/write failure**, **2 = usage error**. Multi-operand commands collect-and-continue and (for mutating commands) still return the accumulated `newFs` rather than rolling back.

`chmod -R` is the one walk that mutates the modes it traverses, so it does its own gate: the named target goes through `setPermissions`, descendants through privileged `insertNode`, and a descendant dir is descended only if the player could already traverse it or this same chmod opens it.

## Effect computation (`applyResult.ts`)

`computeEffects(result, applyCtx)` is a **pure function** returning `AppliedEffects`: builds the event list (always `command_executed`; `readsFiles: true` commands — the 5th `register()` param — auto-add a `file_read` per file arg) and runs the app-injected `processDeliveries` cascade. It names no command and no machine: security violations route to `applyCtx.securityHomeMachine`; the keep-processing-on-transition case is driven by `CommandResult.sessionExit` (set by termoil's `exit`), never by comparing `parsedCommand` to a name. Shapes are in `applyResult.ts` — read them there.

**Background timers:** `CommandResult.deferredCommands` schedules/cancels app-owned, per-machine commands without suppressing the prompt or stopping a chain. `deferEvents` skips completion events/deliveries until execution; both `runPipeline` and `bash` preserve deferred actions from intermediate/nested commands. Termoil's `hooks/deferredCommands.ts` owns timer handles; `useTerminal` re-executes against live state at expiry and clears timers on load/unmount or machine removal. `CommandContext.pendingCommands` supports duplicate-schedule checks. `shutdown` defaults to 60 seconds; `shutdown -c` cancels, `shutdown [ -h ] now` executes immediately. Headless story playtests use the immediate form when asserting completion flags (the runner does not enact terminal timers/cinematics).

**`GameEvent` vocabulary** (union in `engine/mail/delivery.ts`): `directory_created` fires for `mkdir`/`cp -r`/`mv` (dest + every nested sub-dir); `directory_removed` for `mv`/`rm -r`; `file_created` vs `file_modified` is decided by `fs.getNode(path)` before the write; `file_removed` for `rm`/`mv` source-side. The matcher supports `path` (exact) for all events; `file_read`/`file_created`/`file_modified` also support `pathPrefix`.

## Sessions (`session/types.ts`)

`ISession` (`enter`/`handleInput`/optional `canClose`/`resize`) + `SessionResult`. Session kinds: editor (nano or vim via core `session/editorRegistry.ts`; both builtins share `builtins/editorOpen.ts` and `buildEditorExitResult`; vim lives in `packages/core/src/vim/`), snow-sql, pythonRepl, prompt, ssh, chip, piper, less. **Alt-screen sessions (editor, piper, less)** must be listed in `useSessionRouter.routeInput`'s `usedAltScreen` check. **Editor buffer contract:** both editors strip a single trailing newline into a private `eol` flag on load and re-attach it in `serialize()` — every write must go through `serialize()`, never bare `lines.join("\n")`, or files gain/lose their terminating newline and vim motions see a phantom bottom line. Both apps resolve aliases to their primary via `getPrimaryName` before gating, so listing `vim` covers `vi`.

## Command availability (`availability.ts`)

`isCommandAvailable(name, computer, storyFlags)` gates access; gate data is in `story/commandGates.ts` (see the **narrative skill**). Both `execute` and `executeAsync` enforce it, and `./script` path execution is gated on the **interpreter** (`python` for `.py`, else `bash`). Anything resolving a command name for the player (`which`/`type`/`command -v` via `resolveCommandPath`) must pass `ctx.storyFlags`, or a flag-unlocked command reads as "not found".

## App-injected seams (core asks, the app answers)

Everything core needs to know about a *particular* game arrives through one of these; none may be satisfied by a literal inside `packages/core`. All default to "nothing happens" (which is what makes term-crunch work).

- **`CommandContext.security`** (`security.ts`) — protected paths / tripwires, including machine scoping.
- **`CommandContext.devices`** (`devices.ts`) — block devices; `df` reads size + Filesystem column from `rootDevice()`, so df and lsblk can't disagree. A `BlockDevice.mountTrigger` (`{mountpath, event}`) makes `mount` emit that event when the device is mounted at that path.
- **`scriptInterceptors.ts`** — `setScriptInterceptor(fn)`; consulted by `python foo.py`, `bash foo.py`, and `./foo.py` before the file is read. Termoil registers `~/scripts/auto_apply.py`.
- **`diffTriggers.ts`** — `setDiffTrigger(fn)`; `diff` passes its raw operand args to the matcher and emits whatever events it returns. Termoil's matcher (`discovered_log_tampering` for `.bak` vs `system.log`): `src/story/diffTriggers.ts`.
- **`envTriggers.ts`** — `setEnvExportTriggers(table)`; `export` emits a `command_executed` event on a match by literal `value` or resolved `path`. **`source` runs the same table** over every assignment it applies. Termoil's table: `src/story/envTriggers.ts`.
- **`editorTriggers.ts`** — `setEditorOpenTriggers(table)`; `nano`/`vim` attach a trigger when the opened path matches; events fire on exit once `triggerRow`, `requireSave`, and `contentPredicate` all hold (the predicate runs on the saved buffer, so an unchanged save can't satisfy "fix this file"). Every save route (nano Ctrl+O/Ctrl+X-y, vim `:w`/`:wq`) must feed it, only for the tracked file. Termoil's table: `src/story/editorTriggers.ts`.
- **`snowflake/queryTriggers.ts`** — `setSqlQueryTriggers(table)`; `snow sql -q` and `SnowSqlSession` emit on a `pattern` match, only for a statement that ran (errored queries credit nothing). The REPL fires each detail once per session; patterns must not be `g`-flagged. Termoil's table: `src/story/queryTriggers.ts`.
- **`availability.ts` `setAvailabilityPolicy`** and **`help.ts` `registerMetaCommands`** — gating and the cyan meta-command grouping. **`help.ts` `setHelpVisibilityFilter`** hides commands from help under app conditions (termoil hides `shutdown` once `day1_shutdown` is set; registered in its `builtins/shutdown.ts`).
- **`snowflake/identity.ts` `setWarehouseIdentity`** — the warehouse identity (account, database, analytics/raw schemas, warehouse, roles, dbt profile/user) read by the dbt runner/compiler/executor and the snowflake session/permissions/executor. Neutral defaults when un-injected. Termoil injects NexaCorp values in `src/story/warehouseIdentity.ts` (also imported by `story/data/snowflake/initial_data.ts`, whose seed data assumes them).
- **`SshSession` `connectEvents` ctor param** — trigger events fired on a successful connect; the app decides which routes fire (termoil: `ssh_connect` for home → nexacorp, at the construction site in `useSessionRouter.ts`). Default: none.
- **`suggestions/suggest.ts` `addSubcommandCompletions`** — TAB/ghost-text subcommand words. `SUBCOMMAND_MAP` names only core's commands; app commands register their own (`coreSurface.test.ts` checks the completion tables too).
- **`CommandContext.gitAuthor`** — commit author; absent ⇒ generic `username <username@localhost>`.
- **`CommandContext.dbtModelOrder`** — authored model execution order; absent ⇒ discovered order.
- **`CommandContext.clock`** — the in-game clock (see above).
- **`builtins/man.ts` `registerManSummaries`** — the man NAME line for app builtins.

All have a `reset*` counterpart for test isolation. `packages/core/src/__tests__/storyLiterals.test.ts` is the tripwire: it fails if known story literals (nexacorp, sdb1, story flag/event names) appear anywhere in core source outside `__tests__`. Importing termoil's `builtins/index.ts` gives tests/the app the complete command layer, seams included.

## Adding a new command

1. Create `builtins/{name}.ts`: a `CommandHandler` `(args, flags, ctx) => CommandResult`; `register("name", handler, "desc", HELP_TEXTS.name)` + `setKnownFlags("name", {...})` at the bottom. **Story-coupled command? App's builtins dir, not core.**
2. Add the help entry to the sibling `helpTexts.ts` (`man` reads the registered help text, so a man page comes for free); add a `MAN_SUMMARIES` entry, and `addSubcommandCompletions` if it has subcommands.
3. `import "./name";` in the matching `builtins/index.ts`.
4. Add `__tests__/name.test.ts`.

Look at a neighbouring builtin for the pattern that fits. Design invariants: pure functions (no store access), immutable FS (mutations return `newFs`), engine imports types from `state/types.ts` but never Zustand, always `resolvePath(arg, ctx.cwd, ctx.homeDir)`, colors via `colorize()`/`ansi` from `src/lib/ansi.ts`.

## Block devices and mounts (`lsblk`, `mount`, `umount`)

Tooling in `builtins/{lsblk,mount,umount}.ts`; story-side registry `src/story/blockDevices.ts` (`BLOCK_DEVICES`, optional `visibleFlag` + `getContents()`). Every computer has a baseline system disk via `systemDisk(...)` (a `mountpoint?` marks a static baseline mount that `mount` refuses to re-mount); `getRootDevice(computer)` feeds both of `df`'s device and Size columns, so a new machine only needs a `systemDisk(...)` entry. `mount` wraps children via `dir(basename(mountpath), ...)`, refuses non-empty targets, and emits a device's `mountTrigger` event only at its declared mountpath (termoil: `mounted_usb_drive` for `/dev/sdb1` at `/mnt/usb`). The per-computer `Mounts` registry rides the same accumulator pattern as `fs` (`ctx.mounts` → `result.newMounts`, committed by `useTerminal` via `setComputerMounts`); key via `normalizeMountKey(input, cwd, homeDir)`.
