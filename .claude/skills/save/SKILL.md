---
name: save
description: "How the save/load/newgame system works — localStorage slots, SaveData snapshots, FS serialization, and the save/load/newgame commands. Use this skill whenever modifying save slots, adding new persisted state fields, working on save/load/newgame commands, bumping SAVE_FORMAT_VERSION, or touching files like src/state/saveManager.ts, src/state/saveTypes.ts, or src/engine/filesystem/serialization.ts."
---

# Save System

Save/load/restart functionality via terminal commands, using localStorage save slots.

## Architecture

```
src/engine/filesystem/serialization.ts   # VirtualFS <-> JSON serialization
src/state/saveTypes.ts                   # SaveData, SaveSlotMeta, SaveSlotId types
src/state/saveManager.ts                 # localStorage CRUD (pure utilities, no React)
src/engine/commands/builtins/save.ts     # save command
src/engine/commands/builtins/load.ts     # load command
src/engine/commands/builtins/newgame.ts  # newgame command
src/state/gameStore.ts                   # saveGame/loadGame actions, FS auto-persist
src/hooks/useTerminal.ts                 # gameAction handler (save/load/listSaves/newGame)
```

## Data Model

### `SerializedFS` (`serialization.ts`)
```ts
{ root: DirectoryNode; cwd: string; homeDir: string }
```

### `SaveData` (`saveTypes.ts`)
Full snapshot of all game state:
```ts
{
  version: number;        // SAVE_FORMAT_VERSION (see saveTypes.ts for current value)
  timestamp: number;      // Date.now() at save time
  label: string;          // Display label
  username, gamePhase, currentChapter, completedObjectives,
  deliveredEmailIds, deliveredPiperIds: string[];
  storyFlags: StoryFlags;
  // Keyed by ComputerId ("home" | "nexacorp" | "devcontainer" | "chipinfra" | "erik-pc")
  computerStates: Record<string, { fs: SerializedFS; envVars: Record<string, string>; aliases: Record<string, string>; mounts: Mounts }>;
  // Durable per-computer .zsh_history mirror — survives removeComputer so shell
  // history (the single source of truth, the .zsh_history file) continues across
  // day/computer transitions even for FS that get torn down and rebuilt.
  zshHistory: Partial<Record<ComputerId, string>>;
  tabs: SavedTabState[];      // Tab layout: {computerId, cwd}[]
  activeTabIndex: number;     // Index of active tab in tabs[]
}
```

### `SaveSlotMeta` (`saveTypes.ts`)
Lightweight metadata for listing slots (no FS blob):
```ts
{ slotId, label, timestamp, username, currentChapter, empty: boolean }
```

### `GameAction` (`commands/types.ts`)
Side-channel on `CommandResult` for save/load/newgame commands:
```ts
type GameAction =
  | { type: "save"; slotId: string }
  | { type: "load"; slotId: string }
  | { type: "listSaves" }
  | { type: "listCheckpoints" }
  | { type: "loadCheckpoint"; checkpointId: string }
  | { type: "newGame" }
  | { type: "shutdown" };
```

## Save Slots

- **auto**: Zustand auto-persist (rebuilt on every state change via `partialize`, written through a debounced storage — `createDebouncedStorage(1000)` — so writes land at most once per second)
- **slot-1, slot-2, slot-3**: Manual save slots

localStorage keys: `terminal-turmoil-slot-{slotId}`
Zustand auto-save key: `terminal-turmoil-save`

## Key Functions

### `serialization.ts`
| Function | Purpose |
|----------|---------|
| `serializeFS(fs)` | VirtualFS -> plain JSON |
| `deserializeFS(data)` | Plain JSON -> VirtualFS instance |

### `saveManager.ts`
| Function | Purpose |
|----------|---------|
| `createSaveData(state, label)` | Build SaveData snapshot from current store state |
| `saveToSlot(slotId, data)` | Write SaveData to localStorage |
| `loadFromSlot(slotId)` | Read SaveData from localStorage |
| `deleteSlot(slotId)` | Remove a save slot |
| `listSaveSlots()` | Get SaveSlotMeta[] for all 4 slots |

### `gameStore.ts` actions
| Action | Purpose |
|--------|---------|
| `saveGame(slotId, label?)` | Snapshot current state to a slot |
| `loadGame(slotId)` | Restore full state from a slot |

## Terminal Commands

| Command | Action |
|---------|--------|
| `save` | List all save slots |
| `save 1\|2\|3` | Save to manual slot |
| `load` | List all save slots |
| `load 1\|2\|3\|auto` | Load from slot |
| `newgame` | Reset all state, reload page |

## What Gets Saved

### Store state (auto-persisted via Zustand `partialize`)

**The canonical field list is the `partialize` return value in `gameStore.ts` — check it there rather than trusting this table.** Fields with non-obvious semantics:

| Field | What it tracks |
|-------|---------------|
| `serializedComputerState` | Per-computer serialized filesystems (incl. the `.zsh_history` file), env vars, aliases, and mounts |
| `zshHistory` | Durable per-computer `.zsh_history` mirror — survives `removeComputer`/FS rebuilds so shell history (the single source of truth) continues across day/computer transitions |
| `serializedSnowflake` | Snowflake warehouse state via `serializeSnowflake()`. On `merge`, deserialization failures fall back to `createInitialSnowflakeState()` rather than crashing the load |
| `persistedTabs` / `persistedActiveTabIndex` | Tab layout and active tab position |
| `notifiedChipTopicIds` | Chip menu item IDs already toasted (prevents re-firing the "New Chip topic available" toast) |
| `copyModeHelpHidden` | Player's copy-mode key-hint overlay preference |

Plus the plain narrative/identity fields: `username`, `gamePhase`, `currentChapter`, `completedObjectives`, `deliveredEmailIds`, `deliveredPiperIds`, `storyFlags`, `hasSeenIntro`.

### SaveData (manual saves via save command)
Mostly mirrors the auto-persisted fields, but is a separate shape (`saveTypes.ts`): manual slots do **not** carry `hasSeenIntro`, `serializedSnowflake`, or `copyModeHelpHidden`. Loading a manual slot keeps the live Snowflake state rather than restoring a snapshot.

## Updating for Narrative Progression

### Adding new Zustand state fields
1. Add to `SaveData` interface in `saveTypes.ts`
2. Add to `createSaveData()` in `saveManager.ts`
3. Add to `loadGame()` in `gameStore.ts`
4. Bump `SAVE_FORMAT_VERSION`

### Adding new chapters/objectives
No save changes needed — `currentChapter` and `completedObjectives` already capture any chapter/objective ID strings.

### Adding new email triggers
No save changes needed — `deliveredEmailIds` already tracks any email ID strings.

### Adding new filesystem content
No save changes needed — filesystem is serialized in full. New files only appear in fresh games (not existing saves).

### Adding Chip/assistant state
When `AssistantState` is added to the store, add it to `SaveData` and bump `SAVE_FORMAT_VERSION`.

## Design Patterns

- **Pure functions**: `serializeFS`, `deserializeFS`, `createSaveData` are all pure
- **Immutable FS**: Deserialization creates a new VirtualFS instance
- **GameAction side-channel**: Commands return `gameAction` on `CommandResult`, handled by `useTerminal`
- **Auto-persist**: Zustand `partialize` serializes `computerState` (per-computer FS) and tab layout — filesystem survives page reload
- **Tab-derived state**: The store has no `fs`, `cwd`, or `activeComputer` fields. These are derived from `computerState[tab.computerId].fs` and `tabs[activeTabId].cwd`/`.computerId` at point of use
