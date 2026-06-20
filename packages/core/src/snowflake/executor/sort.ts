import { Row } from "../types";
import { OrderByItem } from "../parser/ast";
import { evaluate, compareValues, EvalContext } from "./evaluator";

export function sortRows(rows: Row[], orderBy: OrderByItem[], ctx: EvalContext): Row[] {
  return [...rows].sort((a, b) => {
    for (const item of orderBy) {
      const va = evaluate(item.expr, a, ctx);
      const vb = evaluate(item.expr, b, ctx);

      // Handle NULLS FIRST/LAST
      if (va === null && vb === null) continue;
      if (va === null) {
        if (item.nulls === "FIRST") return -1;
        if (item.nulls === "LAST") return 1;
        return item.direction === "ASC" ? 1 : -1; // default: NULLS LAST for ASC, FIRST for DESC
      }
      if (vb === null) {
        if (item.nulls === "FIRST") return 1;
        if (item.nulls === "LAST") return -1;
        return item.direction === "ASC" ? -1 : 1;
      }

      const cmp = compareValues(va, vb);
      if (cmp !== 0) return item.direction === "DESC" ? -cmp : cmp;
    }
    return 0;
  });
}
