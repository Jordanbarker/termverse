import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Terminal } from "@xterm/xterm";
import { parseZshHistory } from "@tt/core/terminal/zshHistory";
import { LineEditor } from "@tt/core/terminal/lineEditor";
import { useGameStore } from "../../state/gameStore";
import { buildFs } from "../../state/saveManager";
import { PLAYER } from "../../story/player";
import { useTerminal } from "../useTerminal";

// Exercise the real command queue and session router without mounting a UI.
// Each test creates one hook instance and keeps the same pane throughout.
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useCallback: <T,>(callback: T) => callback,
  useRef: <T,>(value: T) => ({ current: value }),
  useEffect: () => {},
}));

vi.mock("../useCommandLine", () => ({
  useCommandLine: () => {
    const editor = new LineEditor({
      getContext: () => null,
      getHistory: () => [],
      getPrompt: () => "$ ",
    });
    return { handleData: (term: Terminal, data: string) => editor.handleData(term, data) };
  },
}));

vi.hoisted(() => {
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
});

const HOME = `/home/${PLAYER.username}`;
const HIST_PATH = `${HOME}/.zsh_history`;
const FILE_PATH = `${HOME}/editor-history.txt`;

function currentFs() {
  return useGameStore.getState().computerState.home!.fs;
}

function history() {
  return parseZshHistory(currentFs().readFile(HIST_PATH).content ?? "");
}

function terminal() {
  return { write: vi.fn(), clear: vi.fn(), rows: 24, cols: 80 } as unknown as Terminal;
}

beforeEach(() => {
  useGameStore.getState().resetGame();
  let fs = buildFs(PLAYER.username, "home");
  fs = fs.writeFile(FILE_PATH, "original\n").fs!;
  fs = fs.writeFile(HIST_PATH, "pwd\n").fs!;
  useGameStore.getState().initComputer("home", fs);
});

async function openEditor(command: string) {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- React hooks are mocked for this headless harness.
  const shell = useTerminal();
  const term = terminal();
  shell.handleInput(term, command + "\r");
  await vi.waitFor(() => {
    expect(shell.getActiveSessionType()).toBe("editor");
    expect(history()).toEqual(["pwd", command]);
  });
  expect(term.write).not.toHaveBeenCalledWith("\r\n" + shell.getPrompt());
  expect(term.write).not.toHaveBeenCalledWith(shell.getPrompt());
  return { shell, term };
}

describe("editor commands retain shell history", () => {
  it.each(["vi", "vim", "nano"])("keeps %s in history when quitting without saving", async (editor) => {
    const command = `${editor} editor-history.txt`;
    const { shell, term } = await openEditor(command);
    if (editor === "nano") {
      shell.handleInput(term, "\x18"); // Ctrl+X
    } else {
      shell.handleInput(term, ":q\r");
    }

    expect(shell.getActiveSessionType()).toBeNull();
    expect(history()).toEqual(["pwd", command]);
    expect(useGameStore.getState().zshHistory.home).toBe(currentFs().readFile(HIST_PATH).content);
    expect(currentFs().readFile(FILE_PATH).content).toBe("original\n");
    expect(term.write).toHaveBeenLastCalledWith(shell.getPrompt());
  });

  it.each(["vi", "vim"])("keeps %s in history through :wq", async (editor) => {
    const command = `${editor} editor-history.txt`;
    const { shell, term } = await openEditor(command);
    shell.handleInput(term, "iupdated \x1b");
    shell.handleInput(term, ":wq\r");

    expect(shell.getActiveSessionType()).toBeNull();
    expect(history()).toEqual(["pwd", command]);
    expect(currentFs().readFile(FILE_PATH).content).toBe("updated original\n");
  });

  it.each(["vi", "vim", "nano"])("keeps %s in history when saving and exiting", async (editor) => {
    const command = `${editor} editor-history.txt`;
    const { shell, term } = await openEditor(command);
    if (editor === "nano") {
      shell.handleInput(term, "updated ");
      shell.handleInput(term, "\x0f"); // Ctrl+O
      shell.handleInput(term, "\r");
    } else {
      shell.handleInput(term, "iupdated \x1b");
      shell.handleInput(term, ":w\r");
    }
    expect(history()).toEqual(["pwd", command]);
    expect(currentFs().readFile(FILE_PATH).content).toBe("updated original\n");

    shell.handleInput(term, editor === "nano" ? "\x18" : ":q\r");
    expect(shell.getActiveSessionType()).toBeNull();
    expect(history()).toEqual(["pwd", command]);
    expect(currentFs().readFile(FILE_PATH).content).toBe("updated original\n");
  });

  it("commits preceding chain changes and stops at the editor", async () => {
    const command = "cat editor-history.txt > copy.txt; vi copy.txt; cat editor-history.txt > skipped.txt";
    const { shell, term } = await openEditor(command);
    expect(currentFs().readFile(`${HOME}/copy.txt`).content).toBe("original\n");
    expect(currentFs().getNode(`${HOME}/skipped.txt`)).toBeNull();

    shell.handleInput(term, ":q\r");
    expect(history()).toEqual(["pwd", command]);
    expect(currentFs().readFile(`${HOME}/copy.txt`).content).toBe("original\n");
    expect(currentFs().getNode(`${HOME}/skipped.txt`)).toBeNull();
  });
});
