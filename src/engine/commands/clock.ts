/**
 * Game-clock seam (core, story-agnostic).
 *
 * Several commands surface an in-game "now": `date`, `git commit` timestamps,
 * dbt log prefixes, and Snowflake `current_timestamp()`. How that time is
 * derived (in terminal-turmoil it advances with story progression) is a game
 * decision, so the app injects a GameClock via CommandContext.clock. Absent =>
 * callers fall back to the real wall clock.
 */

/** Structured in-game time + calendar, as the `date` command renders it. */
export interface GameTime {
  hour: string;
  minute: string;
  second: string;
  dow: string;
  month: string;
  day: string;
  year: string;
}

export interface GameClock {
  /** In-game now as a Date (for git/snow/mail/dbt arithmetic). */
  now(): Date;
  /** In-game now as "HH:MM:SS" (for dbt log prefixes). */
  ts(): string;
  /** Structured in-game now + calendar (for the `date` command). */
  time(): GameTime;
}
