import { useCallback, useEffect, useMemo, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { useGameStore } from "../state/gameStore";
import { getAvailableCommands } from "@tt/core/commands/registry";
import { SuggestionContext } from "@tt/core/suggestions/suggest";
import { parseZshHistory } from "@tt/core/terminal/zshHistory";
import { LineEditor, LineEditorResult } from "@tt/core/terminal/lineEditor";
import { ComputerId } from "../state/types";

interface CommandLineDeps {
  cwdRef: React.MutableRefObject<string>;
  activeComputerRef: React.MutableRefObject<ComputerId>;
  getPrompt: () => string;
}

export type CommandLineResult = LineEditorResult;

/**
 * Thin hook wrapping the shared `@tt/core` {@link LineEditor}. Builds the
 * app-specific dependency thunks (suggestion context, history list, prompt) and
 * exposes a single `handleData(term, data)` entry point. A single editor instance
 * is kept across panes (the line buffer is shared, matching prior behavior).
 */
export function useCommandLine(deps: CommandLineDeps) {
  const { cwdRef, activeComputerRef, getPrompt } = deps;

  // The `.zsh_history` file is the single source of truth for history recall.
  // Select the file *content string* (not a derived array): strings compare by
  // value, so the selector stays stable and avoids React's "getSnapshot should
  // be cached" infinite-loop bailout. Parse it into the recall list via useMemo.
  const computerId = activeComputerRef.current;
  const historyFileContent = useGameStore((s) => {
    const fs = s.computerState[computerId]?.fs;
    return fs ? fs.readFile(`${fs.homeDir}/.zsh_history`).content ?? "" : "";
  });
  const commandHistory = useMemo(() => parseZshHistory(historyFileContent), [historyFileContent]);

  const historyRef = useRef(commandHistory);
  // historyRef is only read inside event-handler callbacks (recall, suggestions),
  // never during render — so keep it in sync via an effect rather than a render-time write.
  useEffect(() => {
    historyRef.current = commandHistory;
  }, [commandHistory]);

  // A single editor instance is kept across panes (the line buffer is shared,
  // matching prior behavior). It is constructed lazily inside the handler so all
  // ref access stays out of render. The injected thunks are deferred — the editor
  // calls them fresh on each keystroke, so reading refs inside them is safe.
  const editorRef = useRef<LineEditor | null>(null);

  const handleData = useCallback(
    (term: Terminal, data: string) => {
      if (!editorRef.current) {
        editorRef.current = new LineEditor({
          getContext: (): SuggestionContext | null => {
            const store = useGameStore.getState();
            const cId = activeComputerRef.current;
            const currentFs = store.computerState[cId]?.fs;
            if (!currentFs) return null;

            const commandNames = getAvailableCommands(cId, store.storyFlags).map((c) => c.name);
            const aliases = store.computerState[cId]?.aliases ?? {};
            const aliasNames = Object.keys(aliases);

            return {
              commandHistory: historyRef.current,
              commandNames,
              aliasNames,
              aliases,
              fs: currentFs,
              cwd: cwdRef.current,
              homeDir: currentFs.homeDir,
            };
          },
          getHistory: () => historyRef.current,
          getPrompt,
        });
      }
      return editorRef.current.handleData(term, data);
    },
    [cwdRef, activeComputerRef, getPrompt]
  );

  return { handleData };
}
