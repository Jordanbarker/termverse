import { ComputerId, StoryFlags } from "../../state/types";
import { HOME_COMMANDS, NEXACORP_GATED, HOME_GATED, DEVCONTAINER_COMMANDS, NEXACORP_ONLY, DEVCONTAINER_ONLY, HOME_ONLY } from "../../story/commandGates";

// Re-export for convenience
export { HOME_COMMANDS, NEXACORP_GATED, HOME_GATED, DEVCONTAINER_COMMANDS, NEXACORP_ONLY, DEVCONTAINER_ONLY, HOME_ONLY };

/** Returns true if the command is available on the given computer. */
export function isCommandAvailable(commandName: string, computer: ComputerId, storyFlags?: StoryFlags): boolean {
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
