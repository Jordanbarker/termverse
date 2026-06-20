/**
 * @tt/core — the reusable terminal engine shared across games.
 * Re-exports the stable public surface; deep imports (@tt/core/<module>) also work.
 */
export type { MachineId } from "./machine";
export type { GameEvent } from "./gameEvent";
export type { IncrementalLine } from "./incrementalLine";
export type { StoryFlags } from "./storyFlags";
export type { Email } from "./email";
export type { PromptOption, PromptSessionInfo, ChipSessionInfo, PiperSessionInfo } from "./session/descriptors";
