import { describe, it, expect } from "vitest";
import {
  parseEmailContent,
  formatEmailContent,
  slugify,
  getMailEntries,
  markAsRead,
  deliverEmail,
  deliverEmailAsRead,
  getReadEmailIds,
  getMailDir,
  getNewDir,
  getCurDir,
  getSentDir,
} from "../mailUtils";
import { Email } from "../types";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { DirectoryNode } from "@tt/core/filesystem/types";

function createMailFS(): VirtualFS {
  const root: DirectoryNode = {
    type: "directory",
    name: "/",
    permissions: "rwxr-xr-x",
    hidden: false,
    children: {
      home: {
        type: "directory",
        name: "home",
        permissions: "rwxr-xr-x",
        hidden: false,
        children: {
          player: {
            type: "directory",
            name: "player",
            permissions: "rwxr-xr-x",
            hidden: false,
            children: {},
          },
        },
      },
      var: {
        type: "directory",
        name: "var",
        permissions: "rwxr-xr-x",
        hidden: false,
        children: {
          mail: {
            type: "directory",
            name: "mail",
            permissions: "rwxr-xr-x",
            hidden: false,
            children: {
              player: {
                type: "directory",
                name: "player",
                permissions: "rwxr-xr-x",
                hidden: false,
                children: {
                  new: {
                    type: "directory",
                    name: "new",
                    permissions: "rwxr-xr-x",
                    hidden: false,
                    children: {
                      "001_welcome": {
                        type: "file",
                        name: "001_welcome",
                        content:
                          "From: Edward Torres <edward@nexacorp.com>\nTo: player@nexacorp.com\nDate: Mon, 23 Feb 2026 09:00:00\nSubject: Welcome aboard!\n\nWelcome to the team!",
                        permissions: "rw-r--r--",
                        hidden: false,
                      },
                    },
                  },
                  cur: {
                    type: "directory",
                    name: "cur",
                    permissions: "rwxr-xr-x",
                    hidden: false,
                    children: {
                      "002_meeting": {
                        type: "file",
                        name: "002_meeting",
                        content:
                          "From: Edward Torres <edward@nexacorp.com>\nTo: player@nexacorp.com\nDate: Tue, 24 Feb 2026 10:00:00\nSubject: Team meeting\nStatus: R\n\nMeeting at 3pm.",
                        permissions: "rw-r--r--",
                        hidden: false,
                      },
                    },
                  },
                  sent: {
                    type: "directory",
                    name: "sent",
                    permissions: "rwxr-xr-x",
                    hidden: false,
                    children: {},
                  },
                },
              },
            },
          },
        },
      },
    },
  };
  return new VirtualFS(root, "/home/player", "/home/player");
}

describe("path helpers", () => {
  it("getMailDir returns correct path", () => {
    expect(getMailDir("player")).toBe("/var/mail/player");
  });
  it("getNewDir returns new/ subdirectory", () => {
    expect(getNewDir("player")).toBe("/var/mail/player/new");
  });
  it("getCurDir returns cur/ subdirectory", () => {
    expect(getCurDir("player")).toBe("/var/mail/player/cur");
  });
  it("getSentDir returns sent/ subdirectory", () => {
    expect(getSentDir("player")).toBe("/var/mail/player/sent");
  });
});

describe("slugify", () => {
  it("lowercases and replaces non-alphanumeric with _", () => {
    expect(slugify("Welcome aboard!")).toBe("welcome_aboard");
  });
  it("strips leading/trailing underscores", () => {
    expect(slugify("!Hello!")).toBe("hello");
  });
  it("collapses multiple non-alphanumeric chars", () => {
    expect(slugify("Team --- Meeting")).toBe("team_meeting");
  });
});

describe("parseEmailContent", () => {
  it("extracts headers and body", () => {
    const content =
      "From: alice@example.com\nTo: bob@example.com\nDate: Sun, 1 Feb 2026\nSubject: Test\n\nHello there!";
    const parsed = parseEmailContent(content);
    expect(parsed.from).toBe("alice@example.com");
    expect(parsed.to).toBe("bob@example.com");
    expect(parsed.date).toBe("Sun, 1 Feb 2026");
    expect(parsed.subject).toBe("Test");
    expect(parsed.body).toBe("Hello there!");
  });

  it("handles Status header", () => {
    const content =
      "From: a@b.com\nTo: c@d.com\nDate: x\nSubject: y\nStatus: R\n\nbody";
    expect(parseEmailContent(content).status).toBe("R");
  });

  it("handles missing headers gracefully", () => {
    const parsed = parseEmailContent("just some text");
    expect(parsed.from).toBe("");
    expect(parsed.to).toBe("");
    expect(parsed.subject).toBe("");
  });

  it("handles multi-line body", () => {
    const content = "From: a@b.com\nSubject: x\n\nline1\nline2\nline3";
    expect(parseEmailContent(content).body).toBe("line1\nline2\nline3");
  });
});

describe("formatEmailContent", () => {
  const email: Email = {
    id: "test-1",
    from: "alice@example.com",
    to: "bob@example.com",
    date: "Sun, 1 Feb 2026",
    subject: "Test Email",
    body: "Hello!",
  };

  it("formats email without Status when unread", () => {
    const content = formatEmailContent(email, false);
    expect(content).toContain("From: alice@example.com");
    expect(content).toContain("Subject: Test Email");
    expect(content).not.toContain("Status:");
    expect(content).toContain("Hello!");
  });

  it("includes Status: R when read", () => {
    const content = formatEmailContent(email, true);
    expect(content).toContain("Status: R");
  });
});

