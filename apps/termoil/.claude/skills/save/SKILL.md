---
name: save
description: "How the save/load/newgame system works — localStorage slots, SaveData snapshots, FS serialization, and the save/load/newgame commands. Use this skill whenever modifying save slots, adding new persisted state fields, working on save/load/newgame commands, bumping SAVE_FORMAT_VERSION, or touching files like src/state/saveManager.ts, src/state/saveTypes.ts, or src/engine/filesystem/serialization.ts."
---

# Save System

Save/load/restart via terminal commands, using localStorage slots.

Code map: `engine/filesystem/serialization.ts` (`serializeFS`/`deserializeFS`, pure), `state/saveTypes.ts` (`SaveData`/`SaveSlotMeta`/`SaveSlotId`, `SAVE_FORMAT_VERSION`), `state/saveManager.ts` (localStorage CRUD: `createSaveData`/`saveToSlot`/`loadFromSlot`/`deleteSlot`/`listSaveSlots`, pure/no-React), `commands/builtins/{save,load,newgame}.ts`, `state/gameStore.ts` (`saveGame`/`loadGame` actions + FS auto-persist), `useTerminal.ts` (`gameAction` handler). `GameAction` union is in `commands/types.ts`. Read the type definitions there.

## Slots

- **auto-persist** — Zustand auto-persist, rebuilt on every state change via `partialize`, written through `createDebouncedStorage(1000)` (≤ once/sec). Key `termoil-save`. Not a loadable slot — it rehydrates on page load via `merge`.
- **slot-1/2/3** — manual. Keys `termoil-slot-{slotId}`.

Terminal commands: `save`/`load` list slots; `save 1|2|3` saves; `load 1|2|3` loads; `newgame` resets all state + reloads the page.

## What gets saved

**The canonical field list is the `partialize` return value in `gameStore.ts` — check it there, not a table.** Non-obvious fields:
- `serializedComputerState` — per-computer serialized FS (incl. the `.zsh_history` file), env vars, aliases, mounts.
- `zshHistory` — durable per-computer `.zsh_history` mirror that **survives `removeComputer`/FS rebuilds**, so shell history (the single source of truth — the `.zsh_history` file) continues across day/computer transitions even for boxes that get torn down and rebuilt.
- `serializedSnowflake` — via `serializeSnowflake()`; on `merge`, a deserialize failure falls back to `createInitialSnowflakeState()` rather than crashing the load.
- `persistedWindows`/`persistedActiveWindowIndex` — window/pane tree + active window (panes rebuilt with fresh ids via `rebuildWindow`; see the tmux skill).
- `notifiedChipTopicIds`, `copyModeHelpHidden` — dedup + UI preference.

Plus plain narrative/identity fields (`username`, `gamePhase`, `currentChapter`, `completedObjectives`, `deliveredEmailIds`, `deliveredPiperIds`, `storyFlags`, `hasSeenIntro`).

**Manual `SaveData` (via `save`) is a separate shape** (`saveTypes.ts`): it carries `serializedSnowflake` (restored + nexacorp FS re-bridged via `syncToVirtualFS` in `loadGame`, mirroring `merge`), but does **not** carry `hasSeenIntro` or `copyModeHelpHidden`.

## Updating for narrative progression

Adding a new Zustand field: (1) add to `SaveData` in `saveTypes.ts`, (2) add to `createSaveData()` in `saveManager.ts`, (3) add to `loadGame()` in `gameStore.ts`, (4) bump `SAVE_FORMAT_VERSION`.

No save changes needed for: new chapters/objectives (`currentChapter`/`completedObjectives` already capture ID strings), new email triggers (`deliveredEmailIds` tracks ID strings), or new filesystem content (FS serialized in full — new files appear only in fresh games, not existing saves). This is a pre-release game — skip save-migration scaffolding when the `SaveData` shape changes; just bump the version.
