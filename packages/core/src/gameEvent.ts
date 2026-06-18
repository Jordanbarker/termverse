/**
 * GameEvent — the core engine's event vocabulary (story-agnostic).
 *
 * Emitted by commands/sessions and consumed by delivery/trigger machinery.
 * The shape is a closed discriminated union of intent plus a free-text
 * `detail`; the concrete `detail` strings are interpreted by the story layer,
 * so this type carries no dependency on any one game's narrative.
 */
export type GameEvent =
  | { type: "command_executed"; detail: string }
  | { type: "file_read"; detail: string }
  | { type: "objective_completed"; detail: string }
  | { type: "directory_visit"; detail: string }
  | { type: "directory_created"; detail: string }
  | { type: "directory_removed"; detail: string }
  | { type: "file_created"; detail: string }
  | { type: "file_modified"; detail: string }
  | { type: "file_removed"; detail: string }
  | { type: "piper_delivered"; detail: string }
  | { type: "terminated"; detail: "log_tampering" | "leadership_destruction" | "exfiltration" };
