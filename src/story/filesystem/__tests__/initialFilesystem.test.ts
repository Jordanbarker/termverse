import { describe, it, expect } from "vitest";
import { createNexacorpFilesystem } from "../nexacorp";
import { createDevcontainerFilesystem } from "../devcontainer";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";

const USERNAME = "testplayer";

function makeFS(): VirtualFS {
  const root = createNexacorpFilesystem(USERNAME);
  return new VirtualFS(root, `/home/${USERNAME}`, `/home/${USERNAME}`);
}

describe("createNexacorpFilesystem", () => {
  const fs = makeFS();

  describe("top-level structure", () => {
    it("has /home directory", () => {
      expect(fs.getNode("/home")?.type).toBe("directory");
    });

    it("has /var directory", () => {
      expect(fs.getNode("/var")?.type).toBe("directory");
    });

    it("has /etc directory", () => {
      expect(fs.getNode("/etc")?.type).toBe("directory");
    });

    it("has /opt directory", () => {
      expect(fs.getNode("/opt")?.type).toBe("directory");
    });

    it("has /tmp directory", () => {
      expect(fs.getNode("/tmp")?.type).toBe("directory");
    });

    it("has /srv directory", () => {
      expect(fs.getNode("/srv")?.type).toBe("directory");
    });
  });

  describe("user home directory", () => {
    it("creates /home/<username>", () => {
      expect(fs.getNode(`/home/${USERNAME}`)?.type).toBe("directory");
    });

    it("has .zshrc (hidden)", () => {
      const node = fs.getNode(`/home/${USERNAME}/.zshrc`);
      expect(node?.type).toBe("file");
      expect(node?.hidden).toBe(true);
    });

    it("has .zprofile (hidden)", () => {
      const node = fs.getNode(`/home/${USERNAME}/.zprofile`);
      expect(node?.type).toBe("file");
      expect(node?.hidden).toBe(true);
    });

    it("has .gitconfig with corporate identity", () => {
      const result = fs.readFile(`/home/${USERNAME}/.gitconfig`);
      expect(result.content).toContain(`${USERNAME}@nexacorp.com`);
    });

    it("has .ssh directory with restricted permissions", () => {
      const node = fs.getNode(`/home/${USERNAME}/.ssh`);
      expect(node?.type).toBe("directory");
      if (node?.type === "directory") {
        expect(node.permissions).toBe("rwx--xr-x");
      }
    });

    it("has .ssh/config that is empty", () => {
      const result = fs.readFile(`/home/${USERNAME}/.ssh/config`);
      expect(result.content).toBe("");
    });

    it("has .config/git/ignore", () => {
      const result = fs.readFile(`/home/${USERNAME}/.config/git/ignore`);
      expect(result.content).toContain("*.pyc");
    });

    it("has Desktop directory with welcome.txt", () => {
      expect(fs.getNode(`/home/${USERNAME}/Desktop`)?.type).toBe("directory");
      const result = fs.readFile(`/home/${USERNAME}/Desktop/welcome.txt`);
      expect(result.content).toContain("Chip");
    });

    it("has Downloads directory", () => {
      expect(fs.getNode(`/home/${USERNAME}/Downloads`)?.type).toBe("directory");
    });

    it("has Documents directory with org chart and handbook", () => {
      expect(fs.getNode(`/home/${USERNAME}/Documents`)?.type).toBe("directory");
      const orgChart = fs.readFile(`/home/${USERNAME}/Documents/nexacorp_org_chart.txt`);
      expect(orgChart.content).toContain("Edward Torres");
      expect(fs.getNode(`/home/${USERNAME}/Documents/employee_handbook_2026.md`)?.type).toBe("file");
    });

    it("has scripts directory with hello.py", () => {
      const result = fs.readFile(`/home/${USERNAME}/scripts/hello.py`);
      expect(result.content).toContain("Hello from NexaCorp");
    });

    it("has scripts/check_env.sh", () => {
      const result = fs.readFile(`/home/${USERNAME}/scripts/check_env.sh`);
      expect(result.content).toContain("#!/bin/bash");
      expect(result.content).toContain("command -v");
    });
  });

  describe("system directories", () => {
    it("has /var/log with system.log", () => {
      const result = fs.readFile("/var/log/system.log");
      expect(result.content).toContain("System boot");
    });

    it("has /var/log with chip-activity.log", () => {
      const result = fs.readFile("/var/log/chip-activity.log");
      expect(result.content).toContain("Chip service started");
    });

    it("has /etc/hostname", () => {
      const result = fs.readFile("/etc/hostname");
      expect(result.content).toContain("nexacorp-ws01");
    });

    it("has /opt/chip with thin-client README.md", () => {
      const result = fs.readFile("/opt/chip/README.md");
      // Plugin runtime moved to chipinfra; ws01 only has the client.
      expect(result.content).toContain("Chip CLI (client)");
    });

    it("has /opt/chip/bin/chip stub script", () => {
      const result = fs.readFile("/opt/chip/bin/chip");
      expect(result.content).toContain("Chip CLI v2.4.1");
      expect(result.content).toContain("Thin client");
    });

    it("has /opt/chip/config/settings.json with platform endpoint", () => {
      const result = fs.readFile("/opt/chip/config/settings.json");
      expect(result.content).toContain('"endpoint":');
      expect(result.content).toContain("chip.platform.internal");
    });

    it("does NOT have /opt/chip/plugins/ on ws01 (moved to chipinfra)", () => {
      const result = fs.readFile("/opt/chip/plugins/registry.json");
      expect(result.content).toBeUndefined();
    });

    it("does NOT have /srv/ai/ on ws01 (moved to chipinfra)", () => {
      const result = fs.readFile("/srv/ai/rag/engineering/coding-standards.md");
      expect(result.content).toBeUndefined();
    });
  });

  describe("username interpolation", () => {
    it("interpolates username in system.log", () => {
      const result = fs.readFile("/var/log/system.log");
      expect(result.content).toContain(USERNAME);
    });

    it("interpolates username in chip-activity.log", () => {
      const result = fs.readFile("/var/log/chip-activity.log");
      expect(result.content).toContain(USERNAME);
    });

    it("has onboarding.md with expected content", () => {
      const result = fs.readFile(`/srv/engineering/onboarding.md`);
      expect(result.content).toContain("NexaCorp New Employee Onboarding");
    });

    it("works with a different username", () => {
      const root2 = createNexacorpFilesystem("alice");
      const fs2 = new VirtualFS(root2, "/home/alice", "/home/alice");
      expect(fs2.getNode("/home/alice")?.type).toBe("directory");
      const result = fs2.readFile("/var/log/system.log");
      expect(result.content).toContain("alice");
    });
  });

  describe("mail seeding", () => {
    it("has /var/mail/<username>/new with initial emails", () => {
      const mailNew = fs.getNode(`/var/mail/${USERNAME}/new`);
      expect(mailNew?.type).toBe("directory");
      if (mailNew?.type === "directory") {
        const fileCount = Object.keys(mailNew.children).length;
        expect(fileCount).toBeGreaterThanOrEqual(2);
      }
    });

    it("has /var/mail/<username>/cur (empty)", () => {
      const mailCur = fs.getNode(`/var/mail/${USERNAME}/cur`);
      expect(mailCur?.type).toBe("directory");
      if (mailCur?.type === "directory") {
        expect(Object.keys(mailCur.children)).toHaveLength(0);
      }
    });

    it("has /var/mail/<username>/sent (empty)", () => {
      const mailSent = fs.getNode(`/var/mail/${USERNAME}/sent`);
      expect(mailSent?.type).toBe("directory");
      if (mailSent?.type === "directory") {
        expect(Object.keys(mailSent.children)).toHaveLength(0);
      }
    });

    it("mail files contain email headers", () => {
      const mailNew = fs.getNode(`/var/mail/${USERNAME}/new`);
      if (mailNew?.type === "directory") {
        const firstFile = Object.values(mailNew.children)[0];
        if (firstFile?.type === "file") {
          expect(firstFile.content).toContain("From:");
          expect(firstFile.content).toContain("To:");
          expect(firstFile.content).toContain("Subject:");
        }
      }
    });
  });

  describe("conditional dbt project", () => {
    it("does not include nexacorp-analytics in devcontainer by default", () => {
      const root = createDevcontainerFilesystem(USERNAME);
      const fs = new VirtualFS(root, `/home/${USERNAME}`, `/home/${USERNAME}`);
      expect(fs.getNode(`/home/${USERNAME}/nexacorp-analytics`)).toBeNull();
    });

    it("includes nexacorp-analytics in devcontainer when dbt_project_cloned is true", () => {
      const root = createDevcontainerFilesystem(USERNAME, { dbt_project_cloned: true });
      const fs = new VirtualFS(root, `/home/${USERNAME}`, `/home/${USERNAME}`);
      expect(fs.getNode(`/home/${USERNAME}/nexacorp-analytics`)?.type).toBe("directory");
      const result = fs.readFile(`/home/${USERNAME}/nexacorp-analytics/dbt_project.yml`);
      expect(result.content).toContain("nexacorp_analytics");
    });

    it("does not include nexacorp-analytics on NexaCorp workstation", () => {
      const root = createNexacorpFilesystem(USERNAME, { dbt_project_cloned: true });
      const fs = new VirtualFS(root, `/home/${USERNAME}`, `/home/${USERNAME}`);
      expect(fs.getNode(`/home/${USERNAME}/nexacorp-analytics`)).toBeNull();
    });
  });

  describe("handoff directory", () => {
    it("has /srv/engineering/chen-handoff with README.md", () => {
      const result = fs.readFile(`/srv/engineering/chen-handoff/README.md`);
      expect(result.content).toContain("Jin");
    });

    it("has /srv/engineering/chen-handoff with notes.txt", () => {
      const result = fs.readFile(`/srv/engineering/chen-handoff/notes.txt`);
      expect(result.content).toContain("dbt pipeline");
    });

    it("has /srv/engineering/chen-handoff with pipeline_runs.csv", () => {
      const result = fs.readFile(`/srv/engineering/chen-handoff/pipeline_runs.csv`);
      expect(result.content).toContain("run_id,timestamp,model,status,run_by,duration_sec,rows_affected");
      expect(result.content).toContain("chip_service_account");
      expect(result.content).toContain("auri.park");
    });
  });

  describe("colleague task files", () => {
    it("has /srv/operations/incident_log.csv", () => {
      const node = fs.getNode("/srv/operations/incident_log.csv");
      expect(node?.type).toBe("file");
      if (node?.type === "file") {
        expect(node.content).toContain("date,severity,description,resolved_by,duration_min");
        expect(node.content).toContain("chip_service_account");
      }
    });

    it("has /var/log/access.log with duplicate entries", () => {
      const node = fs.getNode("/var/log/access.log");
      expect(node?.type).toBe("file");
      if (node?.type === "file") {
        expect(node.content).toContain("chip_service_account");
        // Should have duplicate lines for player to discover with sort | uniq
        const lines = node.content.trim().split("\n");
        const uniqueLines = new Set(lines);
        expect(lines.length).toBeGreaterThan(uniqueLines.size);
      }
    });
  });

  describe("srv team directories", () => {
    it("has /srv/marketing", () => {
      expect(fs.getNode("/srv/marketing")?.type).toBe("directory");
    });

    it("has /srv/operations", () => {
      expect(fs.getNode("/srv/operations")?.type).toBe("directory");
    });

    it("has /srv/leadership", () => {
      expect(fs.getNode("/srv/leadership")?.type).toBe("directory");
    });

    it("denies access to /srv/marketing", () => {
      const result = fs.listDirectory("/srv/marketing");
      expect(result.error).toContain("Permission denied");
    });

    it("denies access to /srv/operations", () => {
      const result = fs.listDirectory("/srv/operations");
      expect(result.error).toContain("Permission denied");
    });

    it("denies access to /srv/leadership", () => {
      const result = fs.listDirectory("/srv/leadership");
      expect(result.error).toContain("Permission denied");
    });

    it("allows access to /srv/engineering", () => {
      const result = fs.listDirectory("/srv/engineering");
      expect(result.error).toBeUndefined();
      expect(result.entries.length).toBeGreaterThan(0);
    });
  });
});
