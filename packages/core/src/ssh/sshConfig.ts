export interface SshHostEntry {
  hostname: string;
  user: string;
}

/**
 * Parse an SSH config file into a map of alias → { hostname, user }.
 * Handles the standard "Host" / "HostName" / "User" directives.
 */
export function parseSshConfig(content: string): Map<string, SshHostEntry> {
  const hosts = new Map<string, SshHostEntry>();
  let currentHost: string | null = null;
  let currentEntry: Partial<SshHostEntry> = {};

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^(\S+)\s+(.+)$/);
    if (!match) continue;

    const [, key, value] = match;
    const keyLower = key.toLowerCase();

    if (keyLower === "host") {
      // Save previous entry
      if (currentHost && currentEntry.hostname) {
        hosts.set(currentHost, {
          hostname: currentEntry.hostname,
          user: currentEntry.user || "",
        });
      }
      currentHost = value.trim();
      currentEntry = {};
    } else if (keyLower === "hostname") {
      currentEntry.hostname = value.trim();
    } else if (keyLower === "user") {
      currentEntry.user = value.trim();
    }
  }

  // Save last entry
  if (currentHost && currentEntry.hostname) {
    hosts.set(currentHost, {
      hostname: currentEntry.hostname,
      user: currentEntry.user || "",
    });
  }

  return hosts;
}

export interface ResolvedTarget {
  host: string;
  user: string;
}

/**
 * Resolve an SSH target (user@host or config alias) to { host, user }.
 */
export function resolveSshTarget(
  target: string,
  configContent: string | undefined
): ResolvedTarget | null {
  // Handle user@host format
  if (target.includes("@")) {
    const atIdx = target.indexOf("@");
    return {
      user: target.slice(0, atIdx),
      host: target.slice(atIdx + 1),
    };
  }

  // Try config alias
  if (configContent) {
    const hosts = parseSshConfig(configContent);
    const entry = hosts.get(target);
    if (entry) {
      return {
        host: entry.hostname,
        user: entry.user,
      };
    }
  }

  // Treat as bare hostname with no user
  return { host: target, user: "" };
}
