import { CommandHandler } from "@tt/core/commands/types";
import { register } from "@tt/core/commands/registry";

const VALID_SLOTS = ["1", "2", "3"];

const load: CommandHandler = (args) => {
  if (args.length === 0) {
    return { output: "", gameAction: { type: "listSaves" } };
  }

  const slot = args[0];
  if (!VALID_SLOTS.includes(slot)) {
    return { output: `load: invalid slot '${slot}'. Use 1, 2, or 3.` };
  }

  return { output: "", gameAction: { type: "load", slotId: `slot-${slot}` } };
};

register("load", load, "Load game from a slot (load [1|2|3])");
