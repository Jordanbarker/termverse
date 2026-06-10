import { GameEvent } from "../mail/delivery";
import { PiperDelivery, PiperMessage, PiperTrigger } from "./types";
import { getPiperDeliveries } from "../../story/piper/messages";
import { PIPER_CHANNELS } from "../../story/piper/channels";
import { ComputerId, StoryFlags } from "../../state/types";
import { matchesCommonTrigger } from "../narrative/triggerMatcher";
import { computeTimestamp, interpolateDeliveries } from "./timestamp";
import { getTriggersForComputer, checkStoryFlagTriggers } from "../narrative/storyFlags";

/**
 * Check if any piper deliveries should fire for the given event.
 * Returns new delivery IDs to add to deliveredPiperIds.
 */
export function checkPiperDeliveries(
  event: GameEvent,
  deliveredIds: string[],
  username: string,
  computerId?: ComputerId,
  storyFlags?: StoryFlags
): string[] {
  const newDeliveries: string[] = [];
  const allDeliveries = getPiperDeliveries(username);
  const deliveries = computerId
    ? allDeliveries.filter((d) => (d.computer ?? "nexacorp") === computerId)
    : allDeliveries;

  for (const def of deliveries) {
    const triggers = Array.isArray(def.trigger) ? def.trigger : [def.trigger];
    if (triggers.every((t) => t.type === "immediate")) continue;
    if (deliveredIds.includes(def.id)) continue;
    if (newDeliveries.includes(def.id)) continue;

    let matches = false;
    for (const trigger of triggers) {
      if (trigger.type === "immediate") continue;
      matches = matchesTrigger(trigger, event, deliveredIds, newDeliveries, storyFlags);
      if (matches) break;
    }

    if (matches) {
      newDeliveries.push(def.id);
    }
  }

  return newDeliveries;
}

function matchesTrigger(
  trigger: PiperTrigger,
  event: GameEvent,
  deliveredIds: string[],
  newDeliveries: string[],
  storyFlags?: StoryFlags
): boolean {
  switch (trigger.type) {
    case "after_piper_reply":
      return event.type === "objective_completed" && event.detail === `piper_reply:${trigger.deliveryId}`;
    default:
      return matchesCommonTrigger(trigger, event, deliveredIds, newDeliveries, storyFlags);
  }
}

export interface PiperCascadeResult {
  newPiperIds: string[];
  flagUpdates: { flag: string; value: string | boolean; toast?: string }[];
}

/**
 * Run the post-event piper delivery cascade for a single event:
 *   1. Computer-scoped piper deliveries.
 *   2. Cross-computer piper deliveries (story-flag triggers are global).
 *   3. piper_delivered story-flag triggers fired through the originating
 *      computer's trigger list (mirrors processDeliveries.ts).
 *
 * Pure: returns the deltas. Callers apply them to the store and own any UI
 * side-effects (toasts, "new messages" notices) — the helper does not write
 * to the terminal or the toast queue.
 */
export function deliverPiperAndCascade(
  event: GameEvent,
  computerId: ComputerId,
  username: string,
  deliveredPiperIds: string[],
  storyFlags: StoryFlags
): PiperCascadeResult {
  const result: PiperCascadeResult = { newPiperIds: [], flagUpdates: [] };
  let piperIds = [...deliveredPiperIds];
  let currentFlags = { ...storyFlags };

  const scoped = checkPiperDeliveries(event, piperIds, username, computerId, currentFlags);
  if (scoped.length > 0) {
    piperIds = [...piperIds, ...scoped];
    result.newPiperIds.push(...scoped);
  }

  const cross = checkPiperDeliveries(event, piperIds, username, undefined, currentFlags);
  if (cross.length > 0) {
    piperIds = [...piperIds, ...cross];
    result.newPiperIds.push(...cross);
  }

  if (result.newPiperIds.length > 0) {
    const triggers = getTriggersForComputer(computerId, username);
    for (const id of result.newPiperIds) {
      const pdEvent: GameEvent = { type: "piper_delivered", detail: id };
      const flagResults = checkStoryFlagTriggers(pdEvent, triggers, currentFlags);
      for (const flagResult of flagResults) {
        result.flagUpdates.push(flagResult);
        currentFlags = { ...currentFlags, [flagResult.flag]: flagResult.value };
      }
    }
  }

  return result;
}

/**
 * Get delivery IDs for all "immediate" piper messages for the given computer.
 * Called once at game start to seed initial messages.
 */
export function seedImmediatePiper(username: string, computerId?: ComputerId): string[] {
  const allDeliveries = getPiperDeliveries(username);
  const deliveries = computerId
    ? allDeliveries.filter((d) => (d.computer ?? "nexacorp") === computerId)
    : allDeliveries;

  const ids: string[] = [];
  for (const def of deliveries) {
    const triggers = Array.isArray(def.trigger) ? def.trigger : [def.trigger];
    if (triggers.some((t) => t.type === "immediate")) {
      ids.push(def.id);
    }
  }
  return ids;
}

