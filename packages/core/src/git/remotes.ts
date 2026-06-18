import { RemoteRepoDef } from "./types";
import { shortHash } from "./repo";

/**
 * Build a simple remote with a single initial commit from a set of files.
 * Generic helper; story content composes richer remotes on top of this.
 */
export function buildSimpleRemote(
  files: Record<string, string>,
  opts: { author: string; defaultBranch?: string; commitMessage?: string }
): RemoteRepoDef {
  const branch = opts.defaultBranch ?? "main";
  const message = opts.commitMessage ?? "Initial commit";
  const timestamp = 1700000000000; // fixed for determinism
  const hash = shortHash(message + timestamp + "" + JSON.stringify(files));

  return {
    files,
    defaultBranch: branch,
    commits: [
      {
        hash,
        parent: null,
        message,
        author: opts.author,
        timestamp,
        tree: files,
      },
    ],
  };
}

/**
 * Registry of clonable remote repositories, keyed by the URL passed to
 * `git clone`. Empty in core; the app's story layer populates it at startup
 * (see src/story/git/remotes.ts). Tests populate it directly with fixtures.
 */
export const REMOTE_REPOS: Record<string, RemoteRepoDef> = {};
