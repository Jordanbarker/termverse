import { ChipExchange } from "./types";

const pad = (n: number) => n.toString().padStart(2, "0");

export function transcriptFilename(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.log`;
}

function formatStartedAt(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatTimeOfDay(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function sessionId(d: Date): string {
  return `sess_${transcriptFilename(d).replace(/\.log$/, "")}`;
}

function usernameFromHomeDir(homeDir: string): string {
  const parts = homeDir.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "user";
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
