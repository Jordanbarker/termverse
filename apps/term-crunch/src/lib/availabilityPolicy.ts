import type { AvailabilityPolicy } from "@tt/core/commands/availability";
import { setAvailabilityPolicy } from "@tt/core/commands/availability";
import { getPrimaryName } from "@tt/core/commands/registry";
import { CHALLENGES } from "../challenges/registry";
import { useGameStore } from "../state/gameStore";

/**
 * Per-challenge command allowlist (term-crunch). Each challenge may declare a
 * `commands` list of the builtins it needs; this policy hides everything else
 * from `help` + TAB/ghost-text suggestions (via `getAvailableCommands`) and
 * blocks it at run time (via `execute`). A challenge with no `commands` list
 * keeps the engine default of allow-all.
 *
 * `help` and `clear` are always available so the player can orient and reset.
 *
 * Mirrors termoil's src/story/availabilityPolicy.ts seam usage; the
 * current challenge is read lazily from the store so import order doesn't matter.
 */
const ALWAYS_AVAILABLE = new Set(["help", "clear"]);

function isAvailable(commandName: string): boolean {
  const challenge = CHALLENGES[useGameStore.getState().challengeIndex];
  if (!challenge?.commands) return true; // no allowlist → allow all
  if (ALWAYS_AVAILABLE.has(commandName)) return true;
  return challenge.commands.includes(getPrimaryName(commandName));
}

function unavailableMessage(commandName: string): string {
  return `\x1b[33m${commandName} isn't needed for this challenge. Type 'help' to see what is.\x1b[0m`;
}

export const CRUNCH_AVAILABILITY_POLICY: AvailabilityPolicy = { isAvailable, unavailableMessage };

setAvailabilityPolicy(CRUNCH_AVAILABILITY_POLICY);
