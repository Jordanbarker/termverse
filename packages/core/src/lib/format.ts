export const pad2 = (n: number) => String(n).padStart(2, "0");

/** Format a duration in milliseconds as `m:ss` (e.g. 42000 -> "0:42", 95000 -> "1:35"). */
export const formatElapsed = (ms: number) => {
  const totalSec = Math.floor(ms / 1000);
  return `${Math.floor(totalSec / 60)}:${pad2(totalSec % 60)}`;
};
