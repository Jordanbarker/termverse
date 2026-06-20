/**
 * IncrementalLine — a line of terminal output paired with a delay before it is
 * rendered, used to play back boot/shutdown sequences and long-running command
 * output at a lifelike cadence. Story-agnostic engine primitive.
 */
export interface IncrementalLine {
  text: string;
  delayMs: number;
}
