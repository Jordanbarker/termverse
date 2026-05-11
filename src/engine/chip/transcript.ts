import { ChipExchange } from "./types";
import { pad2 } from "../../lib/format";
import { usernameFromHomeDir } from "../mail/mailUtils";

export function transcriptFilename(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}.log`;
}

function formatStartedAt(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function formatTimeOfDay(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function sessionId(d: Date): string {
  return `sess_${transcriptFilename(d).replace(/\.log$/, "")}`;
}

export function renderTranscript(
  transcript: ChipExchange[],
  start: Date,
  homeDir: string
): string {
  const username = usernameFromHomeDir(homeDir);
  const lines: string[] = [];
  lines.push(`session: ${sessionId(start)}`);
  lines.push(`user: ${username}`);
  lines.push(`started: ${formatStartedAt(start)}`);
  lines.push("");

  for (const ex of transcript) {
    const time = formatTimeOfDay(ex.timestamp);
    const speaker = ex.role === "user" ? username : "chip";
    const prefix = `[${time}] ${speaker}: `;
    const textLines = ex.text.split("\n");
    lines.push(`${prefix}${textLines[0] ?? ""}`);
    for (let i = 1; i < textLines.length; i++) {
      lines.push(`  ${textLines[i]}`);
    }
    if (ex.role === "chip") lines.push("");
  }

  return lines.join("\n");
}
