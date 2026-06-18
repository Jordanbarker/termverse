import { CommandHandler } from "../types";
import { register } from "../registry";
import { HELP_TEXTS } from "./helpTexts";
import { GameTime } from "../clock";

const MONTH_NUM: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Fallback when no game clock is injected: the real wall clock. */
function realGameTime(): GameTime {
  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, "0");
  return {
    hour: p(d.getHours()),
    minute: p(d.getMinutes()),
    second: p(d.getSeconds()),
    dow: DOW_NAMES[d.getDay()],
    month: MONTH_NAMES[d.getMonth()],
    day: d.getDate().toString(),
    year: d.getFullYear().toString(),
  };
}

const date: CommandHandler = (args, _flags, ctx) => {
  const time = ctx.clock?.time() ?? realGameTime();

  if (args.length > 0 && args[0].startsWith("+")) {
    const formatCodes: Record<string, string> = {
      "%Y": time.year,
      "%m": MONTH_NUM[time.month] ?? "01",
      "%d": time.day.padStart(2, "0"),
      "%H": time.hour,
      "%M": time.minute,
      "%S": time.second,
    };
    let fmt = args[0].slice(1);
    for (const [code, val] of Object.entries(formatCodes)) {
      fmt = fmt.split(code).join(val);
    }
    return { output: fmt };
  }

  return {
    output: `${time.dow} ${time.month} ${time.day.padStart(2, "0")} ${time.hour}:${time.minute}:${time.second} UTC ${time.year}`,
  };
};

register("date", date, "Display current date and time", HELP_TEXTS.date);
