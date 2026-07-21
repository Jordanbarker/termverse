"use client";

import { Fragment, useState } from "react";

/* Only keys the @tt/core vim engine actually implements (see
   packages/core/src/vim/{normal,motions,exCommands}.ts) — never list a key
   the player can't use. Keep packages/core HELP_TEXTS.vim in sync. */
const SECTIONS: { title: string; rows: [string, string][] }[] = [
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

/**
 * Beginner key reference shown in the side panel during vim challenges.
 * Expanded by default: the target audience has never used vim, and the sheet
 * stays readable while the player is inside the editor (unlike `help vim`).
 */
export default function VimCheatSheet() {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded border border-[#1c2430] bg-[#11161d]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs uppercase tracking-wide text-[#6b7680] hover:text-[#b3b1ad]"
      >
        <span>Vim cheat sheet</span>
        <span>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 px-3 pb-3">
          <p className="text-xs leading-relaxed text-[#b3b1ad]">
            {"Vim is modal: it starts in "}
            <span className="font-semibold text-[#e6b450]">normal</span>
            {" mode, where keys are commands. Press "}
            <code className="text-[#e6b450]">i</code>
            {" to type text, "}
            <code className="text-[#e6b450]">Esc</code>
            {" to get back."}
          </p>
          {SECTIONS.map((s) => (
            <div key={s.title}>
              <div className="mb-1 text-[10px] uppercase tracking-wide text-[#6b7680]">{s.title}</div>
              <div className="grid grid-cols-[7.5rem_1fr] gap-x-2 gap-y-0.5 text-xs">
                {s.rows.map(([keys, desc]) => (
                  <Fragment key={keys}>
                    <code className="text-[#e6b450]">{keys}</code>
                    <span className="text-[#b3b1ad]">{desc}</span>
                  </Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
