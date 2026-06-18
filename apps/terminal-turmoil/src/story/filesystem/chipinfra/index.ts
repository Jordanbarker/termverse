import { DirectoryNode } from "@tt/core/filesystem/types";
import { dir } from "@tt/core/filesystem/builders";
import { StoryFlags } from "../../../state/types";
import { LogOptions } from "../logs";
import { buildHomeDirectory } from "./home";
import { buildOptDirectory } from "./opt";
import { buildSrvDirectory } from "./srv";
import { buildTmpDirectory } from "./tmp";

/**
 * `coder ssh chip` — the Chip platform team's SHARED workspace.
 *
 * Hosts plugin runtime (/opt/chip/plugins/), the RAG corpus
 * (/srv/ai/rag/), and Chip inference data (/srv/chip/). The thin client
 * binary (/opt/chip/bin/chip) lives on NexaCorp ws01 and RPCs into here.
 *
 * Multiple engineers SSH in (Erik, Oscar, etc.) — see /home/ and /tmp/
 * for adjacent-context breadcrumbs. VirtualFS does not model file
 * ownership; presence is conveyed by content, not owner fields.
 */
export function createChipinfraFilesystem(username: string, storyFlags: StoryFlags = {}): DirectoryNode {
  // logOpts is reserved for future logs that vary by story progress; today
  // chipinfra logs are static, so we just pass a baseline.
  void storyFlags;
  const logOpts: LogOptions = { includeDay2: true };

  return dir("/", {
    home: buildHomeDirectory(username),
    opt: buildOptDirectory(logOpts),
    srv: buildSrvDirectory(),
    tmp: buildTmpDirectory(),
  });
}
