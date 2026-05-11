import { PiperChannel } from "../../engine/piper/types";

export const PIPER_CHANNELS: PiperChannel[] = [
  // Home PC channels
  {
    id: "openclam",
    name: "#OpenClam",
    type: "channel",
    computer: "home",
  },
  {
    id: "bubble_buddies",
    name: "#BubbleBuddies",
    type: "channel",
    computer: "home",
  },

  // Home PC DMs
  {
    id: "dm_alex",
    name: "Alex Rivera",
    type: "dm",
    computer: "home",
  },
  {
    id: "dm_olive",
    name: "Olive Borden",
    type: "dm",
    computer: "home",
  },
  {
    id: "dm_anon",
    name: "Sabu",
    type: "dm",
    computer: "home",
  },

  // NexaCorp channels
  {
    id: "general",
    name: "#general",
    type: "channel",
  },
  {
    id: "engineering",
    name: "#engineering",
    type: "channel",
  },
  {
    id: "dm_oscar",
    name: "Oscar Diaz",
    type: "dm",
  },
  {
    id: "dm_dana",
    name: "Dana Okafor",
    type: "dm",
  },
  {
    id: "dm_auri",
    name: "Auri Park",
    type: "dm",
  },
  {
    id: "dm_jordan",
    name: "Jordan Kessler",
    type: "dm",
  },
  {
    id: "dm_maya",
    name: "Maya Johnson",
    type: "dm",
  },
  {
    id: "dm_sarah",
    name: "Sarah Knight",
    type: "dm",
  },
  {
    id: "dm_cassie",
    name: "Cassie Moreau",
    type: "dm",
  },
  {
    id: "dm_edward",
    name: "Edward Torres",
    type: "dm",
  },
];

export type PiperChannelId = (typeof PIPER_CHANNELS)[number]['id'];
