import { PiperDelivery } from "../../../engine/piper/types";

export function getAmbientDeliveries(_username: string): PiperDelivery[] {
  return [
    // === #general — Oat milk fridge debate ===
    {
      id: "general_kitchen_debate",
      channelId: "general",
      messages: [
        {
          id: "kitchen_leah_1",
          from: "Leah Matsuda",
          timestamp: "",
          body: "ok who keeps buying the vanilla oat milk. the fridge is literally 80% oat milk right now",
        },
        {
          id: "kitchen_tom_1",
          from: "Tom Chen",
          timestamp: "",
          body: "Guilty. In my defense, it was on sale.",
        },
        {
          id: "kitchen_maya_1",
          from: "Maya Johnson",
          timestamp: "",
          body: "I don't even drink oat milk and I've started using it because there's nothing else lol",
        },
        {
          id: "kitchen_marcus_1",
          from: "Marcus Reyes",
          timestamp: "",
          body: "Adding 'fridge audit' to the ops backlog.",
        },
      ],
      trigger: {
        type: "after_story_flag",
        flag: "read_onboarding",
        requireDelivered: "general_tom_wins",
      },
    },

    // === #general — Standup cancelled ===
    {
      id: "general_standup_cancelled",
      channelId: "general",
      messages: [
        {
          id: "standup_dana_1",
          from: "Dana Okafor",
          timestamp: "",
          body: "Heads up, cancelling standup today. I'm in back-to-back incident reviews and half the team is heads-down on deploys.",
        },
        {
          id: "standup_soham_1",
          from: "Soham Parekh",
          timestamp: "",
          body: "Devastating. I had a really compelling update about my sprint progress.",
        },
        {
          id: "standup_sarah_1",
          from: "Sarah Knight",
          timestamp: "",
          body: "lol",
        },
      ],
      trigger: {
        type: "after_story_flag",
        flag: "read_team_info",
        requireDelivered: "general_kitchen_debate",
      },
    },

    // === #general — Client demo panic ===
    {
      id: "general_client_demo_panic",
      channelId: "general",
      messages: [
        {
          id: "demo_tom_1",
          from: "Tom Chen",
          timestamp: "",
          body: "Quick heads up, I told Willow Health we'd do a live demo Friday. They're excited about the new dashboard features!",
        },
        {
          id: "demo_edward_1",
          from: "Edward Torres",
          timestamp: "",
          body: "Which dashboard features specifically?",
        },
        {
          id: "demo_erik_1",
          from: "Erik Lindstrom",
          timestamp: "",
          body: "The ones that are in staging or the ones that are still in Figma?",
        },
        {
          id: "demo_cassie_1",
          from: "Cassie Moreau",
          timestamp: "",
          body: "I have mockups for three versions. Tom, which one did you show them?",
        },
        {
          id: "demo_tom_2",
          from: "Tom Chen",
          timestamp: "",
          body: "The... good one? Let's sync on this. I'll send over an meeting",
        },
      ],
      trigger: {
        type: "after_story_flag",
        flag: "oscar_access_completed",
        requireDelivered: "general_standup_cancelled",
      },
    },

    // === #general — Day 2 all-hands recap ===
    {
      id: "general_all_hands_recap",
      channelId: "general",
      messages: [
        {
          id: "allhands_edward_1",
          from: "Edward Torres",
          timestamp: "",
          body: "For those who missed the all-hands: Q1 is tracking ahead of plan. Some big announcements coming in the next few weeks. Stay tuned.",
        },
        {
          id: "allhands_marcus_1",
          from: "Marcus Reyes",
          timestamp: "",
          body: "Pipeline is healthy. Two enterprise renewals closed, one new logo in negotiation. Details in the thread if anyone wants them.",
        },
        {
          id: "allhands_tom_1",
          from: "Tom Chen",
          timestamp: "",
          body: "Great energy in that meeting. This team is building something special \u{1F680}",
        },
      ],
      trigger: {
        type: "after_story_flag",
        flag: "ssh_day2",
        requireDelivered: "general_client_demo_panic",
      },
    },

    // === #engineering — Flaky overnight deploy ===
    {
      id: "eng_deploy_drama",
      channelId: "engineering",
      messages: [
        {
          id: "deploy_oscar_1",
          from: "Oscar Diaz",
          timestamp: "",
          body: "Heads up, the 2am deploy rolled back automatically. Third time this month. I'm looking at it but if anyone touched the ingestion service config yesterday, speak now.",
        },
        {
          id: "deploy_erik_1",
          from: "Erik Lindstrom",
          timestamp: "",
          body: "Not me. My last PR was frontend-only.",
        },
        {
          id: "deploy_sarah_1",
          from: "Sarah Knight",
          timestamp: "",
          body: "might be the auth middleware changes catching up. i'll check the error logs after standup",
        },
      ],
      trigger: {
        type: "after_story_flag",
        flag: "read_onboarding",
        requireDelivered: "eng_sarah_welcome",
      },
    },

    // === #engineering — Morning check-ins ===
    {
      id: "eng_morning_checkins",
      channelId: "engineering",
      messages: [
        {
          id: "checkin_auri_1",
          from: "Auri Park",
          timestamp: "",
          body: "Morning! Coffee first, then I'm tackling the staging model backlog.",
        },
        {
          id: "checkin_oscar_1",
          from: "Oscar Diaz",
          timestamp: "",
          body: "Dentist ran late. Online now. Anything on fire?",
        },
        {
          id: "checkin_erik_1",
          from: "Erik Lindstrom",
          timestamp: "",
          body: "Nothing on fire. The deploy from last night recovered. Quiet morning so far.",
        },
      ],
      trigger: {
        type: "after_story_flag",
        flag: "read_team_info",
        requireDelivered: "eng_deploy_drama",
      },
    },

    // === #engineering — On-call handoff ===
    {
      id: "eng_oncall_handoff",
      channelId: "engineering",
      messages: [
        {
          id: "oncall_sarah_1",
          from: "Sarah Knight",
          timestamp: "",
          body: "my oncall rotation ends today. soham you're next up",
        },
        {
          id: "oncall_soham_1",
          from: "Soham Parekh",
          timestamp: "",
          body: "This week is really tough for me. I'm deep in the integrations layer and I don't think I can context-switch fast enough if something comes in. Can someone swap?",
        },
        {
          id: "oncall_sarah_2",
          from: "Sarah Knight",
          timestamp: "",
          body: "auri?",
        },
        {
          id: "oncall_auri_1",
          from: "Auri Park",
          timestamp: "",
          body: "...ah man",
        },
        {
          id: "oncall_auri_2",
          from: "Auri Park",
          timestamp: "",
          body: "Yeah I can do it",
        },
      ],
      trigger: {
        type: "after_story_flag",
        flag: "ssh_day2",
        requireDelivered: "eng_morning_checkins",
      },
    },

    // === #engineering — End-of-day signoffs ===
    {
      id: "eng_eod_signoffs",
      channelId: "engineering",
      messages: [
        {
          id: "eod_sarah_1",
          from: "Sarah Knight",
          timestamp: "",
          body: "calling it. auth middleware is 90% unfucked. finishing tomorrow",
        },
        {
          id: "eod_auri_1",
          from: "Auri Park",
          timestamp: "",
          body: "Wrapping up too. Finally caught up on the staging model backlog. Night everyone!",
        },
        {
          id: "eod_oscar_1",
          from: "Oscar Diaz",
          timestamp: "",
          body: "Deploy monitoring looks stable. If anything pages overnight I'll deal with it. Sleep well, team.",
        },
      ],
      trigger: {
        type: "after_story_flag",
        flag: "read_end_of_day",
        requireDelivered: "eng_code_review_debate",
      },
    },
  ];
}