describe("getMailEntries", () => {
  it("returns entries from new/ and cur/ sorted by date", () => {
    const fs = createMailFS();
    const entries = getMailEntries(fs);
    expect(entries).toHaveLength(2);
    expect(entries[0].seq).toBe(1);
    expect(entries[0].dir).toBe("new");
    expect(entries[1].seq).toBe(2);
    expect(entries[1].dir).toBe("cur");
  });

  it("sorts by date rather than seq when they disagree", () => {
    const fs = createMailFS();
    // Deliver seq=3 with an earlier date than seq=1
    const early: Email = {
      id: "early",
      from: "a@b.com",
      to: "player@nexacorp.com",
      date: "Sun, 22 Feb 2026 08:00:00",
      subject: "Early",
      body: "",
    };
    const updated = deliverEmail(fs, early, 3);
    const entries = getMailEntries(updated.fs);
    expect(entries).toHaveLength(3);
    expect(entries[0].parsed.subject).toBe("Early");
    expect(entries[0].seq).toBe(3);
  });

  it("parses email content for each entry", () => {
    const fs = createMailFS();
    const entries = getMailEntries(fs);
    expect(entries[0].parsed.subject).toBe("Welcome aboard!");
    expect(entries[1].parsed.subject).toBe("Team meeting");
  });

  it("returns empty array when mail dirs don't exist", () => {
    const root: DirectoryNode = {
      type: "directory",
      name: "/",
      permissions: "rwxr-xr-x",
      hidden: false,
      children: {
        home: {
          type: "directory",
          name: "home",
          permissions: "rwxr-xr-x",
          hidden: false,
          children: {
            player: {
              type: "directory",
              name: "player",
              permissions: "rwxr-xr-x",
              hidden: false,
              children: {},
            },
          },
        },
      },
    };
    const fs = new VirtualFS(root, "/home/player", "/home/player");
    expect(getMailEntries(fs)).toEqual([]);
  });
});

describe("markAsRead", () => {
  it("moves email from new/ to cur/ with Status: R", () => {
    const fs = createMailFS();
    const result = markAsRead(fs, "001_welcome");

    // Should be gone from new/
    expect(result.fs.getNode("/var/mail/player/new/001_welcome")).toBeNull();

    // Should exist in cur/
    const curFile = result.fs.readFile("/var/mail/player/cur/001_welcome");
    expect(curFile.content).toContain("Status: R");
    expect(curFile.content).toContain("Welcome aboard!");
  });

  it("returns unchanged fs when file not found", () => {
    const fs = createMailFS();
    const result = markAsRead(fs, "nonexistent");
    expect(result.fs).toBe(fs);
  });
});

describe("deliverEmail", () => {
  it("creates email file in new/ directory", () => {
    const fs = createMailFS();
    const email: Email = {
      id: "test-delivery",
      from: "chip@nexacorp.com",
      to: "player@nexacorp.com",
      date: "Wed, 25 Feb 2026 12:00:00",
      subject: "System Update",
      body: "Updates applied.",
    };

    const result = deliverEmail(fs, email, 3);
    const file = result.fs.readFile("/var/mail/player/new/003_system_update");
    expect(file.content).toContain("From: chip@nexacorp.com");
    expect(file.content).toContain("Subject: System Update");
    expect(file.content).toContain("Updates applied.");
  });

  it("pads sequence number to 3 digits", () => {
    const fs = createMailFS();
    const email: Email = {
      id: "t",
      from: "a",
      to: "b",
      date: "d",
      subject: "Hi",
      body: "",
    };

    const result = deliverEmail(fs, email, 5);
    expect(result.fs.getNode("/var/mail/player/new/005_hi")).not.toBeNull();
  });
});

describe("deliverEmailAsRead", () => {
  it("creates email file in cur/ directory with Status: R", () => {
    const fs = createMailFS();
    const email: Email = {
      id: "test-read",
      from: "chip@nexacorp.com",
      to: "player@nexacorp.com",
      date: "Wed, 25 Feb 2026 12:00:00",
      subject: "Old News",
      body: "Already read.",
    };

    const result = deliverEmailAsRead(fs, email, 3);
    const file = result.fs.readFile("/var/mail/player/cur/003_old_news");
    expect(file.content).toContain("Status: R");
    expect(file.content).toContain("Subject: Old News");
    expect(result.fs.getNode("/var/mail/player/new/003_old_news")).toBeNull();
  });
});

describe("getReadEmailIds", () => {
  it("returns IDs of emails whose subjects match cur/ entries", () => {
    const fs = createMailFS();
    const emails = [
      { id: "welcome-1", subject: "Welcome aboard!" },
      { id: "meeting-1", subject: "Team meeting" },
      { id: "other", subject: "Not delivered" },
    ];

    const readIds = getReadEmailIds(fs, emails);
    // "Team meeting" is in cur/, "Welcome aboard!" is in new/
    expect(readIds.has("meeting-1")).toBe(true);
    expect(readIds.has("welcome-1")).toBe(false);
    expect(readIds.has("other")).toBe(false);
  });

  it("returns empty set when no emails are read", () => {
    const fs = createMailFS();
    const emails = [{ id: "welcome-1", subject: "Welcome aboard!" }];
    const readIds = getReadEmailIds(fs, emails);
    expect(readIds.size).toBe(0);
  });
});
