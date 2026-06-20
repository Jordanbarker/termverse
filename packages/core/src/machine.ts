/**
 * Machine/host identifier (core, story-agnostic).
 *
 * The core engine treats a machine id opaquely as a string. Each game narrows
 * it to its own set of machines (termoil's `ComputerId` union in
 * state/types.ts is assignable to this). Keeping it a bare string here is what
 * lets the engine live in a shared package without importing any one game's
 * machine list.
 */
export type MachineId = string;
