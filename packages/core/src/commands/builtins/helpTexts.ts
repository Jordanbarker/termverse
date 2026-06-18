export const HELP_TEXTS: Record<string, string> = {
  pwd: [
    "Usage: pwd",
    "",
    "Print the full filename of the current working directory.",
  ].join("\n"),

  cd: [
    "Usage: cd [DIRECTORY]",
    "",
    "Change the current directory to DIRECTORY.",
    "If no DIRECTORY is given, change to the home directory (~).",
    "",
    "  cd ..         Go up one level",
    "  cd ~          Go to home directory",
    "  cd /path      Go to absolute path",
  ].join("\n"),

  ls: [
    "Usage: ls [OPTION]... [FILE]...",
    "",
    "List directory contents.",
    "",
    "  -a, --all              do not ignore entries starting with .",
    "  -A, --almost-all       like -a but do not list . and ..",
    "  -C                     list entries by columns",
    "  -F                     append indicator (one of */) to entries",
    "  -l                     use a long listing format",
    "  -h, --human-readable   print sizes in human readable format",
  ].join("\n"),

  cat: [
    "Usage: cat [-n] [FILE]...",
    "",
    "Concatenate FILE(s) and print to standard output.",
    "With no FILE, or when FILE is missing, display an error.",
    "",
    "  -n   number all output lines",
  ].join("\n"),

  clear: [
    "Usage: clear",
    "",
    "Clear the terminal screen.",
  ].join("\n"),

  nano: [
    "Usage: nano [FILE]",
    "",
    "Open FILE in the nano text editor.",
    "If FILE does not exist, create a new file.",
    "",
    "  Ctrl+S   Save the file",
    "  Ctrl+X   Exit the editor",
  ].join("\n"),

  mail: [
    "Usage: mail [MESSAGE_NUMBER]",
    "       mail -s SUBJECT RECIPIENT",
    "",
    "Read and send email.",
    "",
    "  mail              Show inbox listing",
    "  mail N            Read message number N",
    "  mail -s SUB TO    Send a message with subject SUB to recipient TO",
  ].join("\n"),

  python: [
    "Usage: python [FILE] [-c CODE]",
    "",
    "Run the Python interpreter.",
    "",
    "  python              Start interactive REPL",
    "  python script.py    Run a Python script",
    "  python -c 'code'    Execute Python code inline",
  ].join("\n"),

  snow: [
    "Usage: snow COMMAND [OPTIONS]",
    "",
    "Snowflake CLI: query the NexaCorp data warehouse.",
    "",
    "Commands:",
    "  sql    Execute SQL queries",
    "",
    "  snow sql             Start interactive SQL REPL",
    "  snow sql -q 'SQL'    Execute a single query inline",
  ].join("\n"),

  dbt: [
    "Usage: dbt COMMAND [OPTIONS]",
    "",
    "dbt (data build tool): transform data in the warehouse.",
    "",
    "  dbt run              Run all models",
    "  dbt test             Run data tests",
    "  dbt build            Run models then tests",
    "  dbt ls               List resources",
    "  dbt debug            Show connection info",
    "  dbt compile          Show compiled SQL",
    "  dbt show             Preview model output",
    "  dbt --version        Show dbt version",
  ].join("\n"),

  grep: [
    "Usage: grep [OPTIONS] PATTERN [FILE...]",
    "",
    "Search for PATTERN in each FILE.",
    "",
    "  -r, -R        search recursively",
    "  -i            ignore case distinctions",
    "  -n            print line numbers",
    "  -l            print only filenames with matches",
    "  -c            print only a count of matching lines",
    "  -v            invert match (select non-matching lines)",
  ].join("\n"),

  find: [
    "Usage: find [PATH] [EXPRESSIONS]",
    "",
    "Search for files in a directory hierarchy.",
    "",
    "  -name PATTERN   match filename (supports * and ? globs)",
    "  -type f|d       match file type (f=file, d=directory)",
  ].join("\n"),

  head: [
    "Usage: head [-n LINES] [FILE...]",
    "",
    "Display the first 10 lines of each FILE.",
    "",
    "  -n NUM   output the first NUM lines",
  ].join("\n"),

  tail: [
    "Usage: tail [-n LINES] [FILE...]",
    "",
    "Display the last 10 lines of each FILE.",
    "",
    "  -n NUM   output the last NUM lines",
    "  -f       follow appended data (not supported in this terminal)",
  ].join("\n"),

  less: [
    "Usage: less [FILE]",
    "",
    "View file contents with paging. With no FILE, read from standard input.",
    "",
    "  q  Ctrl+C       Quit",
    "  j  Down  Enter  Forward one line",
    "  k  Up           Backward one line",
    "  Space  f  PgDn  Forward one page",
    "  b  PgUp         Backward one page",
    "  g               Go to first line",
    "  G               Go to last line",
    "  /pattern        Search forward",
    "  ?pattern        Search backward",
    "  n / N           Next / previous match",
    "  Ctrl+L          Redraw screen",
    "  h               In-pager help",
  ].join("\n"),

  diff: [
    "Usage: diff [OPTION]... FILE1 FILE2",
    "",
    "Compare two files line by line.",
    "Lines only in FILE1 are shown with - (red).",
    "Lines only in FILE2 are shown with + (green).",
    "",
    "  -u   output in unified format with @@ hunk headers",
    "  -r   recursively compare any subdirectories found",
  ].join("\n"),

  wc: [
    "Usage: wc [OPTION]... [FILE...]",
    "",
    "Print line, word, and byte counts for each FILE.",
    "",
    "  -l                     print the line count",
    "  -w                     print the word count",
    "  -c                     print the character count",
    "  -h, --human-readable   print byte counts in human readable format",
  ].join("\n"),

  echo: [
    "Usage: echo [-n] [TEXT...]",
    "",
    "Print TEXT to standard output.",
    "",
    "  -n   do not output trailing newline",
  ].join("\n"),

  chmod: [
    "Usage: chmod [-R] MODE FILE...",
    "",
    "Change file permissions. MODE may be octal or symbolic.",
    "",
    "  -R, --recursive   change permissions recursively",
    "",
    "Octal mode: three digits for owner, group, others.",
    "  7 = rwx, 6 = rw-, 5 = r-x, 4 = r--, 0 = ---",
    "",
    "Symbolic mode: [ugoa][+-=][rwx][,...]",
    "  u=owner, g=group, o=others, a=all (default)",
    "  + add, - remove, = set exactly",
    "",
    "Examples:",
    "  chmod 755 dir/       owner=rwx, group=r-x, others=r-x",
    "  chmod +x script.sh   add execute for everyone",
    "  chmod u+w,go-r f     give owner write, strip group/other read",
    "  chmod -R 750 src/    apply 750 recursively",
  ].join("\n"),

  mkdir: [
    "Usage: mkdir [-p] DIRECTORY...",
    "",
    "Create directories.",
    "",
    "  -p   create parent directories as needed",
  ].join("\n"),

  rm: [
    "Usage: rm [OPTION]... FILE...",
    "",
    "Remove files or directories.",
    "",
    "  -r, -R   remove directories and their contents recursively",
    "  -f       ignore nonexistent files, never prompt",
  ].join("\n"),

  mv: [
    "Usage: mv SOURCE DEST",
    "",
    "Move (rename) files or directories.",
    "If DEST is an existing directory, SOURCE is moved inside it.",
    "Directories move recursively; no flag required.",
  ].join("\n"),

  cp: [
    "Usage: cp [OPTION]... SOURCE DEST",
    "",
    "Copy files and directories.",
    "",
    "  -r, -R   copy directories recursively",
  ].join("\n"),

  touch: [
    "Usage: touch FILE...",
    "",
    "Create empty files or update timestamps.",
  ].join("\n"),

  history: [
    "Usage: history",
    "",
    "Display command history.",
  ].join("\n"),

  whoami: [
    "Usage: whoami",
    "",
    "Print the current username.",
  ].join("\n"),

  hostname: [
    "Usage: hostname [-I]",
    "",
    "Print the system hostname.",
    "",
    "  -I   list all configured IP addresses",
  ].join("\n"),

  file: [
    "Usage: file FILE...",
    "",
    "Determine file type.",
  ].join("\n"),

  pdftotext: [
    "Usage: pdftotext FILE",
    "",
    "Extract text content from a PDF file.",
  ].join("\n"),

  tree: [
    "Usage: tree [OPTION]... [DIRECTORY]",
    "",
    "List contents of directories in a tree-like format.",
    "",
    "  -a, --all   all files are listed",
    "  -L NUM      descend only NUM directory levels deep",
  ].join("\n"),

  sort: [
    "Usage: sort [OPTION]... [FILE]",
    "",
    "Sort lines of text.",
    "",
    "  -r   reverse the result of comparisons",
    "  -n   compare according to string numerical value",
    "  -u   output only the first of an equal run",
  ].join("\n"),

  uniq: [
    "Usage: uniq [OPTION]... [FILE]",
    "",
    "Filter adjacent duplicate lines.",
    "",
    "  -c   prefix lines by the number of occurrences",
    "  -d   only print duplicate lines",
    "  -i   ignore differences in case when comparing",
  ].join("\n"),

  date: [
    "Usage: date",
    "",
    "Display the current date and time.",
  ].join("\n"),

  which: [
    "Usage: which COMMAND",
    "",
    "Show the full path of a command.",
  ].join("\n"),

  command: [
    "Usage: command -v COMMAND",
    "",
    "Print the path of COMMAND, or nothing if not found.",
    "POSIX-portable alternative to 'which'.",
  ].join("\n"),

  type: [
    "Usage: type [-a] COMMAND...",
    "",
    "Describe how COMMAND would be interpreted (path, alias, builtin).",
    "",
    "  -a   show all locations where COMMAND can be found",
  ].join("\n"),

  man: [
    "Usage: man COMMAND",
    "",
    "Display manual page for COMMAND.",
  ].join("\n"),

  df: [
    "Usage: df [-h]",
    "",
    "Report filesystem disk space usage.",
    "",
    "  -h, --human-readable   print sizes in human readable format",
  ].join("\n"),

  lsblk: [
    "Usage: lsblk [OPTION]...",
    "",
    "List information about all available block devices.",
    "",
    "  -a   include empty devices",
    "  -f   show filesystem type and mountpoints",
  ].join("\n"),

  mount: [
    "Usage: mount [DEVICE DIR]",
    "",
    "Mount a filesystem at DIR. With no arguments, list active mounts.",
    "DIR must be an existing empty directory.",
    "",
    "Examples:",
    "  lsblk                      list block devices to find the partition",
    "  mount /dev/sdb1 /mnt/usb   mount the USB partition at /mnt/usb",
    "  mount                      list what is currently mounted",
  ].join("\n"),

  umount: [
    "Usage: umount {DIR | DEVICE}",
    "",
    "Unmount a filesystem. The argument may be the mountpoint or the device.",
  ].join("\n"),

  git: [
    "Usage: git <command> [<args>]",
    "",
    "The distributed version control system.",
    "",
    "  git init                    Create an empty repository",
    "  git clone <url>             Clone a remote repository",
    "  git add <file|.>            Stage changes for commit",
    "  git commit -m 'msg'         Record changes to the repository",
    "  git status [-s]             Show the working tree status",
    "  git log [--oneline]         Show commit history",
    "  git branch [-a|-r] [<name>|-d <name>] List, create, or delete branches",
    "  git switch [-c] <branch>    Switch (or create and switch) branches",
    "  git checkout [-b] <branch>  Switch or create branches (legacy)",
    "  git diff [--staged]         Show changes",
    "  git push [-u] [origin br]   Update remote refs",
    "  git pull [origin branch]    Fetch and merge from remote",
    "  git rm [-r] <file>          Remove files from tracking",
    "  git stash [pop|list]        Stash working changes",
  ].join("\n"),

  bash: [
    "Usage: bash [SCRIPT] [-c COMMAND]",
    "",
    "Execute shell scripts or commands.",
    "",
    "  bash script.sh       Run a shell script",
    "  bash -c 'command'    Execute a command string",
    "  ./script.sh          Run an executable script directly",
  ].join("\n"),

  source: [
    "Usage: source FILENAME",
    "",
    "Execute commands from a file in the current shell.",
    "",
    "  source ~/.zshrc      Reload shell configuration",
    "  . ~/.zshrc           Shorthand (POSIX dot command)",
  ].join("\n"),

  help: [
    "Usage: help",
    "",
    "List available commands.",
    "Use man <command> for detailed usage.",
  ].join("\n"),

  save: [
    "Usage: save [1|2|3]",
    "",
    "Save game state to a numbered slot.",
    "If no slot is given, save to slot 1.",
  ].join("\n"),

  load: [
    "Usage: load [1|2|3|auto]",
    "",
    "Restore game from a save slot.",
    "Use 'auto' to load the most recent autosave.",
  ].join("\n"),

  newgame: [
    "Usage: newgame",
    "",
    "Start a fresh game, erasing current progress.",
  ].join("\n"),

  sudo: [
    "Usage: sudo COMMAND [ARG ...]",
    "",
    "Run a command with elevated privileges.",
    "Required for system operations like installing packages.",
  ].join("\n"),

  apt: [
    "Usage: apt <command> [options]",
    "",
    "Commands:",
    "  update     Update package lists from repositories",
    "  upgrade    Upgrade all upgradable packages",
    "  install    Install new packages",
    "",
    "Requires sudo.",
  ].join("\n"),

  ssh: [
    "Usage: ssh [user@]hostname",
    "",
    "Open a secure shell connection to a remote host.",
    "Reads ~/.ssh/config for host aliases.",
  ].join("\n"),

  "ssh-add": [
    "Usage: ssh-add [-lL]",
    "",
    "Adds private key identities to the OpenSSH authentication agent.",
    "",
    "  -l   List fingerprints of all identities currently represented by the agent.",
    "  -L   List public-key parameters of all identities currently represented by the agent.",
    "",
    "Reads SSH_AUTH_SOCK to locate the agent. If unset, prints",
    "\"Could not open a connection to your authentication agent.\" and exits 2.",
  ].join("\n"),

  coder: [
    "Usage: coder <subcommand> [options]",
    "",
    "Manage Coder remote development workspaces.",
    "",
    "  coder list            List workspaces",
    "  coder start <name>    Start a workspace",
    "  coder stop <name>     Stop a workspace",
    "  coder ssh <name>      SSH into a workspace",
    "  coder logs <name>     Show workspace build logs",
    "  coder create          Create a new workspace",
    "  coder delete          Delete a workspace",
  ].join("\n"),

  chip: [
    "Usage: chip",
    "",
    "Start an interactive session with Chip, NexaCorp's AI assistant.",
  ].join("\n"),

  piper: [
    "Usage: piper",
    "",
    "Open Piper, the team messaging client.",
    "Read channel messages and reply to direct messages from colleagues.",
  ].join("\n"),

  shutdown: [
    "Usage: shutdown [-h now]",
    "",
    "Power off the system.",
    "",
    "  shutdown          Begin shutdown (60-second delay)",
    "  shutdown -h now   Halt and power off immediately",
  ].join("\n"),

  printenv: [
    "Usage: printenv [VARIABLE]...",
    "",
    "Print the values of the specified environment VARIABLE(s).",
    "If no VARIABLE is specified, print all environment variables.",
  ].join("\n"),

  export: [
    "Usage: export [NAME=VALUE]...",
    "",
    "Set environment variables in the current shell.",
    "With no arguments, list all exported variables.",
  ].join("\n"),

  alias: [
    "Usage: alias [name[=value] ...]",
    "",
    "Define or display aliases.",
    "With no arguments, list all defined aliases.",
    "",
    "  alias              List all aliases",
    "  alias name         Show definition for name",
    "  alias name='cmd'   Define name as an alias for cmd",
  ].join("\n"),

  unalias: [
    "Usage: unalias [-a] name ...",
    "",
    "Remove alias definitions.",
    "",
    "  unalias name       Remove the alias for name",
    "  unalias -a         Remove all aliases",
  ].join("\n"),
};
