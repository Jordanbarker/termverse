"use client";

import CheatSheet, { type CheatSheetSection } from "./CheatSheet";

/* Only keys the @tt/core vim engine actually implements (see
   packages/core/src/vim/{normal,motions,exCommands}.ts) — never list a key
   the player can't use. Keep packages/core HELP_TEXTS.vim in sync. */
const SECTIONS: CheatSheetSection[] = [
  {
    title: "Modes",
    rows: [
      ["i / a", "insert before / after cursor"],
      ["o / O", "open new line below / above"],
      ["Esc", "back to normal mode"],
      ["v / V", "visual select (chars / lines)"],
    ],
  },
  {
    title: "Move",
    rows: [
      ["h j k l", "left, down, up, right"],
      ["w / b / e", "next word, back, word end"],
      ["0 ^ $", "line start / first char / end"],
      ["gg / G", "first / last line"],
      [":5", "jump to line 5"],
      ["f{char}", "jump to next {char} in line"],
    ],
  },
  {
    title: "Edit",
    rows: [
      ["x", "delete character"],
      ["r{char}", "replace character"],
      ["dd / dw / d$", "delete line / word / to end"],
      ["yy", "yank (copy) line"],
      ["p / P", "paste after / before"],
      ["cw / cc", "change word / line"],
      ["3dd", "counts repeat: delete 3 lines"],
    ],
  },
  {
    title: "Undo & search",
    rows: [
      ["u / Ctrl+R", "undo / redo"],
      ["/text", "search (n / N next / prev)"],
    ],
  },
  {
    title: "Save & quit",
    rows: [
      [":w", "save"],
      [":wq", "save and quit"],
      [":q!", "quit without saving"],
    ],
  },
];

/** Beginner vim key reference shown for `type: "vim"` challenges. */
export default function VimCheatSheet() {
  return (
    <CheatSheet
      title="Vim cheat sheet"
      sections={SECTIONS}
      intro={
        <>
          {"Vim is modal: it starts in "}
          <span className="font-semibold text-[#e6b450]">normal</span>
          {" mode, where keys are commands. Press "}
          <code className="text-[#e6b450]">i</code>
          {" to type text, "}
          <code className="text-[#e6b450]">Esc</code>
          {" to get back."}
        </>
      }
    />
  );
}
