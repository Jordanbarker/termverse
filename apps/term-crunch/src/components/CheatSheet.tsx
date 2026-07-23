"use client";

import { Fragment, useState, type ReactNode } from "react";

export interface CheatSheetSection {
  title: string;
  rows: [keys: string, description: string][];
}

/**
 * Collapsible key-reference panel shown in the challenge side panel.
 * Expanded by default: the target audience is learning the tool, and the
 * sheet stays readable while the player is inside the terminal.
 */
export default function CheatSheet({
  title,
  intro,
  sections,
  keyColWidth = "7.5rem",
}: {
  title: string;
  intro?: ReactNode;
  sections: CheatSheetSection[];
  keyColWidth?: string;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded border border-[#1c2430] bg-[#11161d]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs uppercase tracking-wide text-[#6b7680] hover:text-[#b3b1ad]"
      >
        <span>{title}</span>
        <span>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 px-3 pb-3">
          {intro && <p className="text-xs leading-relaxed text-[#b3b1ad]">{intro}</p>}
          {sections.map((s) => (
            <div key={s.title}>
              <div className="mb-1 text-[10px] uppercase tracking-wide text-[#6b7680]">{s.title}</div>
              <div
                className="grid gap-x-2 gap-y-0.5 text-xs"
                style={{ gridTemplateColumns: `${keyColWidth} 1fr` }}
              >
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
