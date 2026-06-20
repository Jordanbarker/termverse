import { PiperDelivery } from "../../../engine/piper/types";
import { PLAYER } from "../../player";

export function getOnboardingDeliveries(_username: string): PiperDelivery[] {
  return [
    // === #general — immediate welcome messages ===
    {
      id: "general_edward_welcome",
      channelId: "general",
      messages: [
        {
          id: "general_edward_1",
          from: "Edward Torres",
          timestamp: "",
          body: `Hey everyone, please welcome our newest team member, ${PLAYER.displayName}! They're joining the engineering team.`,
        },
        {
          id: "general_maya_1",
          from: "Maya Johnson",
          timestamp: "",
          body: "Welcome!! \u{1F44B}",
        },
        {
          id: "general_cassie_1",
          from: "Cassie Moreau",
          timestamp: "",
          body: "Welcome! Always great to have another perspective on the team. If you ever want to talk about the user side of what we're building, come find me.",
        },
      ],
      trigger: { type: "immediate" },
      replyOptions: [
        {
          label: "Thanks everyone! Happy to be here.",
          messageBody: "Thanks everyone! Really excited to get started.",
        },
        {
          label: "Hi! Looking forward to working with you all.",
          messageBody: "Hi! Looking forward to working with everyone. This seems like a great team.",
        },
      ],
    },

    // === #general — Tom's wins announcement (immediate, alongside welcome) ===
    {
      id: "general_tom_wins",
      channelId: "general",
      messages: [
        {
          id: "general_tom_1",
          from: "Tom Chen",
          timestamp: "",
          body: "Team! Quick win to share: AssetDoge just signed a 12-month enterprise contract. Huge vote of confidence in what we're building!",
        },
        {
          id: "general_maya_2",
          from: "Maya Johnson",
          timestamp: "",
          body: "Amazing!! Congrats to everyone who worked on this!",
        },
        {
          id: "general_marcus_1",
          from: "Marcus Reyes",
          timestamp: "",
          body: "Good news. Q1 target is still 40% above current pipeline. Let's keep pushing.",
        },
      ],
      trigger: { type: "immediate" },
    },

    // === #engineering — Sarah's welcome (after reading chip_intro email) ===
    {
      id: "eng_sarah_welcome",
      channelId: "engineering",
      messages: [
        {
          id: "eng_sarah_1",
          from: "Sarah Knight",
          timestamp: "",
          body: `Hey ${PLAYER.displayName}! Sarah here, Senior Backend Engineer. Welcome to the team!`,
        },
        {
          id: "eng_sarah_2",
          from: "Sarah Knight",
          timestamp: "",
          body: "I've been here since almost the beginning, mostly working on our API layer. Currently untangling some auth middleware that was written in a hurry six months ago. Don't ask.",
        },
        {
          id: "eng_sarah_3",
          from: "Sarah Knight",
          timestamp: "",
          body: "Happy to pair on anything if you want a second set of eyes while you're getting started. Or just grep the codebase and judge us silently. That's what I did my first week.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "chip_unlocked" },
    },

    // === #engineering — Sarah/Erik tension (after reading team-info.md) ===
    {
      id: "eng_code_review_debate",
      channelId: "engineering",
      messages: [
        {
          id: "eng_erik_1",
          from: "Erik Lindstrom",
          timestamp: "",
          body: "Just a heads up: I'm going to be more rigorous about code review standards going forward. We've been shipping things too fast without proper review and it's creating tech debt.",
        },
        {
          id: "eng_sarah_debate_1",
          from: "Sarah Knight",
          timestamp: "",
          body: "We've always done code review. If there's a specific concern, just flag it in the PR.",
        },
        {
          id: "eng_erik_2",
          from: "Erik Lindstrom",
          timestamp: "",
          body: "I'm talking about architectural review, not just 'does it work.' We should be thinking about maintainability.",
        },
        {
          id: "eng_soham_1",
          from: "Soham Parekh",
          timestamp: "",
          body: "Totally agree, I've been thinking about this a lot actually. Both perspectives have merit. Happy to help draft some guidelines when I have bandwidth.",
        },
      ],
      trigger: { type: "after_file_read", filePath: "/srv/engineering/team-info.md" },
    },
  ];
}
