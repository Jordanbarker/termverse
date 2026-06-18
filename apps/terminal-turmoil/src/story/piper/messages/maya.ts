import { PiperDelivery } from "../../../engine/piper/types";
import { PLAYER } from "../../player";

export function getMayaDeliveries(_username: string): PiperDelivery[] {
  return [
    // === DM Maya: Welcome DM (after reading it_provisioned email) ===
    {
      id: "maya_dm_welcome",
      channelId: "dm_maya",
      messages: [
        {
          id: "maya_dm_1",
          from: "Maya Johnson",
          timestamp: "",
          body: `Hey ${PLAYER.displayName}! Maya here. Just wanted to reach out directly. I know the onboarding checklist is a lot, but seriously don't stress about it.`,
        },
        {
          id: "maya_dm_2",
          from: "Maya Johnson",
          timestamp: "",
          body: "I paired you with Auri Park as your onboarding buddy. She's great! She'll reach out to help you get oriented with the data systems.",
        },
        {
          id: "maya_dm_3",
          from: "Maya Johnson",
          timestamp: "",
          body: "I'm here if you need anything. And I mean anything: questions about the team, the company, where to find things, or just want to vent about first-day overwhelm. My door is always open!",
        },
      ],
      trigger: { type: "after_email_read", emailId: "it_provisioned" },
    },

    // === DM Maya: Handoff check-in (after reading chen handoff notes) ===
    {
      id: "maya_dm_handoff",
      channelId: "dm_maya",
      messages: [
        {
          id: "maya_handoff_1",
          from: "Maya Johnson",
          timestamp: "",
          body: "Hey, how are the handoff materials? I know it's a lot to absorb when you're stepping into someone else's work.",
        },
        {
          id: "maya_handoff_2",
          from: "Maya Johnson",
          timestamp: "",
          body: "Jin was really good at his job. I just wish we'd had more time for a proper transition. It all happened kind of fast.",
        },
      ],
      trigger: { type: "after_file_read", filePath: "/srv/engineering/chen-handoff/notes.txt" },
      replyOptions: [
        {
          label: "What happened with Jin?",
          messageBody: "The handoff docs are helpful but they feel kind of rushed. What happened? Did he leave suddenly?",
          triggerEvents: [
            { type: "objective_completed", detail: "piper_reply:maya_asked_about_jin" },
          ],
        },
        {
          label: "It's a lot but I'm managing. Thanks!",
          messageBody: "It's a lot to take in but I'm getting there. Thanks for checking in!",
        },
      ],
    },

    // === DM Maya: Reply about Jin (after player asks) ===
    {
      id: "maya_dm_jin_reply",
      channelId: "dm_maya",
      messages: [
        {
          id: "maya_jin_1",
          from: "Maya Johnson",
          timestamp: "",
          body: "I probably shouldn't say too much. He wasn't really the type to make a fuss about things. Kept his head down, did his work. Just... if anything in the handoff feels incomplete, it's not because he didn't care. He cared a lot.",
        },
      ],
      trigger: { type: "after_piper_reply", deliveryId: "maya_asked_about_jin" },
    },

    // === DM Maya: Safe harbor check-in (after pipeline_tools_accepted) ===
    {
      id: "maya_dm_checkin",
      channelId: "dm_maya",
      messages: [
        {
          id: "maya_checkin_1",
          from: "Maya Johnson",
          timestamp: "",
          body: "Hey, just wanted to see how you're doing. First days can be a lot, especially jumping into someone else's work. No agenda, just checking in.",
        },
      ],
      trigger: { type: "after_objective", objectiveId: "pipeline_tools_accepted" },
      replyOptions: [
        {
          label: "It's been a lot honestly. But good.",
          messageBody: "It's been a lot honestly. Everyone's been really nice though, and the work is interesting. Just a lot of context to absorb.",
        },
        {
          label: "All good! Keeping busy.",
          messageBody: "All good! Lots to learn but I'm enjoying it. Thanks for checking in.",
        },
      ],
    },

    // === DM Maya: Response to checkin reply ===
    {
      id: "maya_dm_checkin_reply",
      channelId: "dm_maya",
      messages: [
        {
          id: "maya_checkin_reply_1",
          from: "Maya Johnson",
          timestamp: "",
          body: "Glad to hear it. You're doing great. Seriously. And you know where to find me if you ever need anything.",
        },
      ],
      trigger: { type: "after_piper_reply", deliveryId: "maya_dm_checkin" },
    },
  ];
}
