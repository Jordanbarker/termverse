import type { AvailabilityPolicy } from "@tt/core/commands/availability";
import { setAvailabilityPolicy } from "@tt/core/commands/availability";
import { getPrimaryName } from "@tt/core/commands/registry";
import { getCategory } from "../challenges/categories";
import { useGameStore } from "../state/gameStore";

/**
 * Per-challenge command allowlist (term-crunch). Each challenge may declare a
 * `commands` list of the builtins it needs; this policy hides everything else
 * from `help` + TAB/ghost-text suggestions (via `getAvailableCommands`) and
 * blocks it at run time (via `execute`). **Omitting `commands` entirely** keeps
 * the engine default of allow-all; `commands: []` does NOT — an empty array is
 * truthy, so it falls through to the `includes` check and restricts the player
 * to ALWAYS_AVAILABLE. That's deliberate: it's what the keyboard-only tmux
 * challenges rely on.
 *
 * `help`, `clear`, `man`, `shortcuts`, and `tmux` are always available so the player can
 * orient, reset, read the manual, and drive the session lifecycle, and the challenge-navigation builtins
 * (`challenges`/`goto`/`next`/`prev`/`track`/`review`/`restart`, engine/commands/navigation.ts)
 * so the player can always move between challenges. `man` self-scopes:
 * `man <cmd>` only renders a page for commands the current challenge allows
 * (core `man.ts` checks availability), so it returns "No manual entry" for
 * off-list commands. `ls`, `pwd`, and `cd` are also always allowed as harmless
 * read-only orientation: players reflexively reach for them (especially in the
 * keyboard-only tmux challenges), they can never satisfy a challenge predicate, and
 * most non-tmux challenges list them anyway; the vim challenges (vim/cat/ls only)
 * and shell challenges (no pwd) rely on this fallback.
 *
 * Mirrors termoil's src/story/availabilityPolicy.ts seam usage; the
 * current challenge is read lazily from the store so import order doesn't matter.
 */
const ALWAYS_AVAILABLE = new Set(["help", "clear", "man", "shortcuts", "tmux", "ls", "pwd", "cd", "challenges", "goto", "next", "prev", "track", "review", "restart"]);

function isAvailable(commandName: string): boolean {
  const { activeCategory, challengeIndex } = useGameStore.getState();
  const challenge = getCategory(activeCategory).challenges[challengeIndex];
  if (!challenge?.commands) return true; // no allowlist → allow all
  if (ALWAYS_AVAILABLE.has(commandName)) return true;
  return challenge.commands.includes(getPrimaryName(commandName));
}

function unavailableMessage(commandName: string): string {
  return `\x1b[33m${commandName} isn't needed for this challenge. Type 'help' to see what is.\x1b[0m`;
}

export const CRUNCH_AVAILABILITY_POLICY: AvailabilityPolicy = { isAvailable, unavailableMessage };

setAvailabilityPolicy(CRUNCH_AVAILABILITY_POLICY);
