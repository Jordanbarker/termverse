export type GamePhase = "login" | "booting" | "playing" | "transitioning";

export type ComputerId = "home" | "nexacorp" | "devcontainer" | "chipinfra" | "erik-pc";

// Re-export for convenience so existing imports don't break
export { PLAYER, COMPUTERS, CONNECTION_PARENT, getConnectionClosure } from "../story/player";

export type StoryFlags = Record<string, string | boolean>;
