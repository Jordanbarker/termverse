import { DirectoryNode } from "@tt/core/filesystem/types";
import { file, dir } from "@tt/core/filesystem/builders";
import { buildDotfiles } from "./dotfiles";
import { buildDesktopFiles } from "./desktop";
import { buildDownloadsDir } from "./downloads";
import { buildScriptsDir } from "./scripts";
import { buildSystemDirs } from "./system";

// Content for terminal_notes.txt — a nano tutorial with a commands reference section.
const TERMINAL_NOTES_CONTENT = `# Terminal Notes

Keeping a running list of useful commands as I'm getting used to terminal.

Starting with nano! Maybe I'll add vim commands later if I feel brave.

(command cheat sheet is further down)

## Moving Around:
  Arrow keys   - move the cursor
  Page Up/Down - jump one screen at a time
  Home / End   - jump to start / end of a line

## Editing:
  Just type    - insert text at the cursor
  Backspace    - delete character before cursor
  Ctrl+K       - cut the current line
  Ctrl+U       - paste the cut line

## Saving & Exiting:
  Ctrl+O       - save the file (Write Out)
  Ctrl+X       - exit nano
               (if you've made changes, it will ask to save)

## Good to know:
  - Ctrl+G shows the help screen inside nano
  - Use Tab to autocomplete file names at the terminal
  - Ctrl+C cancels the current action

## Searching:
  Ctrl+W       - search for text (Where Is)
  Ctrl+W again - repeat the last search
  Alt+W        - search backwards
               (great for finding things in long files)

## Undo / Redo:
  Alt+U        - undo the last action
  Alt+E        - redo the last undone action
               (this one took forever to find)

---

## Commands I've learned so far:

  ls     - list files in a directory
  cd     - change directory (cd .. to go up)
  cat    - display contents of a file
  pwd    - show current directory
  mail   - check email
  nano   - edit files (this editor!)
  help   - list all available commands

## Reminders:
  - 'help' lists everything available
`;

export function createHomeFilesystem(username: string): DirectoryNode {
  return dir("/", {
    home: dir("home", {
      [username]: dir(username, {
        "terminal_notes.txt": file("terminal_notes.txt", TERMINAL_NOTES_CONTENT),
        "job_search_log.txt": file("job_search_log.txt", `LinkedIn
Indeed
LinkedIn
LinkedIn
Glassdoor
Company website
Indeed
LinkedIn
Glassdoor
LinkedIn
Company website
`),
        ...buildDotfiles(username),
        ...buildDesktopFiles(),
        Downloads: buildDownloadsDir(),
        scripts: buildScriptsDir(username),
      }),
    }),
    ...buildSystemDirs(username),
  });
}
