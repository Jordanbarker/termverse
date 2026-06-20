import { VirtualFS } from "@tt/core/filesystem/VirtualFS";

export interface CursorPosition {
  row: number;
  col: number;
}

export type PromptState =
  | { type: "none" }
  | { type: "saveExit" }
  | { type: "search"; input: string }
  | { type: "replaceSearch"; input: string }
  | { type: "replaceWith"; searchTerm: string; input: string }
  | { type: "replaceConfirm"; searchTerm: string; replacement: string }
  | { type: "gotoLine"; input: string }
  | { type: "readFile"; input: string }
  | { type: "writeOut"; input: string };

export interface EditorState {
  lines: string[];
  cursor: CursorPosition;
  scrollOffset: number;
  filePath: string;
  fileName: string;
  modified: boolean;
  readOnly: boolean;
  cutBuffer: string | null;
  message: string | null;
  promptState: PromptState;
  showHelp: boolean;
  search: { lastSearchTerm: string };
}

export interface EditorConfig {
  rows: number;
  cols: number;
}

export type EditorResult =
  | { type: "continue" }
  | { type: "exit"; newFs?: VirtualFS };
