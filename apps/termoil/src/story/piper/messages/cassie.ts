import { PiperDelivery } from "../../../engine/piper/types";

export function getCassieDeliveries(_username: string): PiperDelivery[] {
  return [
    // === DM Cassie: Product spec concern (after chip_intro email) ===
    {
      id: "cassie_dm_product",
      channelId: "dm_cassie",
      messages: [
        {
          id: "cassie_dm_1",
          from: "Cassie Moreau",
          timestamp: "",
          body: `Hey! Cassie here, Product Design. Welcome!`,
        },
        {
          id: "cassie_dm_2",
          from: "Cassie Moreau",
          timestamp: "",
          body: "I designed most of the conversational flows for Chip like the tone, and response structure.",
        },
        {
          id: "cassie_dm_3",
          from: "Cassie Moreau",
          timestamp: "",
          body: "Lately I've noticed responses that don't match the flows I designed. Probably just plugins or prompt changes Edward pushed without updating the spec, but as the designer it bugs me when the product drifts from the design.",
        },
        {
          id: "cassie_dm_4",
          from: "Cassie Moreau",
          timestamp: "",
          body: "Anyway, just thought I'd flag it since you're the AI expert. Let me know if you notice anything off!",
        },
      ],
      trigger: { type: "after_story_flag", flag: "chip_unlocked" },
    },
  ];
}
