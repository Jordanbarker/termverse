import { ComputerId, StoryFlags } from "../state/types";
import { AvailabilityPolicy, setAvailabilityPolicy } from "../engine/commands/availability";
import {
  HOME_COMMANDS,
  NEXACORP_GATED,
  HOME_GATED,
  DEVCONTAINER_COMMANDS,
  NEXACORP_ONLY,
  DEVCONTAINER_ONLY,
  HOME_ONLY,
} from "./commandGates";
import { colorize, ansi } from "../lib/ansi";

/** Per-command hint shown when a NexaCorp command is gated. */
const NEXACORP_GATE_HINTS: Record<string, string> = {
  coder: "Read your email and check with Auri/Oscar to get set up.",
  piper: "Read your welcome email; it has instructions for getting started.",
};

function isAvailable(commandName: string, computer: ComputerId, storyFlags?: StoryFlags): boolean {
  if (computer === "devcontainer" || computer === "chipinfra") {
    return DEVCONTAINER_COMMANDS.has(commandName);
  }
  if (computer === "nexacorp") {
    if (DEVCONTAINER_ONLY.has(commandName)) return false;
    if (HOME_ONLY.has(commandName)) return false;
    const requiredFlag = NEXACORP_GATED[commandName];
    if (requiredFlag && !storyFlags?.[requiredFlag]) return false;
    return true;
  }
  // erik-pc is reached via SSH from chipinfra — `exit` returns there.
  if (computer === "erik-pc" && commandName === "exit") return true;
  if (DEVCONTAINER_ONLY.has(commandName)) return false;
  const homeFlag = HOME_GATED[commandName];
  if (homeFlag) {
    // Erik's work laptop is fully set up — the player's home-PC tutorial
    // unlocks don't apply there (skipping Olive's optional challenge must not
    // make basics like echo/whoami "command not found" on Erik's machine)
    if (computer === "erik-pc") return true;
    if (!storyFlags?.[homeFlag]) return false;
    return true;
  }
  if (HOME_COMMANDS.has(commandName)) return true;
  // Commands unlocked at NexaCorp carry over to home PC (except NexaCorp-only commands)
  if (NEXACORP_ONLY.has(commandName)) return false;
  const nexaFlag = NEXACORP_GATED[commandName];
  if (nexaFlag && storyFlags?.[nexaFlag]) return true;
  return false;
}

function unavailableMessage(commandName: string, computer: ComputerId): string | null {
  // Dev-container-only tools are never installed on the workstation, so the
  // "colleagues will help you get set up" hint would be a false promise.
  if (computer === "nexacorp" && !DEVCONTAINER_ONLY.has(commandName)) {
    const hint = NEXACORP_GATE_HINTS[commandName] ?? "Check your mail and Piper messages; your colleagues will help you get set up.";
    return colorize(`${commandName}: not yet available. ${hint}`, ansi.yellow);
  }
  return null;
}

/** terminal-turmoil's command-gating policy. */
export const TURMOIL_AVAILABILITY_POLICY: AvailabilityPolicy = { isAvailable, unavailableMessage };

// Register on import. App entry points and gating tests import this module so
// the engine consults the turmoil gates rather than the allow-all default.
setAvailabilityPolicy(TURMOIL_AVAILABILITY_POLICY);
