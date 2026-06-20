/**
 * StoryFlags — an opaque, story-agnostic bag of progression flags. The core
 * engine reads and writes flags by string key without knowing any one game's
 * flag names; each game narrows the key space in its own layer.
 */
export type StoryFlags = Record<string, string | boolean>;
