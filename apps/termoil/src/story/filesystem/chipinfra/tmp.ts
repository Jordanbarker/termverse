import { DirectoryNode } from "@tt/core/filesystem/types";
import { file, dir } from "@tt/core/filesystem/builders";

/**
 * /tmp for the chipinfra workspace.
 *
 * Erik's still-active SSH agent socket lives here. VirtualFS does not model
 * file ownership, so we convey "this socket belongs to Erik" with an
 * adjacent .user-erik marker file. Oscar's older socket is kept for contrast.
 *
 * The `.user-erik` marker is the source of truth for ssh-add and ssh: when
 * SSH_AUTH_SOCK points at agent.18472, those commands look at the sibling
 * marker to decide whose keys are loaded. Reading the marker is what
 * surfaces the pivot opportunity to the player (sets `cat_erik_socket_marker`).
 */
export function buildTmpDirectory(): DirectoryNode {
  return dir("tmp", {
    // Erik's recent agent socket (he ssh'd in with -A within the last hour).
    "ssh-mZ4xPq": dir("ssh-mZ4xPq", {
      "agent.18472": file("agent.18472", ""),
      ".user-erik": file(".user-erik", `erik
session: 2026-05-08T22:14:18Z
forwarded: yes
`),
    }),

    // Oscar's older agent dir from a prior maintenance window — kept around
    // so Erik's recent one stands out by comparison.
    "ssh-Yt9pLz": dir("ssh-Yt9pLz", {
      "agent.9123": file("agent.9123", ""),
      ".user-oscar": file(".user-oscar", `oscar
session: 2026-05-06T03:01:44Z
forwarded: no
`),
    }),

    ".X11-unix": dir(".X11-unix", {}),
  });
}
