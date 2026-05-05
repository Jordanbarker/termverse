import { PiperDelivery } from "../../../engine/piper/types";

export function getEdwardDeliveries(_username: string): PiperDelivery[] {
  return [
    // === DM Edward: Jin's security copied over (after reading welcome email) ===
    {
      id: "edward_security_grant",
      channelId: "dm_edward",
      messages: [
        {
          id: "edward_sec_1",
          from: "Edward Torres",
          timestamp: "",
          body: "Oh, also — I had Oscar just copy Chen's security over to you so you're not blocked on day one. Easier than re-provisioning from scratch.",
        },
        {
          id: "edward_sec_2",
          from: "Edward Torres",
          timestamp: "",
          body: "If you need anything beyond what Chen had, ping Oscar directly. Don't want any blockers.",
        },
      ],
      trigger: { type: "after_email_read", emailId: "welcome_edward" },
    },

    // === DM Edward: Chip introduction (after reading team-info.md) ===
    {
      id: "edward_chip_intro",
      channelId: "dm_edward",
      messages: [
        {
          id: "edward_dm_1",
          from: "Edward Torres",
          timestamp: "",
          body: "Hey, settling in okay? If you haven't already, definitely give Chip a try — just type `chip` in the terminal. It's honestly the fastest way to get answers about how things work around here. We built it to be the single source of truth for the whole team.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "read_team_info" },
      replyOptions: [
        {
          label: "Sounds good, I'll give it a try!",
          messageBody: "Sounds good, I'll give it a try!",
          triggerEvents: [{ type: "objective_completed", detail: "replied_edward_chip_intro" }],
        },
      ],
    },

    // === DM Edward: Error report prompt (after replying to intro) ===
    // No messages — reply option appears below the conversation,
    // gated behind chip_error_seen (player must try chip first).
    {
      id: "edward_chip_error",
      channelId: "dm_edward",
      messages: [],
      trigger: { type: "after_piper_reply", deliveryId: "edward_chip_intro" },
      replyOptions: [
        {
          label: "I just tried running chip but I'm getting 'CHIP_API_KEY not set'?",
          messageBody: "I just tried running chip but I'm getting 'CHIP_API_KEY not set'?",
          visibleWhen: { flag: "chip_error_seen" },
          triggerEvents: [{ type: "objective_completed", detail: "told_edward_chip_error" }],
        },
      ],
    },

    // === DM Edward: Fix instructions (after error report) ===
    {
      id: "edward_chip_fix",
      channelId: "dm_edward",
      messages: [
        {
          id: "edward_dm_fix_1",
          from: "Edward Torres",
          timestamp: "",
          body: "Ah, IT must not have provisioned your key yet — they've been backed up. No worries, I'll just give it to you directly.",
        },
        {
          id: "edward_dm_fix_2",
          from: "Edward Torres",
          timestamp: "",
          body: "Your Chip API key is `nxa_live_7f3k9m2x`. Open `~/.zshrc` in nano and add this line at the bottom:\n\n    export CHIP_API_KEY=nxa_live_7f3k9m2x\n\nThen run `source ~/.zshrc` to load it. You can double-check it's set with `printenv | grep CHIP`.",
        },
      ],
      trigger: { type: "after_piper_reply", deliveryId: "edward_chip_error" },
    },
  ];
}
