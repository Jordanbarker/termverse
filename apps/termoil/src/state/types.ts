export type GamePhase = "login" | "booting" | "playing" | "transitioning";

export type ComputerId = "home" | "nexacorp" | "devcontainer" | "chipinfra" | "erik-pc";

// Re-export for convenience so existing imports don't break
export { PLAYER, COMPUTERS, CONNECTION_PARENT, getConnectionClosure } from "../story/player";

// StoryFlags now lives in @tt/core (opaque, story-agnostic). Re-exported so the
// many `import { StoryFlags } from "state/types"` call sites stay valid.
export type { StoryFlags } from "@tt/core";
