import { Terminal } from "@xterm/xterm";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { ISession } from "./types";
import { EditorSession, EditorTrigger } from "../editor/EditorSession";
import { VimSession } from "../vim/VimSession";

/**
 * Constructor shared by every editor session class (nano, vim). All editors take
 * the same positional args, so the app routers can pick a class by id and
 * `new` it without a per-editor branch.
 */
export type EditorSessionClass = new (
  terminal: Terminal,
  fs: VirtualFS,
  filePath: string,
  content: string,
  readOnly: boolean,
  onSave: (newFs: VirtualFS) => void,
  trigger?: EditorTrigger
) => ISession;

/**
 * Editor id -> session class. `EditorSessionInfo.editor` indexes this map; adding
 * an editor is one entry here plus its builtin, with no app-side edits.
 */
export const EDITOR_SESSIONS = {
  nano: EditorSession,
  vim: VimSession,
} satisfies Record<string, EditorSessionClass>;

/** The editor ids the engine knows how to open. */
export type EditorId = keyof typeof EDITOR_SESSIONS;

/** Resolve an editor id (absent = nano) to its session class. */
export function editorSessionClass(editor?: EditorId): EditorSessionClass {
  return EDITOR_SESSIONS[editor ?? "nano"];
}
