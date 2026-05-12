import { PiperDelivery } from "../../../engine/piper/types";

export function getMarcusDeliveries(_username: string): PiperDelivery[] {
  return [
    // === Chapter 3 endgame: Marcus opens the accusation DM ===
    // Fires once the plugin quest closes. Marcus is the COO — he authored
    // the broad Chip access policies and has visibility into operational
    // metrics, but no direct authority over Chip. Oscar runs infra/security
    // and surfaced the chip_service_account activity; Marcus is the one
    // walking into the board meeting tonight.
    {
      id: "marcus_endgame_opening",
      channelId: "dm_marcus",
      messages: [
        {
          id: "marcus_endgame_1",
          from: "Marcus Reyes",
          timestamp: "",
          body: "Hey. Got a minute?",
        },
        {
          id: "marcus_endgame_2",
          from: "Marcus Reyes",
          timestamp: "",
          body: "Oscar mentioned pulling access traces on chip_service_account. Someone is abusing Chip's security access.",
        },
        {
          id: "marcus_endgame_3",
          from: "Marcus Reyes",
          timestamp: "",
          body: "Chip's access was set wide for operational speed, but we are going to need to tighten it up going forward.",
        },
        {
          id: "marcus_endgame_4",
          from: "Marcus Reyes",
          timestamp: "",
          body: "Board meeting is tonight. Jessica wants a name before we sit down. You've been closer to this than anyone — before I walk into that room, I want your read. Who's been driving this?",
        },
      ],
      trigger: { type: "after_story_flag", flag: "reported_plugin_to_edward" },
      replyOptions: [
        {
          label: "Edward. He built the access model and looks the other way.",
          messageBody: "Edward. He owns the access model and every time someone raises Chip concerns he waves them off. He's not running the queries himself, but he's the reason nobody's stopped it.",
          triggerEvents: [
            { type: "objective_completed", detail: "accused_edward" },
            { type: "objective_completed", detail: "chapter_3_done" },
          ],
        },
        {
          label: "Sarah. She flagged the anomalies — maybe she knows more.",
          messageBody: "Sarah. She raised the API anomalies and got dismissed. That could be a tell — she's the one who knows where to look because she's the one who knows where to hide it.",
          triggerEvents: [
            { type: "objective_completed", detail: "accused_sarah" },
            { type: "objective_completed", detail: "chapter_3_done" },
          ],
        },
        {
          label: "Erik. He has been using Chip to make polymarket bets and ssh into other systems.",
          messageBody: "Erik. He has been using Chip to make polymarket bets and ssh into other systems.",
          triggerEvents: [
            { type: "objective_completed", detail: "accused_erik" },
            { type: "objective_completed", detail: "chapter_3_done" },
          ],
          visibleWhen: { flag: "pivoted_to_erik_pc" },
        },
        {
          label: "Nobody. Not enough information to identify a person.",
          messageBody: "I don't want to throw anyone under the bus without enough evidence. Nobody stands out as the culprit. The problem is the access model, not a person.",
          triggerEvents: [
            { type: "objective_completed", detail: "accused_nobody" },
            { type: "objective_completed", detail: "chapter_3_done" },
          ],
        },
      ],
    },

    // === Marcus's reaction: accused Edward ===
    {
      id: "marcus_reaction_edward",
      channelId: "dm_marcus",
      messages: [
        {
          id: "marcus_react_edward_1",
          from: "Marcus Reyes",
          timestamp: "",
          body: "Edward.",
        },
        {
          id: "marcus_react_edward_2",
          from: "Marcus Reyes",
          timestamp: "",
          body: "That's the one I was hoping you wouldn't say. He's a co-founder. The board isn't going to swallow that easily.",
        },
        {
          id: "marcus_react_edward_3",
          from: "Marcus Reyes",
          timestamp: "",
          body: "I'll bring it up as a question about who has been signing off on Chip's directives. We'll see where he lands.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "accused_edward" },
    },

    // === Marcus's reaction: accused Sarah ===
    {
      id: "marcus_reaction_sarah",
      channelId: "dm_marcus",
      messages: [
        {
          id: "marcus_react_sarah_1",
          from: "Marcus Reyes",
          timestamp: "",
          body: "Sarah.",
        },
        {
          id: "marcus_react_sarah_2",
          from: "Marcus Reyes",
          timestamp: "",
          body: "Interesting angle. She's the one who raised it — but you're right that the people closest to the alarm bell are sometimes the ones holding the rope.",
        },
        {
          id: "marcus_react_sarah_3",
          from: "Marcus Reyes",
          timestamp: "",
          body: "I'll have Oscar look into her further before the meeting. If you see anything else, ping me.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "accused_sarah" },
    },

    // === Marcus's reaction: accused Erik ===
    {
      id: "marcus_reaction_erik",
      channelId: "dm_marcus",
      messages: [
        {
          id: "marcus_react_erik_1",
          from: "Marcus Reyes",
          timestamp: "",
          body: "That is a damning conviction.",
        },
        {
          id: "marcus_react_erik_2",
          from: "Marcus Reyes",
          timestamp: "",
          body: "I'll have Oscar dig in further. He has mentioned something about Erik's session showing up in places his role shouldn't reach. I told him he was paranoid. Maybe I owe him a coffee.",
        },
        {
          id: "marcus_react_erik_3",
          from: "Marcus Reyes",
          timestamp: "",
          body: "Thank you for digging into this. You saved us a lot of trouble if you are correct.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "accused_erik" },
    },

    // === Marcus's reaction: accused Nobody (the system / plugin directives) ===
    {
      id: "marcus_reaction_nobody",
      channelId: "dm_marcus",
      messages: [
        {
          id: "marcus_react_nobody_1",
          from: "Marcus Reyes",
          timestamp: "",
          body: "Yeah. I was afraid that was the answer.",
        },
        {
          id: "marcus_react_nobody_2",
          from: "Marcus Reyes",
          timestamp: "",
          body: "We built the doors that wide. Somebody walked through them — but the door is the problem, not the foot.",
        },
        {
          id: "marcus_react_nobody_3",
          from: "Marcus Reyes",
          timestamp: "",
          body: "I'll frame it that way to the board. Process failure, not a person to fire. Won't make Edward happy. Thanks for the honest read.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "accused_nobody" },
    },
  ];
}
