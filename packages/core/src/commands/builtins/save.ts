import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";

const VALID_SLOTS = ["1", "2", "3"];

const save: CommandHandler = (args) => {
  if (args.length === 0) {
    return { output: "", gameAction: { type: "listSaves" } };
  }

  const slot = args[0];
  if (!VALID_SLOTS.includes(slot)) {
    return { output: `save: invalid slot '${slot}'. Use 1, 2, or 3.` };
  }

  const slotId = `slot-${slot}`;
  return { output: "", gameAction: { type: "save", slotId } };
};

register("save", save, "Save game to a slot (save [1|2|3])");
