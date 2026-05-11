import { CommandHandler } from "../types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { colorize, ansi } from "../../../lib/ansi";
import { pad2 } from "../../../lib/format";
import { HELP_TEXTS } from "./helpTexts";
import {
  getMailDir,
  getSentDir,
  getMailEntries,
  markAsRead,
  hasReplyInSent,
  MailEntry,
} from "../../mail/mailUtils";
import { getEmailDefinitions } from "../../mail/emails";
import { ReplyOption } from "../../mail/types";
import { PromptOption, PromptSessionInfo } from "../../prompt/types";
import { GameEvent } from "../../mail/delivery";
import { PLAYER } from "../../../state/types";

/** Derive a reply date ~8–15 minutes after the original email's date. */
function deriveReplyDate(originalDate: string): string {
  const parsed = new Date(originalDate);
  if (isNaN(parsed.getTime())) {
    // Fallback: use a fixed narrative date
    return "Tue, 24 Feb 2026 09:00:00";
  }
  const offsetMs = (8 + Math.floor(Math.random() * 8)) * 60 * 1000;
  const reply = new Date(parsed.getTime() + offsetMs);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[reply.getUTCDay()]}, ${pad2(reply.getUTCDate())} ${months[reply.getUTCMonth()]} ${reply.getUTCFullYear()} ${pad2(reply.getUTCHours())}:${pad2(reply.getUTCMinutes())}:${pad2(reply.getUTCSeconds())}`;
}

function formatInbox(entries: MailEntry[], mailDir: string, headerLabel: string): string {
  const unreadCount = entries.filter((e) => e.dir === "new").length;
  const total = entries.length;

  const lines: string[] = [
    "",
    colorize(headerLabel, ansi.bold) + ` \u2014 ${mailDir}`,
    `${total} message${total !== 1 ? "s" : ""} (${unreadCount} unread)`,
    "",
  ];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const num = i + 1;
    const isUnread = entry.dir === "new";
    const marker = isUnread ? colorize(" N", ansi.brightYellow) : "  ";
    const numStr = colorize(String(num).padStart(2), ansi.cyan);

    // Extract display name from "Name <email>" format
    const fromMatch = entry.parsed.from.match(/^([^<]+)/);
    const fromName = fromMatch ? fromMatch[1].trim() : entry.parsed.from;

    // Extract short date from "Day, DD Mon YYYY HH:MM:SS" format
    const dateMatch = entry.parsed.date.match(/^(\w+, \d+ \w+)/);
    const shortDate = dateMatch ? dateMatch[1] : entry.parsed.date;

    lines.push(
      `${marker}  ${numStr}  ${fromName.padEnd(18)}${shortDate.padEnd(16)}"${entry.parsed.subject}"`
    );
  }

  lines.push("");
  return lines.join("\n");
}

function formatMessage(entry: MailEntry): string {
  const lines = [
    "",
    colorize("From:", ansi.bold) + `    ${entry.parsed.from}`,
    colorize("To:", ansi.bold) + `      ${entry.parsed.to}`,
    colorize("Date:", ansi.bold) + `    ${entry.parsed.date}`,
    colorize("Subject:", ansi.bold) + ` ${entry.parsed.subject}`,
    "",
    entry.parsed.body,
  ];
  return lines.join("\n");
}

function findEmailDef(entry: MailEntry, username: string, computer: import("../../../state/types").ComputerId) {
  const defs = getEmailDefinitions(username, computer);
  return defs.find(
    (d) =>
      d.email.subject === entry.parsed.subject &&
      d.email.from === entry.parsed.from
  );
}

function formatReplyOptions(options: ReplyOption[]): string {
  const lines = [
    "",
    colorize("--- Reply Options ---", ansi.dim),
  ];
  for (let i = 0; i < options.length; i++) {
    lines.push(`  ${colorize(String(i + 1), ansi.cyan)}) ${options[i].label}`);
  }
  return "\n" + lines.join("\n");
}

function buildPromptSession(
  options: ReplyOption[],
  entry: MailEntry,
  username: string,
  computer: import("../../../state/types").ComputerId
): PromptSessionInfo {
  const fromDomain = computer === "home" ? "email.com" : "nexacorp.com";
  const promptOptions: PromptOption[] = options.map((opt) => ({
    label: opt.label,
    replyEmail: {
      id: `reply_${Date.now()}`,
      from: `${username}@${fromDomain}`,
      to: entry.parsed.from,
      date: deriveReplyDate(entry.parsed.date),
      subject: `Re: ${entry.parsed.subject}`,
      body: opt.replyBody,
    },
    triggerEvents: opt.triggerEvents,
  }));

  return {
    promptText: `Select [1-${options.length}]: `,
    options: promptOptions,
  };
}

const mail: CommandHandler = (args, flags, ctx) => {
  const username = ctx.homeDir.split("/").pop() || PLAYER.username;
  const computer = ctx.activeComputer;
  const fromDomain = computer === "home" ? "email.com" : "nexacorp.com";

  // mail -s "subject" recipient — send a message
  if (flags["s"] && args.length >= 2) {
    const subject = args[0];
    const recipient = args[1];
    const content = [
      `From: ${username}@${fromDomain}`,
      `To: ${recipient}`,
      `Date: ${deriveReplyDate("Tue, 24 Feb 2026 08:30:00")}`,
      `Subject: ${subject}`,
      "",
      "(message body)",
    ].join("\n");

    const filename = `sent_${Date.now()}`;
    const result = ctx.fs.writeFile(`${getSentDir(username)}/${filename}`, content);
    if (result.fs) {
      return {
        output: `Message sent to ${recipient}.`,
        newFs: result.fs,
      };
    }
    return { output: "mail: failed to send message" };
  }

  const entries = getMailEntries(ctx.fs);

  // mail <number> — read a specific message
  if (args.length > 0) {
    const num = parseInt(args[0], 10);
    if (isNaN(num) || num < 1 || num > entries.length) {
      return { output: `mail: invalid message number '${args[0]}'` };
    }

    const entry = entries[num - 1];
    let newFs = ctx.fs;

    // Mark as read if in new/
    if (entry.dir === "new") {
      const result = markAsRead(ctx.fs, entry.filename);
      newFs = result.fs;
    }

    // Look up the email definition for trigger events and reply options
    const emailDef = findEmailDef(entry, username, computer);
    const triggerEvents: GameEvent[] = [];
    if (emailDef) {
      triggerEvents.push({ type: "file_read", detail: emailDef.email.id });
    }

    // Check for reply options on this email (hide if already replied)
    const replyOptions = emailDef?.replyOptions;
    let output = formatMessage(entry);
    let promptSession: PromptSessionInfo | undefined;

    if (replyOptions && !hasReplyInSent(newFs, username, entry.parsed.subject)) {
      output += formatReplyOptions(replyOptions);
      promptSession = buildPromptSession(replyOptions, entry, username, computer);
    }

    return {
      output,
      newFs: newFs !== ctx.fs ? newFs : undefined,
      promptSession,
      triggerEvents: triggerEvents.length > 0 ? triggerEvents : undefined,
    };
  }

  // mail (no args) — show inbox
  if (entries.length === 0) {
    return { output: "No mail." };
  }

  const headerLabel = computer === "home" ? "Mail" : "NexaCorp Mail";
  return { output: formatInbox(entries, getMailDir(username), headerLabel) };
};

register("mail", mail, "Read and send email", HELP_TEXTS.mail);
setKnownFlags("mail", { short: ["s"] });
