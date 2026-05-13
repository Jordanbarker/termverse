import { VirtualFS } from "../filesystem/VirtualFS";
import { getEmailDefinitions } from "./emails";
import { deliverEmail, deliverEmailAsRead, getMailEntries } from "./mailUtils";
import { ComputerId, PLAYER, StoryFlags } from "../../state/types";
import { matchesCommonTrigger } from "../narrative/triggerMatcher";

export type GameEvent =
  | { type: "command_executed"; detail: string }
  | { type: "file_read"; detail: string }
  | { type: "objective_completed"; detail: string }
  | { type: "directory_visit"; detail: string }
  | { type: "directory_created"; detail: string }
  | { type: "directory_removed"; detail: string }
  | { type: "file_created"; detail: string }
  | { type: "file_modified"; detail: string }
  | { type: "file_removed"; detail: string }
  | { type: "piper_delivered"; detail: string }
  | { type: "terminated"; detail: "log_tampering" | "leadership_destruction" | "exfiltration" };

export function checkEmailDeliveries(
  fs: VirtualFS,
  event: GameEvent,
  deliveredIds: string[],
  computer: ComputerId = "nexacorp",
  storyFlags?: StoryFlags
): { fs: VirtualFS; newDeliveries: string[] } {
  const newDeliveries: string[] = [];
  let currentFs = fs;

  // Determine next sequence number from existing entries
  const existing = getMailEntries(currentFs);
  let nextSeq = existing.length > 0 ? Math.max(...existing.map((e) => e.seq)) + 1 : 1;

  const username = fs.homeDir.split("/").pop() || PLAYER.username;
  for (const def of getEmailDefinitions(username, computer, storyFlags)) {
    const triggers = Array.isArray(def.trigger) ? def.trigger : [def.trigger];
    if (triggers.every((t) => t.type === "immediate")) continue;
    if (deliveredIds.includes(def.email.id)) continue;
    if (newDeliveries.includes(def.email.id)) continue;

    let matches = false;
    for (const trigger of triggers) {
      if (trigger.type === "immediate") continue;
      matches = matchesCommonTrigger(trigger, event, deliveredIds, newDeliveries, storyFlags);
      if (matches) break;
    }

    if (matches) {
      const result = deliverEmail(currentFs, def.email, nextSeq);
      currentFs = result.fs;
      newDeliveries.push(def.email.id);
      nextSeq++;
    }
  }

  return { fs: currentFs, newDeliveries };
}

/**
 * Re-seed previously delivered non-immediate emails into a freshly built filesystem.
 * Called from buildFs so emails survive filesystem rebuilds.
 */
export function seedDeliveredEmails(
  fs: VirtualFS,
  deliveredIds: string[],
  computer: ComputerId,
  username: string,
  readEmailIds: Set<string> = new Set(),
  storyFlags?: StoryFlags
): VirtualFS {
  const defs = getEmailDefinitions(username, computer, storyFlags);
  const existing = getMailEntries(fs);
  let nextSeq =
    existing.length > 0 ? Math.max(...existing.map((e) => e.seq)) + 1 : 1;
  let currentFs = fs;

  for (const def of defs) {
    const triggers = Array.isArray(def.trigger) ? def.trigger : [def.trigger];
    if (triggers.every((t) => t.type === "immediate")) continue;
    if (!deliveredIds.includes(def.email.id)) continue;

    const deliver = readEmailIds.has(def.email.id) ? deliverEmailAsRead : deliverEmail;
    const result = deliver(currentFs, def.email, nextSeq);
    currentFs = result.fs;
    nextSeq++;
  }

  return currentFs;
}
