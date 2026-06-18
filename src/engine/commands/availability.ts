import { ComputerId, StoryFlags } from "../../state/types";

/**
 * Command-availability seam (core, story-agnostic).
 *
 * Which commands are usable on which machine (and behind which flags) is a
 * per-game decision. The app registers an AvailabilityPolicy; the engine only
 * consults it. The default policy allows every registered command everywhere,
 * so a game that does not gate anything needs no policy at all.
 *
 * terminal-turmoil registers its policy from src/story/availabilityPolicy.ts.
 */
export interface AvailabilityPolicy {
  /** Is `commandName` usable on `computer` given the current flags? */
  isAvailable(commandName: string, computer: ComputerId, flags?: StoryFlags): boolean;
  /**
   * Message shown when an unavailable command is run. Return null to use the
   * generic "command not found". The engine applies exitCode 127 either way.
   */
  unavailableMessage?(commandName: string, computer: ComputerId): string | null;
}

const ALLOW_ALL: AvailabilityPolicy = { isAvailable: () => true };

let activePolicy: AvailabilityPolicy = ALLOW_ALL;

/** Register the active availability policy (call once at app startup). */
export function setAvailabilityPolicy(policy: AvailabilityPolicy): void {
  activePolicy = policy;
}

/** Restore the default allow-all policy (used by tests for isolation). */
export function resetAvailabilityPolicy(): void {
  activePolicy = ALLOW_ALL;
}

/** Returns true if the command is available on the given computer. */
export function isCommandAvailable(commandName: string, computer: ComputerId, storyFlags?: StoryFlags): boolean {
  return activePolicy.isAvailable(commandName, computer, storyFlags);
}

/** App-defined message for an unavailable command, or null for the generic one. */
export function unavailableCommandMessage(commandName: string, computer: ComputerId): string | null {
  return activePolicy.unavailableMessage?.(commandName, computer) ?? null;
}
