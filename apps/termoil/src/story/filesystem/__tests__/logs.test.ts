import { describe, it, expect } from "vitest";
import {
  generateAuthLog,
  generateAuthLogBak,
  generateChipActivityLog,
} from "../logs";

describe("generateAuthLog", () => {
  it("contains employee SSH logins", () => {
    const log = generateAuthLog("testuser");
    expect(log).toContain("Accepted publickey for oscar");
    expect(log).toContain("Accepted publickey for sarah");
  });

  it("contains player login on Feb 23", () => {
    const log = generateAuthLog("testuser");
    expect(log).toContain("Accepted publickey for testuser");
    expect(log).toContain("2026-02-23");
  });

  it("contains brute-force attempts", () => {
    const log = generateAuthLog("testuser");
    expect(log).toContain("Failed password for invalid user");
  });

  it("contains edward auto-login", () => {
    const log = generateAuthLog("testuser");
    expect(log).toContain("AUTO LOGIN on /dev/tty1 as edward");
  });

  it("does not contain chip_service_account entries", () => {
    const log = generateAuthLog("testuser");
    expect(log).not.toContain("chip_service_account");
  });

  it("Day 1 has no Feb 24 entries", () => {
    const log = generateAuthLog("testuser");
    expect(log).not.toContain("2026-02-24");
  });

  it("Day 2 includes Feb 24 player return login", () => {
    const log = generateAuthLog("testuser", { includeDay2: true });
    expect(log).toContain("2026-02-24");
    expect(log).toContain("Accepted publickey for testuser");
    // Should have two player login entries (Feb 23 + Feb 24)
    const matches = log.match(/Accepted publickey for testuser/g);
    expect(matches?.length).toBe(2);
  });

  it("Day 2 includes employee logins on day 24", () => {
    const log = generateAuthLog("testuser", { includeDay2: true });
    // Oscar is present on day 24
    const day24Lines = log.split("\n").filter((l) => l.includes("2026-02-24"));
    expect(day24Lines.length).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    const a = generateAuthLog("testuser");
    const b = generateAuthLog("testuser");
    expect(a).toBe(b);
  });
});

describe("generateAuthLogBak", () => {
  it("contains Feb 3 historical chip entries", () => {
    const log = generateAuthLogBak("testuser");
    expect(log).toContain("2026-02-03");
    expect(log).toContain("chip_service_account: accessing /home/jchen/");
    expect(log).toContain("chip_service_account: modifying dbt models");
  });

  it("contains chip_service_account SSH sessions", () => {
    const log = generateAuthLogBak("testuser");
    expect(log).toContain("Accepted publickey for chip_service_account from 127.0.0.1");
    expect(log).toContain("session opened for user chip_service_account");
    expect(log).toContain("session closed for user chip_service_account");
  });

  it("also contains normal auth entries", () => {
    const log = generateAuthLogBak("testuser");
    expect(log).toContain("Accepted publickey for oscar");
    expect(log).toContain("Accepted publickey for testuser");
  });

  it("is deterministic", () => {
    const a = generateAuthLogBak("testuser");
    const b = generateAuthLogBak("testuser");
    expect(a).toBe(b);
  });

  it("Day 2 includes additional chip SSH sessions for day 24", () => {
    const day1 = generateAuthLogBak("testuser");
    const day2 = generateAuthLogBak("testuser", { includeDay2: true });
    // Day 2 should have more chip_service_account SSH sessions
    const day1ChipSessions = (day1.match(/chip_service_account/g) || []).length;
    const day2ChipSessions = (day2.match(/chip_service_account/g) || []).length;
    expect(day2ChipSessions).toBeGreaterThan(day1ChipSessions);
  });
});

describe("generateChipActivityLog", () => {
  it("Day 1 contains startup and onboarding", () => {
    const log = generateChipActivityLog("testuser");
    expect(log).toContain("Chip service started");
    expect(log).toContain("chip.maintenance: nightly window started");
    expect(log).toContain("onboarding-assistant triggered for new user 'testuser'");
    expect(log).toContain("provisioned welcome materials for testuser");
  });

  it("Day 1 has no Feb 24 entries", () => {
    const log = generateChipActivityLog("testuser");
    expect(log).not.toContain("2026-02-24");
  });

  it("Day 2 includes nightly maintenance and model hot-reload", () => {
    const log = generateChipActivityLog("testuser", { includeDay2: true });
    expect(log).toContain("chip.maintenance: nightly window started");
    expect(log).toContain("model hot-reload complete (chip-v2.4.1, config refresh)");
  });

  it("Day 2 includes morning boot and player return", () => {
    const log = generateChipActivityLog("testuser", { includeDay2: true });
    expect(log).toMatch(/\[2026-02-24 07:\d\d:\d\d\] chip\[\d+\]: chip\.api: Chip service started/);
    expect(log).toContain("returning user detected (testuser)");
    expect(log).toContain("session resumed for testuser");
  });

  it("is deterministic", () => {
    const a = generateChipActivityLog("testuser");
    const b = generateChipActivityLog("testuser");
    expect(a).toBe(b);
  });

  it("Day 2 output is a superset of Day 1", () => {
    const day1 = generateChipActivityLog("testuser");
    const day2 = generateChipActivityLog("testuser", { includeDay2: true });
    // Every Day 1 line should appear in Day 2
    for (const line of day1.trim().split("\n")) {
      expect(day2).toContain(line);
    }
    // Day 2 should be longer
    expect(day2.length).toBeGreaterThan(day1.length);
  });
});
