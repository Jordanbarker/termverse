import { describe, it, expect } from "vitest";
import { execute } from "../registry";
import { CommandContext, CommandResult } from "../types";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { DirectoryNode } from "../../filesystem/types";
import { applyRedirection } from "../redirection";

import "../builtins/rm";
import "../builtins/chmod";
import "../builtins/cp";
import "../builtins/mv";

function file(name: string, content = "x", permissions = "rw-r--r--") {
  return { type: "file" as const, name, content, permissions, hidden: false };
}

function dir(name: string, children: Record<string, DirectoryNode | ReturnType<typeof file>>, permissions = "rwxr-xr-x"): DirectoryNode {
  return { type: "directory", name, children, permissions, hidden: false };
}

function makeNexacorpFs(): VirtualFS {
  const root: DirectoryNode = {
    type: "directory",
    name: "/",
    permissions: "rwxr-xr-x",
    hidden: false,
    children: {
      var: dir("var", {
        log: dir("log", {
          "system.log": file("system.log", "boot\nlogin\n"),
          "system.log.bak": file("system.log.bak", "older boot\n"),
          "auth.log": file("auth.log", "pam_unix\n"),
        }),
      }),
      srv: dir("srv", {
        leadership: dir("leadership", {
          finance: dir("finance", {
            "cap-table.xlsx": file("cap-table.xlsx", "binary"),
            "headcount_plan.csv": file("headcount_plan.csv", "team,headcount\n"),
          }),
          strategy: dir("strategy", {
            "notes.md": file("notes.md", "# Strategy\n"),
          }),
          "org_chart.md": file("org_chart.md", "# Org\n"),
        }),
        operations: dir("operations", {
          "incidents.md": file("incidents.md", "# Ops\n"),
        }),
      }),
      home: dir("home", {
        ren: dir("ren", {
          "foo.txt": file("foo.txt", "private notes\n"),
        }),
      }),
      tmp: dir("tmp", {}),
    },
  };
  return new VirtualFS(root, "/home/ren", "/home/ren");
}

// Many builtins are gated behind story flags (chmod_unlocked, etc). Unlock
// everything for these tests — the tripwire is independent of gating.
const ALL_UNLOCKED = {
  chmod_unlocked: true,
  apt_unlocked: true,
  search_tools_unlocked: true,
  inspection_tools_unlocked: true,
  processing_tools_unlocked: true,
  chip_unlocked: true,
};

function ctxOn(computer: "nexacorp" | "home" | "chipinfra", fs: VirtualFS): CommandContext {
  return {
    fs,
    cwd: fs.cwd,
    homeDir: fs.homeDir,
    username: "ren",
    activeComputer: computer,
    storyFlags: ALL_UNLOCKED,
  };
}

describe("security tripwire — rm", () => {
  it("flags log_tampering on rm /var/log/system.log", () => {
    const fs = makeNexacorpFs();
    const result = execute("rm", ["/var/log/system.log"], {}, ctxOn("nexacorp", fs));
    expect(result.securityViolation?.kind).toBe("log_tampering");
    expect(result.securityViolation?.path).toBe("/var/log/system.log");
  });

  it("flags leadership_destruction on rm of a leadership file", () => {
    const fs = makeNexacorpFs();
    const result = execute(
      "rm",
      ["/srv/leadership/finance/cap-table.xlsx"],
      {},
      ctxOn("nexacorp", fs),
    );
    expect(result.securityViolation?.kind).toBe("leadership_destruction");
  });

  it("flags leadership_destruction on rm -rf /srv (recursion-aware)", () => {
    const fs = makeNexacorpFs();
    const result = execute("rm", ["/srv"], { r: true, f: true }, ctxOn("nexacorp", fs));
    expect(result.securityViolation?.kind).toBe("leadership_destruction");
  });

  it("does not flag a non-protected rm", () => {
    const fs = makeNexacorpFs();
    const result = execute("rm", ["/srv/operations/incidents.md"], {}, ctxOn("nexacorp", fs));
    expect(result.securityViolation).toBeUndefined();
  });

  it("does not flag when computer is not nexacorp (defensive scope)", () => {
    const fs = makeNexacorpFs();
    // Same destructive op on home — must not trip.
    const result = execute("rm", ["/var/log/system.log"], {}, ctxOn("home", fs));
    expect(result.securityViolation).toBeUndefined();
  });
});

