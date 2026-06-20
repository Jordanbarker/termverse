import { PiperDelivery } from "../../../engine/piper/types";

export function getJordanDeliveries(_username: string): PiperDelivery[] {
  return [
    // === DM Jordan: Marketing data (after pipeline_tools_accepted) ===
    {
      id: "jordan_marketing_data",
      channelId: "dm_jordan",
      messages: [
        {
          id: "jordan_data_1",
          from: "Jordan Kessler",
          timestamp: "",
          body: "Hey! Jordan from Marketing. Welcome aboard!",
        },
        {
          id: "jordan_data_2",
          from: "Jordan Kessler",
          timestamp: "",
          body: "I've got a weird one. Our marketing dashboard says the chip_launch campaign had 735,000 impressions this quarter, but my spreadsheet from the ad platform only shows 245,000.",
        },
        {
          id: "jordan_data_3",
          from: "Jordan Kessler",
          timestamp: "",
          body: "Auri mentioned the campaign data lives in a Snowflake table called CAMPAIGN_METRICS. Could you pull it up in snow sql and check if the numbers look right? I'm especially curious about the chip_launch campaign. Is the total really 735K impressions, or is something off in the raw data?",
        },
        {
          id: "jordan_data_4",
          from: "Jordan Kessler",
          timestamp: "",
          body: "I'm guessing there are duplicate rows or something, but I don't have Snowflake access. Would really appreciate a second pair of eyes on this!",
        },
      ],
      trigger: { type: "after_objective", objectiveId: "pipeline_tools_accepted" },
      replyOptions: [
        {
          label: "I'll query it and let you know.",
          messageBody: "I'll pull up the data in Snowflake and see what's going on. Should be a quick check.",
        },
        {
          label: "Sure. Any tips on using snow sql?",
          messageBody: "Happy to help! I haven't used snow sql much yet though, any quick tips on connecting?",
          triggerEvents: [{ type: "objective_completed", detail: "jordan_snowsql_tips_requested" }],
        },
      ],
    },

    // === DM Jordan: Metrics follow-up (after querying campaign_metrics) ===
    {
      id: "jordan_metrics_followup",
      channelId: "dm_jordan",
      messages: [],
      trigger: { type: "after_story_flag", flag: "found_inflated_metrics" },
      replyOptions: [
        {
          label: "The numbers are tripled. 735K is 3x the real count.",
          messageBody: "Yeah, the chip_launch campaign shows 735K impressions, but the raw data only has 245K unique entries. The rest are triplicate rows.",
          triggerEvents: [{ type: "objective_completed", detail: "jordan_metrics_reported" }],
        },
        {
          label: "There are duplicate rows. Looks deliberate.",
          messageBody: "There are triplicate rows in the data. 245K real impressions inflated to 735K. It doesn't look like a pipeline bug.",
          triggerEvents: [{ type: "objective_completed", detail: "jordan_metrics_reported" }],
        },
      ],
    },

    // === DM Jordan: Metrics reaction (after player reports findings) ===
    {
      id: "jordan_metrics_reaction",
      channelId: "dm_jordan",
      messages: [
        {
          id: "jordan_reaction_1",
          from: "Jordan Kessler",
          timestamp: "",
          body: "Wait, exactly 3x? That's not a rounding error. That's triplicate rows.",
        },
        {
          id: "jordan_reaction_2",
          from: "Jordan Kessler",
          timestamp: "",
          body: "I was about to present these to the board as wins. If I'd shown inflated metrics to leadership... yeah, that would've been bad. Thanks for catching this.",
        },
        {
          id: "jordan_reaction_3",
          from: "Jordan Kessler",
          timestamp: "",
          body: "Somebody is inflating these numbers and I don't think it's accidental.",
        },
      ],
      trigger: { type: "after_objective", objectiveId: "jordan_metrics_reported" },
      replyOptions: [
        {
          label: "The duplicate rows look deliberate.",
          messageBody: "Yeah, the data has triplicate entries. It doesn't look like a pipeline bug. Someone set this up intentionally.",
          triggerEvents: [{ type: "objective_completed", detail: "jordan_metrics_confirmed" }],
        },
        {
          label: "Hold off on that presentation.",
          messageBody: "Definitely hold off on presenting those numbers. There's something wrong with how the data is getting into Snowflake.",
          triggerEvents: [{ type: "objective_completed", detail: "jordan_metrics_confirmed" }],
        },
      ],
    },

    // Jordan snow sql tips (after tips requested)
    {
      id: "jordan_snowsql_tips",
      channelId: "dm_jordan",
      messages: [
        {
          id: "jordan_tips_1",
          from: "Jordan Kessler",
          timestamp: "",
          body: "I don't really know Snowflake but Auri showed me how to pull it up once. I think you just type 'snow sql' and then paste in queries? She'd know better than me.",
        },
        {
          id: "jordan_tips_2",
          from: "Jordan Kessler",
          timestamp: "",
          body: "I just want to know why the numbers don't match. 735K vs 245K is a big gap to explain away. If there are duplicate rows or something weird in the data, that'd be good to know before I present Q1 numbers to leadership.",
        },
        {
          id: "jordan_tips_3",
          from: "Jordan Kessler",
          timestamp: "",
          body: "Thanks for looking into this!",
        },
      ],
      trigger: { type: "after_objective", objectiveId: "jordan_snowsql_tips_requested" },
    },
  ];
}
