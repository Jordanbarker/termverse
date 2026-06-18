import { describe, expect, it } from "vitest";
import { renderTranscript, transcriptFilename } from "../transcript";
import { ChipExchange } from "../types";

describe("transcriptFilename", () => {
  it("formats date as YYYY-MM-DD-HHMMSS.log", () => {
    const d = new Date(2026, 4, 9, 14, 23, 45); // May is 4 (0-indexed)
    expect(transcriptFilename(d)).toBe("2026-05-09-142345.log");
  });

  it("zero-pads single-digit components", () => {
    const d = new Date(2026, 0, 3, 9, 5, 7);
    expect(transcriptFilename(d)).toBe("2026-01-03-090507.log");
  });
});

describe("renderTranscript", () => {
  it("includes session header with id, user, and start time", () => {
    const start = new Date(2026, 4, 9, 14, 23, 45);
    const transcript: ChipExchange[] = [
      { timestamp: start, role: "user", text: "hi" },
      { timestamp: new Date(2026, 4, 9, 14, 23, 46), role: "chip", text: "hello!" },
    ];
    const out = renderTranscript(transcript, start, "/home/alice");
    expect(out).toContain("session: sess_2026-05-09-142345");
    expect(out).toContain("user: alice");
    expect(out).toContain("started: 2026-05-09 14:23:45");
  });

  it("formats turns with [HH:MM:SS] speaker: text using the username for user turns", () => {
    const start = new Date(2026, 4, 9, 14, 23, 45);
    const transcript: ChipExchange[] = [
      { timestamp: start, role: "user", text: "tell me about git" },
      { timestamp: new Date(2026, 4, 9, 14, 23, 48), role: "chip", text: "git is a vcs" },
    ];
    const out = renderTranscript(transcript, start, "/home/alice");
    expect(out).toContain("[14:23:45] alice: tell me about git");
    expect(out).toContain("[14:23:48] chip: git is a vcs");
  });

  it("indents continuation lines of multi-line responses", () => {
    const start = new Date(2026, 4, 9, 14, 23, 45);
    const transcript: ChipExchange[] = [
      {
        timestamp: start,
        role: "chip",
        text: "first line\nsecond line\nthird line",
      },
    ];
    const out = renderTranscript(transcript, start, "/home/alice");
    expect(out).toContain("[14:23:45] chip: first line");
    expect(out).toContain("\n  second line\n");
    expect(out).toContain("\n  third line");
  });

  it("inserts blank line after each chip turn", () => {
    const start = new Date(2026, 4, 9, 14, 23, 45);
    const transcript: ChipExchange[] = [
      { timestamp: start, role: "user", text: "q1" },
      { timestamp: start, role: "chip", text: "a1" },
      { timestamp: start, role: "user", text: "q2" },
      { timestamp: start, role: "chip", text: "a2" },
    ];
    const out = renderTranscript(transcript, start, "/home/alice");
    const body = out.split("\n");
    const a1Line = body.findIndex((l) => l.includes("chip: a1"));
    expect(body[a1Line + 1]).toBe("");
  });
});
