import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import type { Challenge } from "./types";

const VAULT_DIR = "/home/player/vault";
const SECRETS_PATH = `${VAULT_DIR}/secrets.env`;

const SECRETS_BODY = `# Production credentials — handle with care.
API_TOKEN=sk-live-7f3c91a0
DB_PASSWORD=hunter2
`;

/**
 * Seed ~/vault/secrets.env and lock it to rw------- (600) so it can't be read.
 * The engine enforces read through the "other" bit (permissions[6]); at 600
 * that bit is off, so `cat secrets.env` returns "Permission denied". The single
 * step is to grant read (chmod +r / 644 / o+r) so the file becomes readable.
 */
function setup(base: VirtualFS): VirtualFS {
  const mk = base.makeDirectory(VAULT_DIR);
  if (!mk.fs) throw new Error(mk.error ?? `chmod-perms: mkdir ${VAULT_DIR} failed`);

  const wr = mk.fs.writeFile(SECRETS_PATH, SECRETS_BODY);
  if (!wr.fs) throw new Error(wr.error ?? `chmod-perms: write ${SECRETS_PATH} failed`);

  const lock = wr.fs.setPermissions(SECRETS_PATH, "rw-------");
  if (!lock.fs) throw new Error(lock.error ?? `chmod-perms: lock ${SECRETS_PATH} failed`);

  return lock.fs;
}

export const chmodPerms: Challenge = {
  id: "chmod-perms",
  title: "Permissions",
  type: "fs",
  fsWatchPath: VAULT_DIR,
  setup,
  steps: [
    {
      instruction:
        "Unlock the secret so you can read it.\n" +
        "\n" +
        '`cat secrets.env` fails with "Permission denied" right now. Look at its\n' +
        "permission string in the panel: rw------- means the owner can read/write,\n" +
        "but no one else can read it (the read bit is off). Use chmod to turn it on.\n" +
        "\n" +
        "New to chmod? It controls who can read (r), write (w), execute (x) a file.\n" +
        "• Symbolic (letters): a target (u=owner, g=group, o=other, a=all), then +/- a bit.\n" +
        "• Octal (numbers): three digits = owner/group/other, each summing r=4 w=2 x=1.\n" +
        "  So rw-r--r-- is 644 and rw------- (locked) is 600.\n" +
        "Grant read access, then watch the permission string change in the panel and\n" +
        "open the file to confirm.",
      // Readable exactly when the "other" read bit is set — the same bit the engine's
      // readFile() checks, so the step passes precisely when `cat` starts working.
      // Lenient: accepts +r, o+r, 644, 444, 604, ... (but not u+r alone).
      isComplete: (s) => s.fs.getNode(SECRETS_PATH)?.permissions[6] === "r",
    },
  ],
};
