/**
 * Format a byte count as a human-readable string or raw number.
 */
export function formatSize(bytes: number, humanReadable: boolean): string {
  if (!humanReadable || bytes < 1024) return String(bytes);

  const units = ["K", "M", "G", "T"];
  let value = bytes;
  let unitIndex = -1;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  // Match coreutils human-readable: 1 decimal for single-digit values
  // (4.0K, 9.5K), drop the decimal once we hit 10+ (10K, 256M, 50G).
  const formatted = value < 10 ? value.toFixed(1) : Math.round(value).toString();
  return `${formatted}${units[unitIndex]}`;
}
