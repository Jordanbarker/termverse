import { CommandHandler } from "@tt/core/commands/types";
import { register } from "@tt/core/commands/registry";

const newgame: CommandHandler = () => {
  return { output: "", gameAction: { type: "newGame" } };
};

register("newgame", newgame, "Restart the game from scratch");
