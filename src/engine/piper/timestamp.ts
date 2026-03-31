import { ComputerId } from "../../state/types";
import { PiperDelivery } from "./types";

// ---------------------------------------------------------------------------
// Segment definitions
// ---------------------------------------------------------------------------

export type SegmentId =
  | "nexacorp_day1"
  | "nexacorp_day2"
  | "home_pre_work"
  | "home_post_work"
  | "home_day2";

export interface Segment {
  id: SegmentId;
  clockKey: "nexacorp" | "home";
  startMinutes: number; // absolute minutes from midnight
  duration: number; // span in minutes
  calendar: { dow: string; month: string; day: string; year: string };
}

export const SEGMENTS: Segment[] = [
  {
    id: "nexacorp_day1",
    clockKey: "nexacorp",
    startMinutes: 510, // 8:30 AM
    duration: 585, // → 6:15 PM
    calendar: { dow: "Mon", month: "Feb", day: "23", year: "2026" },
  },
  {
    id: "nexacorp_day2",
    clockKey: "nexacorp",
    startMinutes: 510, // 8:30 AM
    duration: 570, // → 6:00 PM
    calendar: { dow: "Tue", month: "Feb", day: "24", year: "2026" },
  },
  {
    id: "home_pre_work",
    clockKey: "home",
    startMinutes: 840, // 2:00 PM
    duration: 120, // → 4:00 PM
    calendar: { dow: "Sat", month: "Feb", day: "21", year: "2026" },
  },
  {
    id: "home_post_work",
    clockKey: "home",
    startMinutes: 1095, // 6:15 PM
    duration: 165, // → 9:00 PM
    calendar: { dow: "Mon", month: "Feb", day: "23", year: "2026" },
  },
  {
    id: "home_day2",
    clockKey: "home",
    startMinutes: 390, // 6:30 AM
    duration: 150, // → 9:00 AM
    calendar: { dow: "Tue", month: "Feb", day: "24", year: "2026" },
  },
];

/** Boundary flags that advance each clock to its next segment */
export const SEGMENT_BOUNDARIES: Record<
  string,
  { flag: string; nextSegment: SegmentId }[]
> = {
  nexacorp: [{ flag: "ssh_day2", nextSegment: "nexacorp_day2" }],
  home: [
    { flag: "returned_home_day1", nextSegment: "home_post_work" },
    { flag: "day1_shutdown", nextSegment: "home_day2" },
  ],
};

/** Starting segment per clock key */
export const INITIAL_SEGMENTS: Record<string, SegmentId> = {
  nexacorp: "nexacorp_day1",
  home: "home_pre_work",
};

const segmentMap = new Map(SEGMENTS.map((s) => [s.id, s]));

export function getSegmentById(id: SegmentId): Segment {
  return segmentMap.get(id)!;
}

// ---------------------------------------------------------------------------
// Total delivery counts per segment (for proportional interpolation)
// ---------------------------------------------------------------------------

/**
 * Count all non-reply deliveries per segment across ALL definitions.
 * Used as the denominator so timestamps scale proportionally to how many
 * deliveries the player has triggered vs. the total possible.
 */
function countTotalDeliveriesPerSegment(
  defMap: Map<string, PiperDelivery>
): Map<SegmentId, number> {
  const currentSegment: Record<string, SegmentId> = { ...INITIAL_SEGMENTS };
  const boundaryIdx: Record<string, number> = { nexacorp: 0, home: 0 };
  const counts = new Map<SegmentId, number>();

  for (const def of defMap.values()) {
    const computer = def.computer ?? "nexacorp";
    const clockKey = computer === "home" ? "home" : "nexacorp";
    const triggers = Array.isArray(def.trigger) ? def.trigger : [def.trigger];

    const boundaries = SEGMENT_BOUNDARIES[clockKey] ?? [];
    const idx = boundaryIdx[clockKey] ?? 0;
    if (idx < boundaries.length) {
      const hasBoundaryFlag = triggers.some(
        (t) =>
          t.type === "after_story_flag" && t.flag === boundaries[idx].flag
      );
      if (hasBoundaryFlag) {
        currentSegment[clockKey] = boundaries[idx].nextSegment;
        boundaryIdx[clockKey] = idx + 1;
      }
    }

    const isReplyFollowUp = triggers.some((t) => t.type === "after_piper_reply");
    if (isReplyFollowUp) continue;

    const segId = currentSegment[clockKey];
    counts.set(segId, (counts.get(segId) ?? 0) + 1);
  }

  return counts;
}

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

export interface InterpolationResult {
  /** delivery ID → absolute minutes from midnight */
  deliveryMinutes: Map<string, number>;
  /** clockKey → current (last) segment ID */
  lastSegment: Record<string, SegmentId>;
}

/**
 * Bucket deliveries into time segments and linearly interpolate timestamps
 * within each segment. Shared by getConversationHistory and getGameTime.
 */