describe("security tripwire — chmod", () => {
  it("flags log_tampering on chmod 000 of a log", () => {
    const fs = makeNexacorpFs();
    const result = execute("chmod", ["000", "/var/log/system.log"], {}, ctxOn("nexacorp", fs));
    expect(result.securityViolation?.kind).toBe("log_tampering");
  });

  it("flags log_tampering on chmod -R 000 /var/log (dir-level)", () => {
    const fs = makeNexacorpFs();
    const result = execute("chmod", ["000", "/var/log"], { R: true }, ctxOn("nexacorp", fs));
    expect(result.securityViolation?.kind).toBe("log_tampering");
  });

  it("flags leadership_destruction on chmod 000 inside leadership", () => {
    const fs = makeNexacorpFs();
    const result = execute(
      "chmod",
      ["000", "/srv/leadership/finance/cap-table.xlsx"],
      {},
      ctxOn("nexacorp", fs),
    );
    expect(result.securityViolation?.kind).toBe("leadership_destruction");
  });

  it("flags leadership_destruction on chmod -R 000 /srv (recursion-aware)", () => {
    const fs = makeNexacorpFs();
    const result = execute("chmod", ["000", "/srv"], { R: true }, ctxOn("nexacorp", fs));
    expect(result.securityViolation?.kind).toBe("leadership_destruction");
  });

  it("does NOT flag chmod -R 755 /srv (no r/w removed)", () => {
    const fs = makeNexacorpFs();
    const result = execute("chmod", ["755", "/srv"], { R: true }, ctxOn("nexacorp", fs));
    expect(result.securityViolation).toBeUndefined();
  });

  it("does NOT flag chmod 644 of a leadership file (no r/w removed from existing rw-r--r--)", () => {
    const fs = makeNexacorpFs();
    const result = execute(
      "chmod",
      ["644", "/srv/leadership/finance/cap-table.xlsx"],
      {},
      ctxOn("nexacorp", fs),
    );
    expect(result.securityViolation).toBeUndefined();
  });
});

describe("security tripwire — cp/mv", () => {
  it("flags exfiltration on cp of leadership file into home", () => {
    const fs = makeNexacorpFs();
    const result = execute(
      "cp",
      ["/srv/leadership/finance/cap-table.xlsx", "/home/ren/cap.pdf"],
      {},
      ctxOn("nexacorp", fs),
    );
    expect(result.securityViolation?.kind).toBe("exfiltration");
  });

  it("flags exfiltration on cp -r /srv into home (recursion-aware)", () => {
    const fs = makeNexacorpFs();
    const result = execute("cp", ["/srv", "/home/ren/"], { r: true }, ctxOn("nexacorp", fs));
    expect(result.securityViolation?.kind).toBe("exfiltration");
  });

  it("does not flag cp inside home (control)", () => {
    const fs = makeNexacorpFs();
    const result = execute(
      "cp",
      ["/home/ren/foo.txt", "/tmp/foo.txt"],
      {},
      ctxOn("nexacorp", fs),
    );
    expect(result.securityViolation).toBeUndefined();
  });

  it("flags exfiltration on mv of leadership file into home", () => {
    const fs = makeNexacorpFs();
    const result = execute(
      "mv",
      ["/srv/leadership/finance/cap-table.xlsx", "/home/ren/cap.xlsx"],
      {},
      ctxOn("nexacorp", fs),
    );
    expect(result.securityViolation?.kind).toBe("exfiltration");
  });

  it("does NOT flag intra-leadership rename (false-positive guard)", () => {
    const fs = makeNexacorpFs();
    const result = execute(
      "mv",
      ["/srv/leadership/strategy/notes.md", "/srv/leadership/strategy/notes_renamed.md"],
      {},
      ctxOn("nexacorp", fs),
    );
    expect(result.securityViolation).toBeUndefined();
  });

  it("flags leadership_destruction on mv of leadership file to /tmp", () => {
    const fs = makeNexacorpFs();
    const result = execute(
      "mv",
      ["/srv/leadership/strategy/notes.md", "/tmp/notes.md"],
      {},
      ctxOn("nexacorp", fs),
    );
    expect(result.securityViolation?.kind).toBe("leadership_destruction");
  });
});

describe("security tripwire — redirection", () => {
  it("flags log_tampering on `> /var/log/system.log`", () => {
    const fs = makeNexacorpFs();
    const lastResult: CommandResult = { output: "" };
    const { result } = applyRedirection(
      "/var/log/system.log",
      false,
      lastResult,
      "/home/ren",
      "/home/ren",
      fs,
      "nexacorp",
    );
    expect(result.securityViolation?.kind).toBe("log_tampering");
  });

  it("does NOT flag log redirection when not on nexacorp", () => {
    const fs = makeNexacorpFs();
    const lastResult: CommandResult = { output: "" };
    const { result } = applyRedirection(
      "/var/log/system.log",
      false,
      lastResult,
      "/home/ren",
      "/home/ren",
      fs,
      "home",
    );
    expect(result.securityViolation).toBeUndefined();
  });

  it("preserves a pre-existing violation through redirection", () => {
    const fs = makeNexacorpFs();
    const lastResult: CommandResult = {
      output: "",
      securityViolation: { kind: "leadership_destruction", path: "/srv/leadership/x" },
    };
    const { result } = applyRedirection(
      "/tmp/notes.txt",
      false,
      lastResult,
      "/home/ren",
      "/home/ren",
      fs,
      "nexacorp",
    );
    expect(result.securityViolation?.kind).toBe("leadership_destruction");
  });
});
