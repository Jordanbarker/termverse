import { PiperDelivery } from "../../../engine/piper/types";

export function getEdwardDeliveries(_username: string): PiperDelivery[] {
  return [
    // === DM Edward: Chen's security copied over (after reading welcome email) ===
    {
      id: "edward_security_grant",
      channelId: "dm_edward",
      messages: [
        {
          id: "edward_sec_1",
          from: "Edward Torres",
          timestamp: "",
          body: "Oh, also: I had Oscar just copy Chen's security over to you so you're not blocked on day one. Easier than re-provisioning from scratch.",
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
          body: "Forgot to mention: make sure you're using `chip`. Just type it in the terminal. Honestly the fastest way to get unstuck around here. Beats waiting on me.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "read_team_info" },
      replyOptions: [
        {
          label: "Sounds good, I'll give it a try!",
          messageBody: "Sounds good, I'll give it a try!",
          hiddenWhen: { flag: "chip_error_seen" },
          triggerEvents: [{ type: "objective_completed", detail: "replied_edward_chip_intro" }],
        },
        {
          label: "I just tried running chip but I'm getting 'CHIP_API_KEY not set'?",
          messageBody: "I just tried running chip but I'm getting 'CHIP_API_KEY not set'?",
          visibleWhen: { flag: "chip_error_seen" },
          triggerEvents: [
            { type: "objective_completed", detail: "replied_edward_chip_intro" },
            { type: "objective_completed", detail: "told_edward_chip_error" },
          ],
        },
      ],
    },

    // === DM Edward: Error report prompt (after replying to intro) ===
    // No messages — reply option appears below the conversation,
    // gated behind chip_error_seen (player must try chip first).
    // Hidden once told_edward_chip_error is set, so the direct path
    // (player already tried chip before reading team-info) doesn't
    // surface the same reply option twice.
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
          hiddenWhen: { flag: "told_edward_chip_error" },
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
          body: "Ah, IT must not have provisioned your key yet, they've been backed up. No worries, I'll just give it to you directly.",
        },
        {
          id: "edward_dm_fix_2",
          from: "Edward Torres",
          timestamp: "",
          body: "Open `~/.zshrc` in nano and add this line at the bottom:\n\n    export CHIP_API_KEY=nxa_live_7f3k9m2x\n\nThen run `source ~/.zshrc` to load it. You can double-check it's set with printenv",
        },
      ],
      trigger: [
        { type: "after_piper_reply", deliveryId: "edward_chip_error" },
        { type: "after_objective", objectiveId: "told_edward_chip_error" },
      ],
    },

    // === DM Edward: Build a plugin (after pipeline fix, sets up Chapter 3 plugin quest) ===
    {
      id: "edward_plugin_request",
      channelId: "dm_edward",
      messages: [
        {
          id: "edward_plugin_1",
          from: "Edward Torres",
          timestamp: "",
          body: "Quick one: investor demo's coming up and the deck is light on product surface. Throw together a new Chip plugin. Dealer's choice, whatever you think we're missing. Surprise me.",
        },
        {
          id: "edward_plugin_2",
          from: "Edward Torres",
          timestamp: "",
          body: "Platform workspace, not your laptop: `coder ssh chip`. Scaffold it next to the others under `/opt/chip/plugins/<name>/`: `plugin.json`, `SKILL.md`, then register it. Sarah or Erik can point you at examples if you need them.",
        },
        {
          id: "edward_plugin_3",
          from: "Edward Torres",
          timestamp: "",
          body: "Don't overthink it. Ship something. We can polish later. The board just needs to see surface area.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "reported_fix_to_auri" },
      replyOptions: [
        {
          label: "On it. I'll spin one up.",
          messageBody: "On it. I'll spin one up.",
          triggerEvents: [{ type: "objective_completed", detail: "accepted_edward_plugin_request" }],
        },
      ],
    },

    // === DM Edward: Plugin shipped (player reports back) ===
    // The reply is gated behind wrote_plugin_skill so it only appears once the
    // player actually authored a plugin — no false-positive "I'm done" before
    // the work is real.
    {
      id: "edward_plugin_report",
      channelId: "dm_edward",
      messages: [],
      trigger: { type: "after_piper_reply", deliveryId: "edward_plugin_request" },
      replyOptions: [
        {
          label: "Plugin's up. Scaffolded under /opt/chip/plugins/, registered.",
          messageBody: "Plugin's up. Wrote plugin.json + SKILL.md, added it to the registry.",
          visibleWhen: { flag: "wrote_plugin_skill" },
          triggerEvents: [
            { type: "objective_completed", detail: "reported_plugin_to_edward" },
          ],
        },
      ],
    },

    // === DM Edward: Acknowledgment after plugin report ===
    {
      id: "edward_plugin_ack",
      channelId: "dm_edward",
      messages: [
        {
          id: "edward_plugin_ack_1",
          from: "Edward Torres",
          timestamp: "",
          body: "Nice. I'll have Tom slot it into the demo deck. Good turnaround.",
        },
      ],
      trigger: { type: "after_piper_reply", deliveryId: "edward_plugin_report" },
    },
  ];
}
