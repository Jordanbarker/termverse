import { register } from "../registry";

register(
  "piper",
  (_args, _flags, ctx) => {
    if (ctx.activeComputer === "erik-pc") {
      return {
        output:
          "piper: cannot unlock credential store (no D-Bus session available)\n" +
          "hint: piper stores OAuth tokens via libsecret/gnome-keyring,\n" +
          "      which requires an active desktop session. run piper from a\n" +
          "      graphical login, not over SSH.",
      };
    }
    return {
      output: "",
      piperSession: {
        storyFlags: ctx.storyFlags ?? {},
        deliveredPiperIds: [],  // Will be filled by the caller
        computerId: ctx.activeComputer,
      },
    };
  },
  "Open Piper team messaging"
);