export function interpolateDeliveries(
  deliveredIds: string[],
  defMap: Map<string, PiperDelivery>
): InterpolationResult {
  // Current segment per clockKey
  const currentSegment: Record<string, SegmentId> = { ...INITIAL_SEGMENTS };
  // Boundary index tracker per clockKey (which boundary we're past)
  const boundaryIdx: Record<string, number> = { nexacorp: 0, home: 0 };
  // Per-segment buckets of delivery IDs (non-reply only)
  const segmentBuckets = new Map<SegmentId, string[]>();
  // Reply follow-ups: childId → parentId
  const replyParent = new Map<string, string>();

  // Pass 1: bucket deliveries into segments
  for (const id of deliveredIds) {
    if (id.startsWith("reply:") || id.startsWith("seen:")) continue;
    const def = defMap.get(id);
    if (!def) continue;

    const computer = def.computer ?? "nexacorp";
    const clockKey = computer === "home" ? "home" : "nexacorp";

    // Check if this delivery's triggers match a segment boundary flag
    const triggers = Array.isArray(def.trigger) ? def.trigger : [def.trigger];
    const boundaries = SEGMENT_BOUNDARIES[clockKey] ?? [];
    const idx = boundaryIdx[clockKey] ?? 0;
    if (idx < boundaries.length) {
      const hasBoundaryFlag = triggers.some(
        (t) =>
          t.type === "after_story_flag" && t.flag === boundaries[idx].flag
      );
      if (hasBoundaryFlag) {
        currentSegment[clockKey] = boundaries[idx].nextSegment;
        boundaryIdx[clockKey] = idx + 1;
      }
    }

    // Check if this is a reply follow-up
    const isReplyFollowUp = triggers.some(
      (t) => t.type === "after_piper_reply"
    );
    if (isReplyFollowUp) {
      const parentTrigger = triggers.find(
        (t) => t.type === "after_piper_reply"
      );
      if (parentTrigger && parentTrigger.type === "after_piper_reply") {
        replyParent.set(id, parentTrigger.deliveryId);
      }
      continue; // don't add to segment buckets
    }

    const segId = currentSegment[clockKey];
    if (!segmentBuckets.has(segId)) segmentBuckets.set(segId, []);
    segmentBuckets.get(segId)!.push(id);
  }

  // Pass 2: interpolate within each segment
  // Use total possible deliveries as denominator so timestamps scale
  // proportionally — few deliveries = early in the day, not end-of-day.
  const totalPerSegment = countTotalDeliveriesPerSegment(defMap);
  const deliveryMinutes = new Map<string, number>();
  for (const [segId, ids] of segmentBuckets) {
    const seg = getSegmentById(segId);
    const total = totalPerSegment.get(segId) ?? ids.length;
    const n = ids.length;
    for (let i = 0; i < n; i++) {
      const t =
        seg.startMinutes + (i / Math.max(total - 1, 1)) * seg.duration;
      deliveryMinutes.set(ids[i], Math.floor(t));
    }
  }

  // Pass 3: reply follow-ups = parent + 2 min
  for (const [childId, parentId] of replyParent) {
    const parentMin = deliveryMinutes.get(parentId);
    if (parentMin !== undefined) {
      deliveryMinutes.set(childId, parentMin + 2);
    }
  }

  return { deliveryMinutes, lastSegment: { ...currentSegment } };
}

// ---------------------------------------------------------------------------
// Timestamp formatting
// ---------------------------------------------------------------------------

/**
 * Compute a formatted timestamp for a Piper message.
 * @param absoluteMinutes Minutes from midnight for this delivery
 * @param messageIndex Index of the message within its delivery
 */
export function computeTimestamp(
  absoluteMinutes: number,
  messageIndex: number
): string {
  const total = absoluteMinutes + Math.floor(messageIndex / 2);
  return formatMinutes(total);
}

/**
 * Get the current game time for a computer as { hour, minute, second } and calendar info.
 * Used by the `date` command to show dynamic time based on story progression.
 */
export function getGameTime(
  deliveredPiperIds: string[],
  defMap: Map<string, PiperDelivery>,
  computer: ComputerId
): {
  hour: string;
  minute: string;
  second: string;
  dow: string;
  month: string;
  day: string;
  year: string;
} {
  const clockKey = computer === "home" ? "home" : "nexacorp";
  const { deliveryMinutes, lastSegment } = interpolateDeliveries(
    deliveredPiperIds,
    defMap
  );

  // Find the max time for this clockKey across all deliveries
  let maxMinutes = 0;
  for (const [id, mins] of deliveryMinutes) {
    const def = defMap.get(id);
    if (!def) continue;
    const defClock = (def.computer ?? "nexacorp") === "home" ? "home" : "nexacorp";
    if (defClock === clockKey && mins > maxMinutes) {
      maxMinutes = mins;
    }
  }

  // Add 3 min offset so `date` shows slightly after the last message
  const totalMinutes = maxMinutes > 0 ? maxMinutes + 3 : getSegmentById(lastSegment[clockKey] as SegmentId).startMinutes;

  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const seg = getSegmentById(lastSegment[clockKey] as SegmentId);

  return {
    hour: hours24.toString().padStart(2, "0"),
    minute: minutes.toString().padStart(2, "0"),
    second: "00",
    ...seg.calendar,
  };
}

/** Format total minutes from midnight as "h:mm AM/PM" */
function formatMinutes(totalMinutes: number): string {
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 =
    hours24 === 0 ? 12 : hours24 > 12 ? hours24 - 12 : hours24;
  const mm = minutes.toString().padStart(2, "0");
  return `${hours12}:${mm} ${period}`;
}
