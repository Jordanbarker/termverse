import { DirectoryNode, FileNode } from "../../../engine/filesystem/types";
import { getNexacorpEmailDefinitions } from "../../emails/nexacorp";
import { formatEmailContent, slugify } from "../../../engine/mail/mailUtils";
import { StoryFlags } from "../../../state/types";
import { generateSystemLog, generateSystemLogBak, generateAccessLog, generateAuthLog, generateAuthLogBak, generateChipActivityLog, LogOptions } from "../logs";
import { file, dir } from "../../../engine/filesystem/builders";
import { buildHomeDirectory } from "./home";
import { buildOptDirectory } from "./chip";
import { buildSrvDirectory } from "./srv";
import { buildEtcDirectory } from "./etc";

export { buildDbtProject } from "./dbt";

function buildInitialMailFiles(username: string): Record<string, FileNode> {
  const files: Record<string, FileNode> = {};
  const immediateEmails = getNexacorpEmailDefinitions(username).filter((d) => {
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

export function createNexacorpFilesystem(username: string, storyFlags: StoryFlags = {}): DirectoryNode {
  const overBudget = !!storyFlags.accepted_at_180k;
  const logOpts: LogOptions = { includeDay2: !!storyFlags.day1_shutdown };

  return dir("/", {
  home: buildHomeDirectory(username),
  var: dir("var", {
    mail: dir("mail", {
      [username]: dir(username, {
        new: dir("new", buildInitialMailFiles(username)),
        cur: dir("cur", {}),
        sent: dir("sent", {}),
      }),
    }),
    log: dir("log", {
      "system.log": file("system.log", generateSystemLog(username, logOpts)),
      "chip-activity.log": file("chip-activity.log", generateChipActivityLog(username, logOpts)),
      "system.log.bak": file("system.log.bak", generateSystemLogBak(username, logOpts)),
      "auth.log": file("auth.log", generateAuthLog(username, logOpts)),
      "auth.log.bak": file("auth.log.bak", generateAuthLogBak(username, logOpts)),
      "access.log": file("access.log", generateAccessLog(logOpts)),
    }),
  }),
  etc: buildEtcDirectory(),
  opt: buildOptDirectory(logOpts),
  srv: buildSrvDirectory(overBudget),
  tmp: dir("tmp", {}),
});
}
