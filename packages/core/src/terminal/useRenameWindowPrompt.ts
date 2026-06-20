"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyRenameKey } from "./renameWindowPrompt";

export interface RenameWindowPrompt {
  /** Non-null while editing — render this in the status-line modal slot. */
  prompt: string | null;
  /** Synchronous gate for reads inside an xterm `onData` closure. */
  isActive: () => boolean;
  /** Open the prompt for a window, seeded with its current name. */
  begin: (windowId: string, currentName: string) => void;
  /** Feed an `onData` chunk; returns true when consumed (caller should return). */
  handleData: (data: string) => boolean;
}

/**
 * The tmux rename-window inline prompt as a reusable hook: holds the modal
 * refs/state, drives keystrokes through {@link applyRenameKey}, and commits via
 * the injected `onCommit`. Shared by both games' terminal renderers.
 */
export function useRenameWindowPrompt(
  onCommit: (windowId: string, name: string) => void,
): RenameWindowPrompt {
  const activeRef = useRef(false); // synchronous gate read inside onData
  const bufferRef = useRef(""); // accumulated typed name
  const targetRef = useRef<string | null>(null); // window id being renamed
  const [prompt, setPrompt] = useState<string | null>(null);

  // Stash the latest onCommit so handleData stays referentially stable (callers
  // pass a fresh closure each render); synced in an effect, not during render.
  const onCommitRef = useRef(onCommit);
  useEffect(() => {
    onCommitRef.current = onCommit;
  });

  const isActive = useCallback(() => activeRef.current, []);

  const begin = useCallback((windowId: string, currentName: string) => {
    targetRef.current = windowId;
    bufferRef.current = currentName;
    activeRef.current = true;
    setPrompt(`(rename-window) ${currentName}`);
  }, []);

  const handleData = useCallback((data: string): boolean => {
    if (!activeRef.current) return false;
    const { buffer, done } = applyRenameKey(bufferRef.current, data);
    bufferRef.current = buffer;
    if (done === null) {
      setPrompt(`(rename-window) ${buffer}`);
      return true;
    }
    if (done === "commit" && targetRef.current) {
      onCommitRef.current(targetRef.current, buffer);
    }
    activeRef.current = false;
    targetRef.current = null;
    bufferRef.current = "";
    setPrompt(null);
    return true;
  }, []);

  return { prompt, isActive, begin, handleData };
}
