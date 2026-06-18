import { register } from "../registry";
import { rejectUnknownFlags, skipFlagValidation } from "../flagValidation";
import { CommandResult, CommandContext } from "../types";
import { HELP_TEXTS } from "./helpTexts";
import { execute } from "@tt/core/snowflake/executor/executor";
import { formatResultSet, formatStatusMessage, formatError } from "@tt/core/snowflake/formatter/table_formatter";

register(
  "snow",
  (args: string[], flags: Record<string, boolean>, ctx: CommandContext): CommandResult => {
    // No args or --help → show top-level help
    if (args.length === 0 || (flags["help"] && args.length === 0)) {
      return { output: HELP_TEXTS.snow };
    }

    const subcommand = args[0];

    if (subcommand !== "sql") {
      return {
        output: `snow: unknown command '${subcommand}'\n\nAvailable commands:\n  sql    Execute SQL queries\n\nRun 'snow --help' for usage.`,
        exitCode: 1,
      };
    }

    // Shift args past the subcommand
    const sqlArgs = args.slice(1);

    const flagErr = rejectUnknownFlags("snow sql", flags, { short: ["q"] });
    if (flagErr) return flagErr;

    // -q requires a SQL argument
    if (flags["q"] && sqlArgs.length === 0) {
      return {
        output: `snow sql: -q requires a SQL query argument\n\nUsage: snow sql -q 'SELECT ...'`,
        exitCode: 1,
      };
    }

    // Single-query mode: snow sql -q "SELECT 1"
    if (flags["q"] && sqlArgs.length > 0 && ctx.snowflakeState && ctx.snowflakeContext) {
      const sql = sqlArgs.join(" ");
      const sfState = ctx.snowflakeState;

      const sessionCtx = {
        ...ctx.snowflakeContext,
        gameNow: ctx.clock?.now() ?? new Date(),
      };

      const start = performance.now();
      const { results, state, context: newCtx } = execute(sql, sfState, sessionCtx);
      const elapsed = (performance.now() - start) / 1000;

      // Update state
      if (state !== sfState && ctx.setSnowflakeState) {
        ctx.setSnowflakeState(state);
      }

      // Persist context changes (e.g. USE DATABASE)
      Object.assign(ctx.snowflakeContext, newCtx);

      const outputLines: string[] = [];
      for (const result of results) {
        switch (result.type) {
          case "resultset":
            outputLines.push(formatResultSet(result.data, elapsed));
            break;
          case "status":
            outputLines.push(formatStatusMessage(result.data, elapsed));
            break;
          case "error":
            outputLines.push(formatError(result.message));
            break;
        }
      }

      // Detect campaign_metrics query for story progression (mirrors SnowSqlSession)
      const triggerEvents: import("../../mail/delivery").GameEvent[] = [];
      if (/campaign_metrics/i.test(sql)) {
        triggerEvents.push({ type: "command_executed", detail: "queried_campaign_metrics" });
      }

      const hasError = results.some((r) => r.type === "error");
      return {
        output: outputLines.join("\n"),
        exitCode: hasError ? 1 : 0,
        ...(triggerEvents.length > 0 && { triggerEvents }),
      };
    }

    // Interactive mode — return session info
    return {
      output: "",
      snowSqlSession: { startInteractive: true },
    };
  },
  "Snowflake CLI — query the NexaCorp data warehouse",
  HELP_TEXTS.snow
);
// Validates flags inside the handler with a "snow sql" prefix.
skipFlagValidation("snow");
