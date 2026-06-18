import { CommandHandler } from "../types";
import { register } from "../registry";
import { resolveSshTarget } from "@tt/core/ssh/sshConfig";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { ComputerId } from "../../../state/types";

interface SshRoute {
  /** Resolved hostname after alias lookup. */
  host: string;
  /** Computer to transition to on successful connect. */
  targetComputer: ComputerId;
  /** Required SSH user for this route. */
  user: string;
  /** When set, this route requires a forwarded ssh-agent socket whose owner-marker matches. */
  requiresAgent?: "erik";
}

const NEXACORP_HOST = "nexacorp-ws01.nexacorp.internal";
const ERIK_HOST = "nexacorp-lt05";
const ERIK_HOST_FQDN = "nexacorp-lt05.nexa.internal";

/**
 * Source-aware allowlist of SSH targets. Adding a new route here is the only
 * place to wire up an SSH-reachable computer.
 */
const SSH_ROUTES: Partial<Record<ComputerId, SshRoute[]>> = {
  home: [
    { host: NEXACORP_HOST, targetComputer: "nexacorp", user: "ren" },
  ],
  chipinfra: [
    { host: ERIK_HOST, targetComputer: "erik-pc", user: "erik", requiresAgent: "erik" },
    { host: ERIK_HOST_FQDN, targetComputer: "erik-pc", user: "erik", requiresAgent: "erik" },
  ],
};

const ssh: CommandHandler = (args, _flags, ctx) => {
  if (args.length === 0) {
    return { output: "usage: ssh [user@]hostname" };
  }

  // Day-1 tutorial gate on home: ssh times out after the player has been
  // sent home but before shutdown closes out Day 1. Only applies to the
  // home → nexacorp route.
  if (
    ctx.activeComputer === "home" &&
    ctx.storyFlags?.returned_home_day1 &&
    !ctx.storyFlags?.day1_shutdown
  ) {
    return { output: `ssh: connect to host ${args[0]}: Connection timed out` };
  }

  const target = args[0];

  // Read ~/.ssh/config for alias resolution.
  const configPath = resolvePath(".ssh/config", ctx.homeDir, ctx.homeDir);
  const configResult = ctx.fs.readFile(configPath);
  const configContent = configResult.content;

  const resolved = resolveSshTarget(target, configContent);
  if (!resolved || !resolved.host) {
    return { output: `ssh: Could not resolve hostname ${target}` };
  }

  const routes = SSH_ROUTES[ctx.activeComputer as ComputerId] ?? [];
  const matchingHostRoute = routes.find((r) => r.host === resolved.host);
  if (!matchingHostRoute) {
    return {
      output: `ssh: Could not resolve hostname ${resolved.host}: Name or service not known`,
    };
  }

  // Default the user from the route if the caller didn't specify one (config alias may carry it).
  const requestedUser = resolved.user || matchingHostRoute.user;
  if (!requestedUser) {
    return { output: `ssh: Could not resolve hostname ${target}` };
  }

  // Wrong user → publickey rejection (matches OpenSSH).
  if (requestedUser !== matchingHostRoute.user) {
    return { output: `${requestedUser}@${resolved.host}: Permission denied (publickey).` };
  }

  // Terminated employees: NexaCorp SSO is deactivated. Refuse the connection
  // with a realistic auth failure — same shape as a wrong-user rejection.
  if (
    matchingHostRoute.targetComputer === "nexacorp" &&
    ctx.storyFlags?.terminated_for_misconduct
  ) {
    return { output: `${requestedUser}@${resolved.host}: Permission denied (publickey,password).` };
  }

  // Agent-forwarding routes require a valid SSH_AUTH_SOCK pointing at a socket
  // whose adjacent .user-<name> marker matches the expected agent owner.
  if (matchingHostRoute.requiresAgent) {
    const sock = ctx.envVars?.SSH_AUTH_SOCK;
    if (!sock) {
      return { output: `${requestedUser}@${resolved.host}: Permission denied (publickey).` };
    }
    // Resolve against CWD so a relative SSH_AUTH_SOCK behaves like real ssh.
    const resolvedSock = resolvePath(sock, ctx.cwd, ctx.homeDir);
    const sockResult = ctx.fs.readFile(resolvedSock);
    if (sockResult.content === undefined) {
      return { output: `${requestedUser}@${resolved.host}: Permission denied (publickey).` };
    }
    const slash = resolvedSock.lastIndexOf("/");
    const sockDir = slash >= 0 ? resolvedSock.slice(0, slash) : "";
    const dir = ctx.fs.listDirectory(sockDir);
    const expectedMarker = `.user-${matchingHostRoute.requiresAgent}`;
    const hasMarker = dir.entries?.some((e) => e.name === expectedMarker);
    if (!hasMarker) {
      return { output: `${requestedUser}@${resolved.host}: Permission denied (publickey).` };
    }
  }

  return {
    output: "",
    sshSession: {
      host: resolved.host,
      username: requestedUser,
      targetComputer: matchingHostRoute.targetComputer,
    },
  };
};

register("ssh", ssh, "Connect to a remote host via SSH");
