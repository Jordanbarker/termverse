import { PiperDelivery } from "../../../engine/piper/types";

export function getAnonDeliveries(_username: string): PiperDelivery[] {
  return [
    {
      id: "anon_usb_tip",
      channelId: "dm_anon",
      computer: "home",
      messages: [
        {
          id: "anon_usb_1",
          from: "Sabu",
          timestamp: "",
          body: "Left a drive for you.",
        },
        {
          id: "anon_usb_2",
          from: "Sabu",
          timestamp: "",
          body: "Plug it in when you're alone.",
        },
        {
          id: "anon_usb_3",
          from: "Sabu",
          timestamp: "",
          body: "Don't tell anyone we talked.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "day1_shutdown" },
      replyOptions: [
        {
          label: "Plug it in.",
          messageBody: "Okay, plugging it in.",
          triggerEvents: [{ type: "objective_completed", detail: "accepted_usb_drive" }],
        },
        {
          label: "Not interested.",
          messageBody: "I'm going to pass.",
          triggerEvents: [{ type: "objective_completed", detail: "declined_usb_tip" }],
        },
      ],
    },
  ];
}
