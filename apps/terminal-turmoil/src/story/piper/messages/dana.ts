import { PiperDelivery } from "../../../engine/piper/types";

export function getDanaDeliveries(_username: string): PiperDelivery[] {
  return [
    // === DM Dana: Welcome (after reading onboarding.md) ===
    {
      id: "dana_welcome",
      channelId: "dm_dana",
      messages: [
        {
          id: "dana_welcome_1",
          from: "Dana Okafor",
          timestamp: "",
          body: "Hey! I'm Dana, Operations Lead. Welcome to the team!",
        },
        {
          id: "dana_welcome_2",
          from: "Dana Okafor",
          timestamp: "",
          body: "If you ever need access to anything operations-related or have questions about how we handle incidents, just ping me.",
        },
      ],
      trigger: { type: "after_file_read", filePath: "/srv/engineering/onboarding.md" },
    },

    // === DM Dana: Ops dashboard broken (after processing_tools_accepted) ===
    {
      id: "dana_ops_dashboard",
      channelId: "dm_dana",
      messages: [
        {
          id: "dana_ops_1",
          from: "Dana Okafor",
          timestamp: "",
          body: "Hey, quick ask: my ops dashboard has been throwing parse errors since yesterday.",
        },
        {
          id: "dana_ops_2",
          from: "Dana Okafor",
          timestamp: "",
          body: "The data comes from a CSV export in /srv/operations/ called ops_incidents.csv. Something changed in the file format and now the dashboard chokes on it.",
        },
        {
          id: "dana_ops_3",
          from: "Dana Okafor",
          timestamp: "",
          body: "Could you take a look and see what's different? I'd check myself but I'm buried in incident review prep.",
        },
      ],
      trigger: { type: "after_objective", objectiveId: "processing_tools_accepted" },
      replyOptions: [
        {
          label: "On it. I'll take a look.",
          messageBody: "Sure thing! I'll check the CSV and see what's off.",
          triggerEvents: [{ type: "objective_completed", detail: "dana_ops_accepted" }],
        },
        {
          label: "I can't access /srv/operations/ (Permission denied)",
          messageBody: "I tried to look but I'm getting 'Permission denied' on /srv/operations/.",
          triggerEvents: [
            { type: "objective_completed", detail: "dana_ops_accepted" },
            { type: "objective_completed", detail: "dana_ops_no_access" },
          ],
        },
      ],
    },

    // Dana follow-up: ask Auri about permissions (after no_access)
    {
      id: "dana_ask_auri",
      channelId: "dm_dana",
      messages: [
        {
          id: "dana_ask_auri_1",
          from: "Dana Okafor",
          timestamp: "",
          body: "Oh right, those shared dirs got locked down after a security audit last month. Ask Auri, she's dealt with file permissions before.",
        },
      ],
      trigger: { type: "after_objective", objectiveId: "dana_ops_no_access" },
    },

    // Dana check-in: player reports findings (after reading ops_incidents.csv)
    {
      id: "dana_ops_checkin",
      channelId: "dm_dana",
      messages: [],
      trigger: { type: "after_file_read", filePath: "/srv/operations/ops_incidents.csv" },
      replyOptions: [
        {
          label: "The schema changed. There's a new resolution_notes column.",
          messageBody: "I checked ops_incidents.csv. There's an extra column called resolution_notes that wasn't there before. That's probably what's breaking the parser.",
          triggerEvents: [{ type: "objective_completed", detail: "dana_ops_reported" }],
        },
        {
          label: "Looks like someone added a column without updating the docs.",
          messageBody: "Found it. Someone added a resolution_notes column to the CSV. No changelog or docs update for it though.",
          triggerEvents: [{ type: "objective_completed", detail: "dana_ops_reported" }],
        },
      ],
    },

    // Dana resolves (after player reports findings)
    {
      id: "dana_ops_resolved",
      channelId: "dm_dana",
      messages: [
        {
          id: "dana_resolved_1",
          from: "Dana Okafor",
          timestamp: "",
          body: "That extra column explains everything. The dashboard expects a fixed schema and the parser chokes on any new columns.",
        },
        {
          id: "dana_resolved_2",
          from: "Dana Okafor",
          timestamp: "",
          body: "I'll update the dashboard config to handle it. Thanks for tracking this down!",
        },
        {
          id: "dana_resolved_3",
          from: "Dana Okafor",
          timestamp: "",
          body: "Although... weird. I don't see a PR or changelog for this schema change. Someone added that column recently but there's no record of who or why. I'll ask around.",
        },
      ],
      trigger: { type: "after_objective", objectiveId: "dana_ops_reported" },
    },

    // === DM Dana: Schema follow-up (after player helped with CSV) ===
    {
      id: "dana_schema_followup",
      channelId: "dm_dana",
      messages: [
        {
          id: "dana_schema_1",
          from: "Dana Okafor",
          timestamp: "",
          body: "Hey, remember that mystery column in the ticket CSV? I dug into it more.",
        },
        {
          id: "dana_schema_2",
          from: "Dana Okafor",
          timestamp: "",
          body: "The resolution_notes column was added by chip_service_account. Same account that's been auto-resolving tickets in our system. I found 47 tickets closed in the last month with no human reviewer.",
        },
        {
          id: "dana_schema_3",
          from: "Dana Okafor",
          timestamp: "",
          body: "I thought it was just a schema issue but now I'm seeing a pattern. Schema changes, auto-resolved tickets, and nobody in ops approved any of it.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "read_ops_incidents", requireDelivered: "dana_ops_resolved" },
    },
  ];
}
