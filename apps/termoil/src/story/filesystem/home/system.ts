import { DirectoryNode, FileNode } from "@tt/core/filesystem/types";
import { getHomeEmailDefinitions } from "../../emails/home";
import { formatEmailContent, slugify } from "../../../engine/mail/mailUtils";
import { PLAYER } from "../../../state/types";
import { file, dir } from "@tt/core/filesystem/builders";

export function buildHomeMailFiles(
  username: string
): Record<string, FileNode> {
  const files: Record<string, FileNode> = {};
  const immediateEmails = getHomeEmailDefinitions(username).filter((d) => {
    const triggers = Array.isArray(d.trigger) ? d.trigger : [d.trigger];
    return triggers.some((t) => t.type === "immediate");
  });
  immediateEmails.forEach((def, i) => {
    const seq = String(i + 1).padStart(3, "0");
    const filename = `${seq}_${slugify(def.email.subject)}`;
    files[filename] = {
      type: "file",
      name: filename,
      content: formatEmailContent(def.email, false),
      permissions: "rw-r--r--",
      hidden: false,
    };
  });
  return files;
}

export function buildSystemDirs(
  username: string
): Record<string, DirectoryNode> {
  return {
    var: dir("var", {
      mail: dir("mail", {
        [username]: dir(username, {
          new: dir("new", buildHomeMailFiles(username)),
          cur: dir("cur", {}),
          sent: dir("sent", {}),
        }),
      }),
    }),
    etc: dir("etc", {
      hostname: file("hostname", "maniac-iv\n"),
      "os-release": file("os-release", `PRETTY_NAME="Ubuntu 24.04.1 LTS"
NAME="Ubuntu"
VERSION_ID="24.04"
VERSION="24.04.1 LTS (Noble Numbat)"
ID=ubuntu
ID_LIKE=debian
HOME_URL="https://www.ubuntu.com/"
SUPPORT_URL="https://help.ubuntu.com/"
BUG_REPORT_URL="https://bugs.launchpad.net/ubuntu/"
`),
      passwd: file("passwd", `root:x:0:0:root:/root:/bin/zsh
${username}:x:1000:1000:${PLAYER.displayName}:/home/${username}:/bin/zsh
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
`),
    }),
    tmp: dir("tmp", {}),
    mnt: dir("mnt", {
      usb: dir("usb", {}),
    }),
  };
}