/**
 * Build the conversation history for a channel, including player replies.
 * Returns messages in delivery order (the order IDs appear in deliveredIds).
 * Timestamps are computed dynamically based on delivery order.
 */
export function getConversationHistory(
  channelId: string,
  deliveredIds: string[],
  username: string,
  _computerId: ComputerId = "nexacorp"
): PiperMessage[] {
  const messages: PiperMessage[] = [];
  const defMap = new Map(getPiperDeliveries(username).map((d) => [d.id, d]));

  // Pass 1: Interpolate delivery timestamps across segments
  const { deliveryMinutes: deliveryMinutesMap } = interpolateDeliveries(deliveredIds, defMap);

  // Pass 2: Build messages for the requested channel with computed timestamps
  for (const id of deliveredIds) {
    if (defMap.has(id)) {
      const def = defMap.get(id)!;
      if (def.channelId !== channelId) continue;
      const absoluteMinutes = deliveryMinutesMap.get(id) ?? 510;
      for (let i = 0; i < def.messages.length; i++) {
        messages.push({
          ...def.messages[i],
          timestamp: computeTimestamp(absoluteMinutes, i),
        });
      }
    } else if (id.startsWith("reply:")) {
      const parts = id.split(":");
      const deliveryId = parts[1];
      const optionIdx = parseInt(parts[2], 10);
      const def = defMap.get(deliveryId);
      if (!def || def.channelId !== channelId || !def.replyOptions) continue;
      messages.push({
        id,
        from: username,
        timestamp: "",
        body: def.replyOptions[optionIdx].messageBody,
        isPlayer: true,
      });
    }
  }

  return messages;
}

/**
 * Get the pending reply options for a channel (if any).
 * Returns the delivery ID and options for the most recent unread delivery with reply options.
 */
export function getPendingReply(
  channelId: string,
  deliveredIds: string[],
  username: string
): { deliveryId: string; options: PiperDelivery["replyOptions"] } | null {
  const defs = getPiperDeliveries(username);

  // Find the last delivered message in this channel that has reply options
  // and hasn't been replied to yet
  for (let i = defs.length - 1; i >= 0; i--) {
    const def = defs[i];
    if (def.channelId !== channelId) continue;
    if (!deliveredIds.includes(def.id)) continue;
    if (!def.replyOptions) continue;

    // Check if already replied
    const hasReply = def.replyOptions.some(
      (_, idx) => deliveredIds.includes(`reply:${def.id}:${idx}`)
    );
    if (hasReply) return null;

    return { deliveryId: def.id, options: def.replyOptions };
  }

  return null;
}

/**
 * Look up the channel and sender for a delivery by ID.
 */
export function getDeliveryInfo(
  deliveryId: string,
  username: string
): { channelId: string; senderName: string } | null {
  const def = getPiperDeliveries(username).find((d) => d.id === deliveryId);
  if (!def || def.messages.length === 0) return null;
  return { channelId: def.channelId, senderName: def.messages[0].from };
}

/**
 * Get channels that have at least one delivered message, filtered by computer.
 * DM channels only show up when they have content.
 */
export function getVisibleChannels(
  deliveredIds: string[],
  username: string,
  computerId?: ComputerId
): { channel: typeof PIPER_CHANNELS[number]; unread: number }[] {
  const defs = getPiperDeliveries(username);
  const result: { channel: typeof PIPER_CHANNELS[number]; unread: number }[] = [];

  const channels = computerId
    ? PIPER_CHANNELS.filter((c) => (c.computer ?? "nexacorp") === computerId)
    : PIPER_CHANNELS;

  for (const channel of channels) {
    const channelDefs = defs.filter(
      (d) => d.channelId === channel.id && deliveredIds.includes(d.id)
    );

    if (channelDefs.length === 0 && channel.type === "dm") continue;
    if (channelDefs.length === 0 && channel.type === "channel") {
      // Always show channels even if empty
      result.push({ channel, unread: 0 });
      continue;
    }

    // Count unread: NPC messages only (player messages are never "unseen")
    const totalMessages = channelDefs.reduce((sum, d) => sum + d.messages.filter((m) => !m.isPlayer).length, 0);
    const seenPrefix = `seen:${channel.id}:`;
    // Use the highest seen count (last marker) to handle stale markers in the store
    let seenCount = 0;
    for (const id of deliveredIds) {
      if (id.startsWith(seenPrefix)) {
        const n = parseInt(id.slice(seenPrefix.length) || "0", 10);
        if (n > seenCount) seenCount = n;
      }
    }
    const unread = Math.max(0, totalMessages - seenCount);

    result.push({ channel, unread });
  }

  return result;
}
