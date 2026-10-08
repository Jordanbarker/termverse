// Termoil's authored terminal art and boot/login copy: NexaCorp branding, the
// player's home box (maniac-iv), Coder workspace banners, and the credits roll.
// All of it is story content, so it lives in the app rather than @tt/core.
import { ansi, colorize } from "@tt/core/lib/ansi";
import { IncrementalLine } from "@tt/core";

const HOME_LAST_LOGINS: Record<number, string> = {
  1: "Last login: Sun Feb 22 14:32:07 EST 2026 on tty1",
  2: "Last login: Tue Feb 24 19:12:33 EST 2026 on tty1",
};

export function getHomeWelcome(day = 1): string[] {
  const lastLogin = HOME_LAST_LOGINS[day] ?? HOME_LAST_LOGINS[1];
  return [
    "",
    `${colorize("Ubuntu 24.04.1 LTS", ansi.brightBlue)} ${colorize("maniac-iv tty1", ansi.dim)}`,
    "",
    `${colorize(lastLogin, ansi.dim)}`,
    "",
  ];
}

export const homeWelcome = getHomeWelcome(1);

export function getUpdateNotification(): string[] {
  return [
    "",
    `${colorize("6 updates can be applied immediately.", ansi.yellow)}`,
    `${colorize("3 of these updates are standard security updates.", ansi.yellow)}`,
    `To see these additional updates run: ${colorize("sudo apt update && sudo apt upgrade", ansi.bold)}`,
    "",
  ];
}

export const UNLOCK_BOX = [
  "",
  `  ${colorize("┌─────────────────────────────────────────┐", ansi.cyan)}`,
  `  ${colorize("│", ansi.cyan)}  ${colorize("Additional tools available.", ansi.bold)}${" ".repeat(12)}${colorize("│", ansi.cyan)}`,
  `  ${colorize("│", ansi.cyan)}  Type ${colorize("'help'", ansi.green)} to see all commands.${" ".repeat(7)}${colorize("│", ansi.cyan)}`,
  `  ${colorize("└─────────────────────────────────────────┘", ansi.cyan)}`,
  "",
];

export function getShutdownSequence(): string[] {
  return [
    "",
    `${colorize("Shutting down...", ansi.dim)}`,
    "",
    `${colorize("[  OK  ]", ansi.green)} Stopped user session`,
    `${colorize("[  OK  ]", ansi.green)} Unmounted /home`,
    `${colorize("[  OK  ]", ansi.green)} Reached target shutdown`,
    "",
  ];
}

export function getShutdownIncrementalLines(): IncrementalLine[] {
  const lines: IncrementalLine[] = [];

  // Systemd shutdown lines from getShutdownSequence
  const shutdownLines = getShutdownSequence();
  for (const line of shutdownLines) {
    lines.push({ text: line, delayMs: 100 });
  }

  lines.push({ text: colorize("Powering off...", ansi.dim + ansi.bold), delayMs: 500 });

  return lines;
}

/**
 * Shutdown as seen from an SSH session into the machine being powered off:
 * the wall broadcast, then the connection drops. No systemd stop lines — an
 * SSH session dies before those would render.
 */
export function getRemoteShutdownIncrementalLines(hostname: string): IncrementalLine[] {
  const lines: IncrementalLine[] = [];

  lines.push({ text: "", delayMs: 0 });
  lines.push({
    text: colorize(`Broadcast message from root@${hostname}:`, ansi.yellow),
    delayMs: 200,
  });
  lines.push({
    text: colorize("The system is going down for poweroff NOW!", ansi.yellow),
    delayMs: 200,
  });
  lines.push({ text: "", delayMs: 0 });
  lines.push({ text: `Connection to ${hostname} closed by remote host.`, delayMs: 800 });

  return lines;
}

export const nexacorpLogo = [
  "",
  `  ${colorize("███╗   ██╗███████╗██╗  ██╗ █████╗  ██████╗ ██████╗ ██████╗ ██████╗", ansi.cyan)}`,
  `  ${colorize("████╗  ██║██╔════╝╚██╗██╔╝██╔══██╗██╔════╝██╔═══██╗██╔══██╗██╔══██╗", ansi.cyan)}`,
  `  ${colorize("██╔██╗ ██║█████╗   ╚███╔╝ ███████║██║     ██║   ██║██████╔╝██████╔╝", ansi.brightCyan)}`,
  `  ${colorize("██║╚██╗██║██╔══╝   ██╔██╗ ██╔══██║██║     ██║   ██║██╔══██╗██╔═══╝", ansi.cyan)}`,
  `  ${colorize("██║ ╚████║███████╗██╔╝ ██╗██║  ██║╚██████╗╚██████╔╝██║  ██║██║", ansi.cyan)}`,
  `  ${colorize("╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝", ansi.brightBlack)}`,
  "",
  `  ${colorize("Internal Systems Portal v4.7.2", ansi.brightBlack)}`,
  `  ${colorize("Authorized access only. All activity is monitored.", ansi.brightBlack)}`,
  "",
];

export function getSshConnectionSequence(_username: string): string[] {
  return [
    "",
    `${colorize(`Authenticated to nexacorp-ws01.nexacorp.internal ([10.0.1.47]:22) using "publickey".`, ansi.dim)}`,
    `${colorize(`Last login: Tue Feb 24 08:47:12 2026 from 73.162.44.18`, ansi.dim)}`,
    "",
  ];
}

