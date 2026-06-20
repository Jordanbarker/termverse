import { Value } from "../../types";
import { EvalContext } from "../evaluator";
import { stringFunctions } from "./string";
import { numericFunctions } from "./numeric";
import { dateFunctions } from "./date";
import { conversionFunctions } from "./conversion";
import { conditionalFunctions } from "./conditional";
import { systemFunctions } from "./system";
import { semiStructuredFunctions } from "./semi_structured";

export type ScalarFn = (args: Value[], ctx: EvalContext) => Value;

const registry = new Map<string, ScalarFn>();

function registerAll(fns: Record<string, ScalarFn>) {
  for (const [name, fn] of Object.entries(fns)) {
    registry.set(name.toUpperCase(), fn);
  }
}

// Register all function categories
registerAll(stringFunctions);
registerAll(numericFunctions);
registerAll(dateFunctions);
registerAll(conversionFunctions);
registerAll(conditionalFunctions);
registerAll(systemFunctions);
registerAll(semiStructuredFunctions);

export function callFunction(name: string, args: Value[], ctx: EvalContext): Value {
  const fn = registry.get(name.toUpperCase());
  if (!fn) throw new Error(`Unknown function: ${name}`);
  return fn(args, ctx);
}

export function hasFunction(name: string): boolean {
  return registry.has(name.toUpperCase());
}
