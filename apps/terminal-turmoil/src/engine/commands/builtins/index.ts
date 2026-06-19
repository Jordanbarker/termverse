// App-side builtin registration. Pulls in the core builtin set (which
// self-registers into @tt/core's command registry), then registers this
// game's story-coupled builtins (machine topology, player identity,
// checkpoints) which also self-register into the same registry.
import "@tt/core/commands/builtins";
import "./save";
import "./load";
import "./newgame";
import "./hostname";
import "./shutdown";
import "./mail";
import "./cheat";
import "./ssh";
import "./coder";
