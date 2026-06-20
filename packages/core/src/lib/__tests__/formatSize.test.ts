import { describe, it, expect } from "vitest";
import { formatSize } from "../formatSize";

describe("formatSize", () => {
  it("returns raw number when not human-readable", () => {
    expect(formatSize(842, false)).toBe("842");
    expect(formatSize(1048576, false)).toBe("1048576");
  });

  it("returns raw number for small values even when human-readable", () => {
    expect(formatSize(0, true)).toBe("0");
    expect(formatSize(512, true)).toBe("512");
    expect(formatSize(1023, true)).toBe("1023");
  });

  it("formats kilobytes", () => {
    expect(formatSize(1024, true)).toBe("1.0K");
    expect(formatSize(1536, true)).toBe("1.5K");
    expect(formatSize(4096, true)).toBe("4.0K");
    expect(formatSize(9.5 * 1024, true)).toBe("9.5K");
    expect(formatSize(10 * 1024, true)).toBe("10K");
  });

  it("formats megabytes", () => {
    expect(formatSize(1048576, true)).toBe("1.0M");
    expect(formatSize(2621440, true)).toBe("2.5M");
  });

  it("formats gigabytes", () => {
    expect(formatSize(1073741824, true)).toBe("1.0G");
    expect(formatSize(53687091200, true)).toBe("50G");
  });

  it("formats terabytes", () => {
    expect(formatSize(1099511627776, true)).toBe("1.0T");
  });
});
