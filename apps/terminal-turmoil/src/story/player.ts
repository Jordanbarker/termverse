import { ComputerId } from "../state/types";

export const PLAYER = {
  displayName: "Ren",   // Narrative text, documents, sign-offs
  username: "ren",      // Unix username (paths, prompts, emails)
} as const;

export const COMPUTERS: Record<ComputerId, { hostname: string; promptHostname: string; ip: string; username?: string }> = {
  home: { hostname: "maniac-iv", promptHostname: "maniac-iv", ip: "192.168.1.42" },
  nexacorp: { hostname: "nexacorp-ws01", promptHostname: "nexacorp-ws01", ip: "10.20.5.17" },
  devcontainer: { hostname: "coder-ai", promptHostname: "coder-ai", ip: "172.18.0.5" },
  chipinfra: { hostname: "coder-chip", promptHostname: "coder-chip", ip: "10.50.1.128" },
  "erik-pc": { hostname: "nexacorp-lt05", promptHostname: "nexacorp-lt05", ip: "10.20.5.84", username: "erik" },
};

/** Returns the shell username for a given computer. Defaults to the player's username unless the computer is owned by another user (e.g. erik-pc). */
export function getComputerUsername(computer: ComputerId, playerUsername: string): string {
  return COMPUTERS[computer].username ?? playerUsername;
}

/**
 * Connection topology: which machine each remote session was opened from.
 * Doubles as the landing target when a remote box powers off under an SSH
 * session (shutdown returns you to the machine you connected from).
 */
export const CONNECTION_PARENT: Partial<Record<ComputerId, ComputerId>> = {
  nexacorp: "home",
  devcontainer: "nexacorp",
  chipinfra: "nexacorp",
  "erik-pc": "chipinfra",
};

/**
 * The machine plus every machine whose connection chain rides through it.
 * A rebooting/stopped box kills not just its own SSH sessions but any session
 * tunneled through it (e.g. nexacorp going down also drops devcontainer,
 * chipinfra, and erik-pc).
 */
export function getConnectionClosure(computer: ComputerId): ComputerId[] {
  const closure = new Set<ComputerId>([computer]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [child, parent] of Object.entries(CONNECTION_PARENT) as [ComputerId, ComputerId][]) {
      if (closure.has(parent) && !closure.has(child)) {
        closure.add(child);
        grew = true;
      }
    }
  }
  return [...closure];
}
