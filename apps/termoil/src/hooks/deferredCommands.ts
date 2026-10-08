import type { DeferredCommand } from "@tt/core/commands/types";

/** Machine-owned timers survive shell changes but never a game reload/unmount. */
export function createDeferredCommands<Machine extends string>() {
  const timers = new Map<Machine, Map<string, ReturnType<typeof setTimeout>>>();

  function cancel(machine: Machine, command: string) {
    const pending = timers.get(machine);
    const timer = pending?.get(command);
    if (timer !== undefined) clearTimeout(timer);
    pending?.delete(command);
    if (pending?.size === 0) timers.delete(machine);
  }

  function clear(machine?: Machine) {
    for (const [id, pending] of timers) {
      if (machine !== undefined && id !== machine) continue;
      for (const command of pending.keys()) cancel(id, command);
    }
  }

  return {
    pending: (machine: Machine) => [...(timers.get(machine)?.keys() ?? [])],
    cancel,
    clear,
    apply(machine: Machine, action: DeferredCommand, run: (action: Extract<DeferredCommand, { type: "schedule" }>) => void) {
      cancel(machine, action.command);
      if (action.type === "cancel") return;
      const pending = timers.get(machine) ?? new Map();
      timers.set(machine, pending);
      pending.set(action.command, setTimeout(() => {
        cancel(machine, action.command);
        run(action);
      }, action.delayMs));
    },
  };
}
