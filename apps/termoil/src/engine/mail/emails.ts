import { EmailDelivery } from "./types";
import { ComputerId, StoryFlags } from "../../state/types";
import { getHomeEmailDefinitions } from "../../story/emails/home";
import { getNexacorpEmailDefinitions } from "../../story/emails/nexacorp";

export { getNexacorpEmailDefinitions } from "../../story/emails/nexacorp";

export function getEmailDefinitions(
  username: string,
  computer: ComputerId = "nexacorp",
  storyFlags?: StoryFlags
): EmailDelivery[] {
  if (computer === "home") return getHomeEmailDefinitions(username, storyFlags);
  if (computer === "devcontainer") return [];
  return getNexacorpEmailDefinitions(username);
}
