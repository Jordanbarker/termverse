"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "../state/gameStore";
import { DEFAULT_ZSHRC, DEFAULT_TMUX_CONF } from "../lib/defaultConfigs";

interface SettingsModalProps {
  onClose: () => void;
}

/**
 * Settings modal: edit the player's ~/.zshrc and ~/.tmux.conf. Saving applies
 * them live (aliases/env + tmux prefix/theme/keybindings) and persists across
 * refreshes. Mounted only while open (parent-gated), so the draft state seeds
 * from the store on each open and Cancel simply discards it.
 */
export default function SettingsModal({ onClose }: SettingsModalProps) {
  const setConfigs = useGameStore((s) => s.setConfigs);

  const [zshrc, setZshrc] = useState(() => useGameStore.getState().zshrc);
  const [tmuxConf, setTmuxConf] = useState(() => useGameStore.getState().tmuxConf);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    setConfigs(zshrc, tmuxConf);
    onClose();
  };

  const reset = () => {
    setZshrc(DEFAULT_ZSHRC);
    setTmuxConf(DEFAULT_TMUX_CONF);
  };

  const editor = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    hint: string,
  ) => (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold text-[#e6b450]">{label}</span>
        <span className="text-[10px] text-[#4a5560]">{hint}</span>
      </div>
      <textarea
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="min-h-[180px] flex-1 resize-none rounded border border-[#1c2430] bg-[#0a0e14] p-3 font-mono text-xs leading-relaxed text-[#b3b1ad] focus:border-[#6b7680] focus:outline-none"
      />
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-3xl flex-col gap-4 rounded-lg border border-[#1c2430] bg-[#0d1117] p-5 text-[#b3b1ad] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-[#e6b450]">⚙ Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="rounded px-2 text-[#6b7680] hover:text-[#b3b1ad]"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-[#6b7680]">
          Edit your shell dotfiles. Saving applies them live and persists across refreshes.
        </p>

        <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
          {editor("~/.zshrc", zshrc, setZshrc, "aliases + exports")}
          {editor("~/.tmux.conf", tmuxConf, setTmuxConf, "prefix · theme · keybindings")}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={reset}
            className="rounded border border-[#3d4751] px-3 py-1.5 text-xs text-[#6b7680] hover:border-[#6b7680] hover:text-[#b3b1ad]"
          >
            Reset to defaults
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded border border-[#3d4751] px-3 py-1.5 text-xs text-[#6b7680] hover:border-[#6b7680] hover:text-[#b3b1ad]"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="rounded border border-[#2e7d32] bg-[#11231a] px-3 py-1.5 text-xs font-semibold text-[#7ee787] hover:border-[#7ee787]"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