export function getCoderConnectionSequence(workspace: string = "ai"): string[] {
  return [
    "",
    `${colorize(`Connecting to workspace '${workspace}'...`, ansi.dim)}`,
    `${colorize("Starting workspace agent...", ansi.dim)}`,
    `${colorize("Waiting for network...", ansi.dim)}`,
    `${colorize("Workspace ready.", ansi.green)}`,
  ];
}

const CODER_BANNER_INNER_WIDTH = 42; // characters between the two │ borders

function bannerLine(text: string): string {
  const pad = Math.max(0, CODER_BANNER_INNER_WIDTH - 2 - text.length); // leading 2 spaces consumed
  return `  ${colorize("│", ansi.brightCyan)}  ${colorize(text, ansi.dim)}${" ".repeat(pad)}${colorize("│", ansi.brightCyan)}`;
}

function bannerLineBold(text: string): string {
  const pad = Math.max(0, CODER_BANNER_INNER_WIDTH - 2 - text.length);
  return `  ${colorize("│", ansi.brightCyan)}  ${colorize(text, ansi.bold)}${" ".repeat(pad)}${colorize("│", ansi.brightCyan)}`;
}

export function getCoderBanner(workspace: string = "ai"): string[] {
  // Per-workspace title and tools line. Both workspaces share the dev-container
  // command set, but the chip workspace is the platform team's shared runtime,
  // not a personal data-engineering box.
  const isChip = workspace === "chip";
  const title = isChip ? "Chip Platform Workspace" : "Coder Dev Container";
  const tools = isChip
    ? "Plugins, RAG, Chip runtime"
    : "Tools: dbt, snow, python";
  return [
    `  ${colorize("┌──────────────────────────────────────────┐", ansi.brightCyan)}`,
    bannerLineBold(title),
    bannerLine(`Workspace: ${workspace}`),
    bannerLine(tools),
    bannerLine("Type 'exit' to return to NexaCorp"),
    `  ${colorize("└──────────────────────────────────────────┘", ansi.brightCyan)}`,
    "",
  ];
}

/** Default banner for `coder ssh ai` — preserved for back-compat with existing call sites. */
export const coderBanner = getCoderBanner("ai");

export function getEndgameCreditsBlock(): string[] {
  const rule = colorize("─────────────────────────────────────────────────────────", ansi.brightBlack);
  const heading = (text: string) => colorize(text, ansi.bold);
  const role = (text: string) => colorize(text, ansi.dim);
  const name = (text: string) => colorize(text, ansi.brightWhite);
  return [
    "",
    rule,
    "",
    `  ${heading("Chapter 3 — In Production")}  ${role("· complete")}`,
    `  ${role("Day 2 ended at 21:47.")}`,
    "",
    `  ${heading("Featuring")}`,
    `    ${name("Marcus Reyes")}      ${role("COO")}`,
    `    ${name("Edward Torres")}     ${role("CTO")}`,
    `    ${name("Auri Park")}         ${role("Data Engineer")}`,
    `    ${name("Sarah Knight")}      ${role("Senior Backend")}`,
    `    ${name("Erik Lindstrom")}    ${role("Senior Frontend")}`,
    `    ${name("Oscar Diaz")}        ${role("Infrastructure")}`,
    `    ${name("Dana Okafor")}       ${role("Head of Operations")}`,
    `    ${name("Jordan Kessler")}    ${role("Growth Marketing")}`,
    `    ${name("Maya Johnson")}      ${role("People & Culture")}`,
    `    ${name("Cassie Moreau")}     ${role("Product Design")}`,
    `    ${name("Soham Parekh")}      ${role("Full-Stack")}`,
    `    ${name("Sabu")}              ${role("Anonymous tipster")}`,
    `    ${name("Olive Borden")}      ${role("Friend, off-grid")}`,
    `    ${name("Alex Rivera")}       ${role("Friend")}`,
    "",
    `    ${role("with")} ${name("Chip")} ${role("and")} ${name("Piper")}`,
    "",
    rule,
    "",
    `  ${colorize("Thanks for playing.", ansi.bold)}`,
    `  ${role("Chapter 4 — to be continued.")}`,
    "",
    rule,
    "",
  ];
}

export function getHomeBootSequence(): string[] {
  return [
    colorize("BIOS POST... OK", ansi.dim),
    colorize("Loading Linux 6.8.0-49-generic ...", ansi.dim),
    "",
    `${colorize("[  OK  ]", ansi.green)} Reached target - Local File Systems.`,
    `${colorize("[  OK  ]", ansi.green)} Started systemd-journald.service - Journal Service.`,
    `${colorize("[  OK  ]", ansi.green)} Started NetworkManager.service - Network Manager.`,
    `${colorize("[  OK  ]", ansi.green)} Reached target - Network.`,
    `${colorize("[  OK  ]", ansi.green)} Started systemd-logind.service - User Login Management.`,
    `${colorize("[  OK  ]", ansi.green)} Started getty@tty1.service - Getty on tty1.`,
    "",
  ];
}

export function getBootSequence(username: string) {
  return [
  `${colorize("[  OK  ]", ansi.green)} Starting NexaCorp session manager...`,
  `${colorize("[  OK  ]", ansi.green)} Mounting user environment /home/${username}`,
  `${colorize("[  OK  ]", ansi.green)} Loading Chip AI assistant...`,
  `${colorize("[  OK  ]", ansi.green)} Synchronizing project repositories...`,
  `${colorize("[  OK  ]", ansi.green)} Applying security policies...`,
  `${colorize("[  OK  ]", ansi.green)} Session ready.`,
];
}

