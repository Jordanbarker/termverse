import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { HELP_TEXTS } from "./helpTexts";

interface AgentKey {
  bits: number;
  fingerprint: string;
  comment: string;
  type: "ED25519" | "RSA";
  pubkey: string;
}

const ERIK_KEYS: AgentKey[] = [
  {
    bits: 256,
    fingerprint: "SHA256:6kOmQzL1V8c7K9pXvH5tR2fSnB4yWqJ3aE0iD8gM7bU",
    comment: "erik@nexacorp-lt05",
    type: "ED25519",
    pubkey: "AAAAC3NzaC1lZDI1NTE5AAAAIDxK8mF2vN6qR9pYwL3hX7tA1cE5gJ4bK0iU8sV2nM6r",
  },
  {
    bits: 3072,
    fingerprint: "SHA256:vR2fSnB4yWqJ3aE0iD8gM7bU6kOmQzL1V8c7K9pXvH5",
    comment: "erik@nexacorp-lt05",
    type: "RSA",
    pubkey:
      "AAAAB3NzaC1yc2EAAAADAQABAAABgQDFxK8mF2vN6qR9pYwL3hX7tA1cE5gJ4bK0iU8sV2nM6rQzL1V8c7K9pXvH5tR2fSnB4yWqJ3aE0iD8gM7bU6kOmQzL1V8c7K9pXvH5tR2fSnB4yWqJ3aE0iD8gM7bU",
  },
];

const sshAdd: CommandHandler = (_args, flags, ctx) => {
  // Real ssh-add accepts -l (list fingerprints), -L (list pubkeys), -d, -D, etc.
  // Default with no args is to add the default identities; we don't model that —
  // treat no args as a synonym for -l, which is what most users actually want.
  const mode = flags.L ? "list-pubkey" : "list-fingerprint";

  const sock = ctx.envVars?.SSH_AUTH_SOCK;
  if (!sock) {
    return {
      output: "Could not open a connection to your authentication agent.",
      exitCode: 2,
    };
  }

  // Real ssh-add hands SSH_AUTH_SOCK to connect(2), which resolves a relative
  // path against the process's CWD. Mirror that here so e.g. `agent.18472`
  // from `/tmp/ssh-mZ4xPq` finds the socket.
  const resolvedSock = resolvePath(sock, ctx.cwd, ctx.homeDir);
  const sockResult = ctx.fs.readFile(resolvedSock);
  if (sockResult.content === undefined) {
    return {
      output: `Error connecting to agent: No such file or directory`,
      exitCode: 2,
    };
  }

  // Look for a sibling `.user-<name>` marker in the socket's directory to
  // determine whose keys are loaded. VirtualFS does not model ownership, so
  // these markers are how we convey "this socket belongs to <user>".
  const slash = resolvedSock.lastIndexOf("/");
  const sockDir = slash >= 0 ? resolvedSock.slice(0, slash) : "";
  const dir = ctx.fs.listDirectory(sockDir);
  const marker = dir.entries?.find((e) => e.name.startsWith(".user-"));
  if (!marker) {
    return {
      output: "The agent has no identities.",
      exitCode: 1,
    };
  }

  const ownerName = marker.name.slice(".user-".length);

  if (ownerName !== "erik") {
    return {
      output: "The agent has no identities.",
      exitCode: 1,
    };
  }

  const lines = ERIK_KEYS.map((k) =>
    mode === "list-pubkey"
      ? `ssh-${k.type.toLowerCase()} ${k.pubkey} ${k.comment}`
      : `${k.bits} ${k.fingerprint} ${k.comment} (${k.type})`
  );

  return {
    output: lines.join("\n"),
    triggerEvents: [{ type: "command_executed", detail: "ran_ssh_add_erik" }],
  };
};

register("ssh-add", sshAdd, "Add private keys to the SSH authentication agent", HELP_TEXTS["ssh-add"]);
setKnownFlags("ssh-add", { short: ["l", "L"] });
