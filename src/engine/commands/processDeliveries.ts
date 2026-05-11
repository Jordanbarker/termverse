import { VirtualFS } from "../filesystem/VirtualFS";
import { checkEmailDeliveries, GameEvent } from "../mail/delivery";
import { checkPiperDeliveries } from "../piper/delivery";
import { getTriggersForComputer, checkStoryFlagTriggers } from "../narrative/storyFlags";
import { ComputerId, StoryFlags } from "../../state/types";
import { StoryFlagUpdate } from "./applyResult";

export interface DeliveryResult {
  fs: VirtualFS;
  newDeliveredEmailIds: string[];
  emailNotifications: number;
  newDeliveredPiperIds: string[];
  piperNotifications: number;
  storyFlagUpdates: StoryFlagUpdate[];
}

/**
 * Pure function that processes delivery cascades for a set of game events.
 * Handles: story flag triggers, email deliveries, piper deliveries, and
 * second-pass piper_delivered flag triggers.
 *
 * Delivery is scoped to the originating computer — events on nexacorp only
 * deliver nexacorp emails/piper, etc.
 */
export function processDeliveries(
  events: GameEvent[],
  computerFs: VirtualFS,
  computerId: ComputerId,
  deliveredEmailIds: string[],
  deliveredPiperIds: string[],
  username: string,
  storyFlags: StoryFlags
): DeliveryResult {
  const result: DeliveryResult = {
    fs: computerFs,
    newDeliveredEmailIds: [],
    emailNotifications: 0,
    newDeliveredPiperIds: [],
    piperNotifications: 0,
    storyFlagUpdates: [],
  };

  let currentFs = computerFs;
  const storyFlagTriggers = getTriggersForComputer(computerId, username);
  let currentFlags = { ...storyFlags };

  // First pass: process story flag triggers from command/file/directory events
  for (const event of events) {
    const flagResults = checkStoryFlagTriggers(event, storyFlagTriggers, currentFlags);
    for (const flagResult of flagResults) {
      result.storyFlagUpdates.push(flagResult);
      currentFlags = { ...currentFlags, [flagResult.flag]: flagResult.value };
    }
  }

  // Process email deliveries
  let emailIds = [...deliveredEmailIds];
  for (const event of events) {
    const delivery = checkEmailDeliveries(
      currentFs,
      event,
      emailIds,
      computerId,
      currentFlags
    );
    if (delivery.newDeliveries.length > 0) {
      currentFs = delivery.fs;
      emailIds = [...emailIds, ...delivery.newDeliveries];
      result.newDeliveredEmailIds.push(...delivery.newDeliveries);
      result.emailNotifications++;
    }
  }

  // Process piper deliveries (computer-scoped)
  let piperIds = [...deliveredPiperIds];
  for (const event of events) {
    const newPiper = checkPiperDeliveries(
      event,
      piperIds,
      username,
      computerId,
      currentFlags
    );
    if (newPiper.length > 0) {
      piperIds = [...piperIds, ...newPiper];
      result.newDeliveredPiperIds.push(...newPiper);
      result.piperNotifications++;
    }
  }

  // Cross-computer pass: story-flag triggers are global, so a flag set on one
  // computer (e.g. ran_dbt on devcontainer) should deliver piper messages
  // scoped to another computer (e.g. auri_dbt_results on nexacorp).
  // Duplicates are skipped because piperIds already contains the first pass.
  for (const event of events) {
    const newPiper = checkPiperDeliveries(
      event,
      piperIds,
      username,
      undefined,
      currentFlags
    );
    if (newPiper.length > 0) {
      piperIds = [...piperIds, ...newPiper];
      result.newDeliveredPiperIds.push(...newPiper);
      result.piperNotifications++;
    }
  }

  // Second pass: process piper_delivered events through story flag triggers
  for (const id of result.newDeliveredPiperIds) {
    const pdEvent: GameEvent = { type: "piper_delivered", detail: id };
    const flagResults = checkStoryFlagTriggers(pdEvent, storyFlagTriggers, currentFlags);
    for (const flagResult of flagResults) {
      result.storyFlagUpdates.push(flagResult);
      currentFlags = { ...currentFlags, [flagResult.flag]: flagResult.value };
    }
  }

  result.fs = currentFs;
  return result;
}
