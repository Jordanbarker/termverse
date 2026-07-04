import type { Challenge } from "./types";

// Teaches the core tmux session lifecycle: detach (client leaves, session
// survives on the server), then reattach. checkWhileDetached is required —
// step 1 is only observable while detached, and checkCompletion normally
// skips the bare shell.
//
// Predicate gotchas:
// - `tmux ls` is read-only, so step 2 gates on the reattach; the ls output is
//   the payoff, not the checkpoint.
// - Step 2's predicate is trivially true at challenge load, but the cascade
//   starts at step 0 (false at load), so it can never pre-fire. Never make
//   step 0 of a lifecycle challenge something true at load.
export const sessionsDetachAttach: Challenge = {
  id: "sessions-detach-attach",
  title: "Detach & reattach",
  type: "tmux",
  checkWhileDetached: true,
  commands: [], // tmux itself is always available
  brief:
    "A long build is running inside your tmux session and you need to step away. Leave the session running on the server, then come back to it.",
  setup: (base) => base,
  steps: [
    {
      instruction:
        "Detach from the current session, leaving it running on the server.",
      hint: "Detaching disconnects your client without killing the session — there's a prefix chord for it, and a tmux subcommand.",
      command: "tmux detach",
      isComplete: (s) =>
        s.tmux.attachedSession === null &&
        s.tmux.detachedSessions.some((d) => d.name === "0"),
    },
    {
      instruction:
        "Confirm the session survived by listing sessions, then reattach to it.",
      hint: "tmux ls shows every session on the server; attach reconnects to the most recently detached one by default.",
      command: "tmux attach",
      isComplete: (s) =>
        s.tmux.attachedSession === "0" && s.tmux.detachedSessions.length === 0,
    },
  ],
};
