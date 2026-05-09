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
  "erik-pc": { hostname: "erik-laptop", promptHostname: "erik-laptop", ip: "192.168.1.84", username: "erik" },
};

/** Returns the shell username for a given computer. Defaults to the player's username unless the computer is owned by another user (e.g. erik-pc). */
export function getComputerUsername(computer: ComputerId, playerUsername: string): string {
  return COMPUTERS[computer].username ?? playerUsername;
}
