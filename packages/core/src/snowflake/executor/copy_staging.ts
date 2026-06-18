import { SnowflakeState } from "../state";
import * as AST from "../parser/ast";
import { QueryResult } from "../formatter/result_types";
import { SessionContext } from "../session/context";

export function executeCopyInto(stmt: AST.CopyIntoStatement, state: SnowflakeState, _ctx: SessionContext): { result: QueryResult; state: SnowflakeState } {
  // Simulated COPY INTO — in the game this would read from VirtualFS staged files
  void stmt;
  return {
    result: { type: "status", data: { message: "Copy executed with 0 files processed.", rowsAffected: 0 } },
    state,
  };
}
