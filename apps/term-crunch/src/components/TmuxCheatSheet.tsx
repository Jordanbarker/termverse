"use client";

import { useMemo } from "react";
import { parseTmuxBindings, parseTmuxPrefix } from "@tt/core/terminal/tmuxConfig";
import { useGameStore } from "../state/gameStore";
import CheatSheet, { type CheatSheetSection } from "./CheatSheet";

/* Only bindings the @tt/core mux actually implements: the hardcoded chord
   table in packages/core/src/terminal/useTabManager.ts (handleChord), copy
   mode in copyMode.ts, and the session commands in commands/builtins/tmux.ts.
   Never list a key the player can't use; keep core HELP_TEXTS.tmux in sync.
   Prefix + pane focus/resize keys come from the player's ~/.tmux.conf. */

/** Beginner tmux key reference shown for `type: "tmux"` challenges. */
export default function TmuxCheatSheet() {
  const tmuxConf = useGameStore((s) => s.tmuxConf);

  const { sections, prefixLabel } = useMemo(() => {
    const p = parseTmuxPrefix(tmuxConf).label;
    const bindings = Object.entries(parseTmuxBindings(tmuxConf));
    const focusKeys = bindings.filter(([, b]) => b.kind === "focus").map(([k]) => k);
    const resizeKeys = bindings.filter(([, b]) => b.kind === "resize").map(([k]) => k);

    const sections: CheatSheetSection[] = [
      {
        title: "Panes",
        rows: [
          [`${p} |`, "split side-by-side"],
          [`${p} -`, "split stacked"],
          [`${p} ← ↓ ↑ →`, "focus pane in direction"],
          ...(focusKeys.length
            ? ([[`${p} ${focusKeys.join(" ")}`, "focus pane (from ~/.tmux.conf)"]] as [string, string][])
            : []),
          ...(resizeKeys.length
            ? ([[`${p} ${resizeKeys.join(" ")}`, "resize pane (from ~/.tmux.conf)"]] as [string, string][])
            : []),
          [`${p} o`, "cycle to next pane"],
          [`${p} x`, "kill pane (confirm y/n)"],
        ],
      },
      {
        title: "Windows",
        rows: [
          [`${p} c`, "create window"],
          [`${p} n / p`, "next / previous window"],
          [`${p} 1-9`, "jump to window N"],
          [`${p} r`, "rename window"],
        ],
      },
      {
        title: "Copy mode",
        rows: [
          [`${p} [`, "enter copy mode"],
          ["h j k l / arrows", "move (w b 0 $ g G too)"],
          ["v", "start selection"],
          ["y / Enter", "yank selection and exit"],
          ["q / Esc", "exit copy mode"],
        ],
      },
      {
        title: "Sessions",
        rows: [
          [`${p} d`, "detach from session"],
          ["tmux new -s x", "new session named x"],
          ["tmux ls", "list sessions"],
          ["tmux attach -t x", "reattach to session x"],
          ["tmux kill-session", "destroy a session"],
        ],
      },
    ];
    return { sections, prefixLabel: p };
  }, [tmuxConf]);

  return (
    <CheatSheet
      title="Tmux cheat sheet"
      sections={sections}
      keyColWidth="9.5rem"
      intro={
        <>
          {"Every shortcut starts with the prefix "}
          <code className="text-[#e6b450]">{prefixLabel}</code>
          {": press it, release, then press the command key. The prefix and pane keys come from your "}
          <code className="text-[#e6b450]">~/.tmux.conf</code>
          {" (Settings)."}
        </>
      }
    />
  );
}
