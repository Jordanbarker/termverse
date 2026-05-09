import { describe, it, expect } from "vitest";
import { rejectUnknownFlags } from "../flagValidation";

describe("rejectUnknownFlags", () => {
  describe("coreutils style (default)", () => {
    it("returns null when all flags are known", () => {
      const result = rejectUnknownFlags("ls", { a: true, l: true }, { short: ["a", "l"] });
      expect(result).toBeNull();
    });

    it("rejects an unknown short flag", () => {
      const result = rejectUnknownFlags("ls", { z: true }, { short: ["a"] });
      expect(result).not.toBeNull();
      expect(result!.output).toBe(
        "ls: invalid option -- 'z'\nTry 'ls --help' for more information.",
      );
      expect(result!.exitCode).toBe(2);
    });

    it("rejects an unknown long flag", () => {
      const result = rejectUnknownFlags("ls", { foo: true }, { short: ["a"] });
      expect(result).not.toBeNull();
      expect(result!.output).toBe(
        "ls: unrecognized option '--foo'\nTry 'ls --help' for more information.",
      );
      expect(result!.exitCode).toBe(2);
    });

    it("accepts known long flags", () => {
      const result = rejectUnknownFlags("ls", { all: true }, { long: ["all"] });
      expect(result).toBeNull();
    });

    it("rejects on the first unknown flag (matches coreutils behavior)", () => {
      const flags = { x: true, y: true };
      const result = rejectUnknownFlags("ls", flags, { short: [] });
      expect(result).not.toBeNull();
      // First key encountered in iteration; jsobject preserves insertion order.
      expect(result!.output).toContain("'x'");
    });

    it("treats an empty whitelist as 'no flags allowed'", () => {
      const result = rejectUnknownFlags("cat", { z: true }, {});
      expect(result).not.toBeNull();
      expect(result!.output).toContain("invalid option -- 'z'");
    });

    it("always passes --help through", () => {
      const result = rejectUnknownFlags("ls", { help: true }, {});
      expect(result).toBeNull();
    });
  });

  describe("git style", () => {
    it("uses git error format for short flags with exit 129", () => {
      const result = rejectUnknownFlags(
        "git",
        { z: true },
        { short: ["s"] },
        { style: "git" },
      );
      expect(result).not.toBeNull();
      expect(result!.output).toBe("error: unknown switch `z'");
      expect(result!.exitCode).toBe(129);
    });

    it("uses git error format for long flags", () => {
      const result = rejectUnknownFlags(
        "git",
        { bogus: true },
        { long: ["oneline"] },
        { style: "git" },
      );
      expect(result).not.toBeNull();
      expect(result!.output).toBe("error: unknown option `bogus'");
      expect(result!.exitCode).toBe(129);
    });
  });

  describe("value-flag map shape", () => {
    it("accepts string-valued flags from git's parser (Record<string, string | boolean>)", () => {
      // git's parseGitArgs produces flags like { m: "msg", a: true }
      const result = rejectUnknownFlags(
        "git",
        { m: "commit message", a: true },
        { short: ["m", "a"] },
        { style: "git" },
      );
      expect(result).toBeNull();
    });
  });
});
