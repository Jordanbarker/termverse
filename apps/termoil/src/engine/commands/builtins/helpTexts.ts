import { HELP_TEXTS as CORE_HELP_TEXTS } from "@tt/core/commands/builtins/helpTexts";

/**
 * Help text for termoil's own builtins. Core's HELP_TEXTS covers exactly the
 * commands core registers; anything registered by this app (story commands,
 * machine navigation, save control) documents itself here.
 */
export const TERMOIL_HELP_TEXTS: Record<string, string> = {
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

  hostname: [
    "Usage: hostname [-I]",
    "",
    "Print the system hostname.",
    "",
    "  -I   list all configured IP addresses",
  ].join("\n"),

  exit: [
    "Usage: exit",
    "",
    "Exit the current remote session (e.g. after ssh), returning to the previous shell.",
  ].join("\n"),

  save: [
    "Usage: save [1|2|3]",
    "",
    "Save game state to a numbered slot.",
    "With no slot, list the three slots and what each one holds.",
  ].join("\n"),

  load: [
    "Usage: load [1|2|3]",
    "",
    "Restore game from a numbered save slot.",
    "With no slot, list the three slots and what each one holds.",
  ].join("\n"),

  newgame: [
    "Usage: newgame",
    "",
    "Start a fresh game, erasing current progress.",
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
    "  coder list            List workspaces (alias: coder ls)",
    "  coder start <name>    Start a workspace",
    "  coder stop <name>     Stop a workspace",
    "  coder ssh <name>      SSH into a workspace",
    "  coder logs <name>     Show workspace build logs",
    "  coder create          Create a new workspace (requires admin permissions)",
    "  coder delete          Delete a workspace (requires admin permissions)",
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
    "Usage: shutdown [-h] [now] or shutdown -c",
    "",
    "Power off the system.",
    "",
    "  shutdown          Schedule poweroff in 60 seconds; keep using the shell",
    "  shutdown now      Power off immediately",
    "  shutdown -h now   Halt and power off immediately",
    "  shutdown -c       Cancel a scheduled shutdown",
  ].join("\n"),
};

/** Every help text reachable in termoil: the core engine's plus this app's. */
export const HELP_TEXTS: Record<string, string> = { ...CORE_HELP_TEXTS, ...TERMOIL_HELP_TEXTS };

/**
 * man NAME lines for this app's builtins — the terse whatis-style summary, not
 * the `help` listing text. Registered with core's man page from builtins/index.ts.
 * A command with no entry here renders its bare name, same as core's default.
 */
export const TERMOIL_MAN_SUMMARIES: Record<string, string> = {
  mail: "send and receive email",
  hostname: "show or set the system's host name",
  save: "save game state",
  load: "restore game from a save slot",
  newgame: "start a fresh game",
  apt: "package manager",
  ssh: "remote login program",
  chip: "NexaCorp AI assistant",
  piper: "team messaging",
};
