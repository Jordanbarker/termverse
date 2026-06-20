/** Delay between boot sequence lines (ms) */
export const BOOT_LINE_INTERVAL_MS = 300;

/** Delay between shutdown sequence lines (ms) */
export const SHUTDOWN_LINE_INTERVAL_MS = 400;

/** Delay after shutdown before transitioning to login (ms) */
export const TRANSITION_DELAY_MS = 1000;

/** Delay before Chip starts typing a response (ms) */
export const CHIP_THINKING_DELAY_MS = 500;

/** Interval between Chip chat lines (ms) */
export const CHIP_CHAT_LINE_INTERVAL_MS = 80;

/** Interval between Chip command-output lines (ms) */
export const CHIP_COMMAND_LINE_INTERVAL_MS = 300;

/** Interval between Chip menu lines appearing after response (ms) */
export const CHIP_MENU_LINE_INTERVAL_MS = 50;

/** Delay for Piper typing indicator before showing follow-up messages (ms) */
export const PIPER_TYPING_DELAY_MS = 1000;

/** Default delay for non-timed dbt output lines (headers, summaries, blank lines) */
export const DBT_DEFAULT_LINE_DELAY_MS = 60;

/** Interval between security audit alert lines during termination (ms) */
export const SECURITY_ALERT_LINE_INTERVAL_MS = 700;

/** Pause after the last audit line before the disconnect message (ms) */
export const SECURITY_DISCONNECT_PAUSE_MS = 800;

/** Pause after the disconnect message before the screen blacks out (ms) */
export const TERMINATION_PRE_BLACKOUT_MS = 3000;

/** Black-screen duration after disconnect, before home reentry (ms) */
export const TERMINATION_BLACKOUT_MS = 2000;

/**
 * Apply normally-distributed noise to a base delay using the Box-Muller transform.
 * Returns an integer ms value clamped to [baseMs * 0.5, baseMs * 1.5], minimum 1ms.
 * Zero input returns zero (no jitter on 0ms).
 */
export function jitterDelay(baseMs: number, stddevFraction = 0.2): number {
  if (baseMs === 0) return 0;
  // Box-Muller transform: two uniform randoms → one standard normal
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
  const jittered = baseMs + z * stddevFraction * baseMs;
  const clamped = Math.max(baseMs * 0.5, Math.min(baseMs * 1.5, jittered));
  return Math.max(1, Math.floor(clamped));
}
