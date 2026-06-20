import { PiperDelivery } from "../../../engine/piper/types";

export function getSarahDeliveries(_username: string): PiperDelivery[] {
  return [
    // === DM Sarah: Mystery drop (after finding backup files) ===
    {
      id: "sarah_dm_mystery",
      channelId: "dm_sarah",
      messages: [
        {
          id: "sarah_dm_1",
          from: "Sarah Knight",
          timestamp: "",
          body: "oscar flagged some stuff with me about chip_service_account. looked into it and he's right. there are api calls that don't line up with any feature work I know about.",
        },
        {
          id: "sarah_dm_2",
          from: "Sarah Knight",
          timestamp: "",
          body: "jin mentioned it to me once, almost offhand. got told it was background processing. maybe it is. just figured you should know since you're the ai person now.",
        },
        {
          id: "sarah_dm_3",
          from: "Sarah Knight",
          timestamp: "",
          body: "lmk if you find anything interesting",
        },
      ],
      trigger: { type: "after_story_flag", flag: "oscar_access_completed" },
    },
  ];
}
