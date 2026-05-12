import { Terminal } from "@xterm/xterm";
import { ISession, SessionResult } from "../session/types";
import { PiperSessionInfo, PiperReplyOption } from "./types";
import {
  checkPiperDeliveries,
  getConversationHistory,
  getDeliveryInfo,
  getVisibleChannels,
  getPendingReply,
} from "./delivery";
import {
  renderPiperHeader,
  renderChannelList,
  renderConversation,
  renderReplyMenu,
  renderTypingIndicator,
  renderSeparator,
  renderChannelListFooter,
  renderConversationFooter,
  renderScrollIndicator,
} from "./render";
import { CTRL_C } from "../terminal/keyCodes";
import { GameEvent } from "../mail/delivery";
import { checkStoryFlagTriggers, getTriggersForComputer } from "../narrative/storyFlags";
import { PIPER_TYPING_DELAY_MS } from "../../lib/timing";

type View = "channels" | "conversation";

/**
 * Speculatively appends a digit to a numeric-selection buffer. Returns the
 * new buffer state and an optional commit (1-based selection number).
 *
 * Rule: commit immediately when no longer selection can be reached
 * (`num * 10 > max`); otherwise buffer and wait for more input or Enter.
 * Invalid digits (would push the number above `max`, or start with "0")
 * are silently rejected and the existing buffer is preserved.
 *
 * Exported so the rule can be unit-tested without spinning up a session.
 */
export function consumeDigit(
  buffer: string,
  char: string,
  max: number,
): { buffer: string; commit: number | null } {
  if (char < "0" || char > "9" || max <= 0) {
    return { buffer, commit: null };
  }
  const candidate = buffer + char;
  const num = parseInt(candidate, 10);
  if (num < 1 || num > max) {
    return { buffer, commit: null };
  }
  if (num * 10 > max) {
    return { buffer: "", commit: num };
  }
  return { buffer: candidate, commit: null };
}

export class PiperSession implements ISession {
  private terminal: Terminal;
  private info: PiperSessionInfo;
  private username: string;

  private view: View = "channels";
  private selectedIndex = 0;
  private pendingEvents: GameEvent[] = [];
  private escBuffer = "";
  // Accumulates digits typed at the menu so items 10+ are reachable.
  // "1" with ≥10 items is held until another digit or Enter; 2–9 commits on the spot.
  private digitBuffer = "";

  // Channel list state
  private channelItems: ReturnType<typeof getVisibleChannels> = [];

  // Conversation state
  private activeChannelId = "";
  private activeChannelName = "";
  private activeChannelDesc?: string;
  private replyOptions: PiperReplyOption[] = [];
  private replyDeliveryId = "";
  private replyOptionMapping: number[] = [];

  // Unread tracking for "NEW" divider
  private unreadCountAtOpen = 0;

  // Scroll state
  private scrollOffset = 0;

  // Animation state
  private isAnimating = false;
  private animationTimer: ReturnType<typeof setTimeout> | null = null;
  private hiddenMessageCount = 0;
  private animationSenderName = "";

  constructor(terminal: Terminal, info: PiperSessionInfo, username: string) {
    this.terminal = terminal;
    this.info = info;
    this.username = username;
  }

  private get computerId() {
    return this.info.computerId ?? "nexacorp";
  }

  canClose(): boolean {
    return true;
  }

  /** Re-evaluate visible channels/replies from current info and redraw. */
  refresh(): void {
    if (this.isAnimating) return;
    if (this.view === "channels") {
      this.channelItems = getVisibleChannels(this.info.deliveredPiperIds, this.username, this.computerId);
    } else {
      this.refreshReplyOptions();
    }
    this.redraw();
  }

  enter(): void {
    this.channelItems = getVisibleChannels(this.info.deliveredPiperIds, this.username, this.computerId);
    this.terminal.write(`\x1b[?1049h\x1b[H\x1b[J\x1b[?25l${this.buildChannelListView()}`);
  }

  handleInput(data: string): SessionResult | null {
    for (let i = 0; i < data.length; i++) {
      const char = data[i];
      const code = char.charCodeAt(0);

      // During animation, only Ctrl+C (skip) and q (quit/back) work
      if (this.isAnimating) {
        if (code === CTRL_C) this.skipAnimation();
        if (char === "q") {
          this.skipAnimation();
          this.digitBuffer = "";
          if (this.view === "channels") {
            return this.exitSession();
          } else {
            this.view = "channels";
            this.unreadCountAtOpen = 0;
            this.selectedIndex = 0;
            this.channelItems = getVisibleChannels(this.info.deliveredPiperIds, this.username, this.computerId);
            this.terminal.write(`\x1b[H\x1b[J${this.buildChannelListView()}`);
          }
        }
        continue;
      }

      // Handle escape sequences for arrow keys
      if (code === 0x1b) {
        this.escBuffer = "\x1b";
        continue;
      }
      if (this.escBuffer === "\x1b" && char === "[") {
        this.escBuffer = "\x1b[";
        continue;
      }
      if (this.escBuffer.startsWith("\x1b[") && this.escBuffer.length >= 2) {
        // CSI parameter byte — accumulate
        if (char >= "0" && char <= "?") {
          this.escBuffer += char;
          continue;
        }
        // Final byte — act on it, then reset
        this.escBuffer = "";
        if (char === "A") {
          this.moveSelection(-1);
          continue;
        }
        if (char === "B") {
          this.moveSelection(1);
          continue;
        }
        continue;
      }
      this.escBuffer = "";

      // Ctrl+C — exit entirely
      if (code === CTRL_C) {
        return this.exitSession();
      }

      if (this.view === "channels") {
        const result = this.handleChannelListInput(char);
        if (result) return result;
      } else {
        const result = this.handleConversationInput(char);
        if (result) return result;
      }
    }

    return this.flushContinue();
  }

  /** Return a continue result, attaching any pendingEvents. */
  private flushContinue(): SessionResult | null {
    if (this.pendingEvents.length === 0) return null;
    const events = [...this.pendingEvents];
    this.pendingEvents = [];
    return { type: "continue", triggerEvents: events };
  }

  private handleChannelListInput(char: string): SessionResult | null {
    if (char === "q") {
      this.digitBuffer = "";
      return this.exitSession();
    }

    if (char >= "0" && char <= "9") {
      const commit = this.tryConsumeDigit(char, this.channelItems.length);
      if (commit !== null) {
        this.selectedIndex = commit - 1;
        this.openChannel(commit - 1);
      } else {
        this.redraw();
      }
      return this.flushContinue();
    }

    // Enter — commit buffered digits if any, else open arrow-selected channel
    if (char === "\r" || char === "\n") {
      if (this.digitBuffer) {
        const num = parseInt(this.digitBuffer, 10);
        this.digitBuffer = "";
        if (num >= 1 && num <= this.channelItems.length) {
          this.selectedIndex = num - 1;
          this.openChannel(num - 1);
        } else {
          this.redraw();
        }
        return this.flushContinue();
      }
      this.openChannel(this.selectedIndex);
      return this.flushContinue();
    }

    if (this.digitBuffer) {
      this.digitBuffer = "";
      this.redraw();
    }
    return null;
  }

  private handleConversationInput(char: string): SessionResult | null {
    if (char === "q") {
      this.digitBuffer = "";
      // Go back to channel list
      this.view = "channels";
      this.unreadCountAtOpen = 0;
      this.selectedIndex = 0;
      this.channelItems = getVisibleChannels(this.info.deliveredPiperIds, this.username, this.computerId);
      this.terminal.write(`\x1b[H\x1b[J${this.buildChannelListView()}`);
      return this.flushContinue();
    }

    if (char >= "0" && char <= "9" && this.replyOptions.length > 0) {
      const commit = this.tryConsumeDigit(char, this.replyOptions.length);
      if (commit !== null) {
        this.selectedIndex = commit - 1;
        this.selectReply(commit - 1);
      } else {
        this.redraw();
      }
      return this.flushContinue();
    }

    // Enter — commit buffered digits if any, else send arrow-selected reply
    if ((char === "\r" || char === "\n") && this.replyOptions.length > 0) {
      if (this.digitBuffer) {
        const num = parseInt(this.digitBuffer, 10);
        this.digitBuffer = "";
        if (num >= 1 && num <= this.replyOptions.length) {
          this.selectedIndex = num - 1;
          this.selectReply(num - 1);
        } else {
          this.redraw();
        }
        return this.flushContinue();
      }
      this.selectReply(this.selectedIndex);
      return this.flushContinue();
    }

    if (this.digitBuffer) {
      this.digitBuffer = "";
      this.redraw();
    }
    return null;
  }

  private tryConsumeDigit(char: string, max: number): number | null {
    const next = consumeDigit(this.digitBuffer, char, max);
    this.digitBuffer = next.buffer;
    return next.commit;
  }

  private moveSelection(delta: number): void {
    const hadBuffer = this.digitBuffer !== "";
    this.digitBuffer = "";

    // In conversation view with no reply options, scroll instead
    if (this.view === "conversation" && this.replyOptions.length === 0) {
      // Up arrow (delta -1) scrolls up (increases offset), down arrow scrolls down
      const newOffset = this.scrollOffset - delta;
      const clamped = Math.max(0, newOffset);
      if (clamped !== this.scrollOffset) {
        this.scrollOffset = clamped;
        this.redraw();
      } else if (hadBuffer) {
        this.redraw();
      }
      return;
    }

    const maxIdx = this.view === "channels"
      ? this.channelItems.length - 1
      : this.replyOptions.length - 1;

    if (maxIdx < 0) {
      if (hadBuffer) this.redraw();
      return;
    }

    const len = maxIdx + 1;
    const newIdx = ((this.selectedIndex + delta) % len + len) % len;
    if (newIdx !== this.selectedIndex) {
      this.selectedIndex = newIdx;
      this.redraw();
    } else if (hadBuffer) {
      this.redraw();
    }
  }

  private openChannel(idx: number): void {
    if (idx >= this.channelItems.length) return;
    const item = this.channelItems[idx];

    this.activeChannelId = item.channel.id;
    this.activeChannelName = item.channel.name;
    this.activeChannelDesc = item.channel.description;
    this.view = "conversation";
    this.selectedIndex = 0;
    this.scrollOffset = 0;
    this.digitBuffer = "";

    // Capture unread count before marking seen (for "NEW" divider)
    this.unreadCountAtOpen = item.unread;

    // Emit piper_checked when viewing a channel with unread messages
    if (item.unread) {
      this.pendingEvents.push({ type: "objective_completed", detail: "piper_checked" });
    }

    // Mark as seen
    this.markChannelSeen();

    // Check for pending replies
    this.refreshReplyOptions();

    this.terminal.write(`\x1b[H\x1b[J${this.buildConversationView()}`);
  }

  private selectReply(idx: number): void {
    if (idx >= this.replyOptions.length) return;
    const option = this.replyOptions[idx];
    this.scrollOffset = 0;

    // Track the reply (use original index for stable IDs)
    const replyId = `reply:${this.replyDeliveryId}:${this.replyOptionMapping[idx]}`;
    this.info.deliveredPiperIds = [...this.info.deliveredPiperIds, replyId];

    // Count messages before delivering follow-ups
    const messagesBefore = getConversationHistory(
      this.activeChannelId, this.info.deliveredPiperIds, this.username, this.computerId
    ).length;

    // Collect trigger events and deliver follow-up Piper messages
    const allNewIds: string[] = [];
    const storyFlagTriggers = getTriggersForComputer(this.computerId, this.username);

    // Auto-generate piper_reply event so after_piper_reply triggers fire
    const piperReplyEvent: GameEvent = {
      type: "objective_completed",
      detail: `piper_reply:${this.replyDeliveryId}`,
    };

    // Gather all events from this reply
    const replyEvents: GameEvent[] = [piperReplyEvent];
    if (option.triggerEvents) {
      replyEvents.push(...option.triggerEvents);
    }
    this.pendingEvents.push(...replyEvents);

    // First pass: update story flags so after_story_flag piper triggers can fire
    for (const event of replyEvents) {
      const flagResults = checkStoryFlagTriggers(event, storyFlagTriggers, this.info.storyFlags);
      for (const result of flagResults) {
        this.info.storyFlags = { ...this.info.storyFlags, [result.flag]: result.value };
      }
    }

    // Deliver piper messages with updated flags
    for (const event of replyEvents) {
      const newIds = checkPiperDeliveries(
        event,
        [...this.info.deliveredPiperIds, ...allNewIds],
        this.username,
        this.computerId,
        this.info.storyFlags
      );
      allNewIds.push(...newIds);
    }

    // Cascade: piper_delivered events can set more story flags, unlocking more messages
    let cascadeIds = [...allNewIds];
    while (cascadeIds.length > 0) {
      const nextCascade: string[] = [];
      for (const id of cascadeIds) {
        const pdEvent: GameEvent = { type: "piper_delivered", detail: id };
        this.pendingEvents.push(pdEvent);
        const flagResults = checkStoryFlagTriggers(pdEvent, storyFlagTriggers, this.info.storyFlags);
        for (const result of flagResults) {
          this.info.storyFlags = { ...this.info.storyFlags, [result.flag]: result.value };
        }
        const newIds = checkPiperDeliveries(
          pdEvent,
          [...this.info.deliveredPiperIds, ...allNewIds, ...nextCascade],
          this.username,
          this.computerId,
          this.info.storyFlags
        );
        nextCascade.push(...newIds);
      }
      allNewIds.push(...nextCascade);
      cascadeIds = nextCascade;
    }

    // Flush new IDs immediately so getConversationHistory can see them
    if (allNewIds.length > 0) {
      this.info.deliveredPiperIds = [...this.info.deliveredPiperIds, ...allNewIds];
    }

    // Count new same-channel messages
    const messagesAfter = getConversationHistory(
      this.activeChannelId, this.info.deliveredPiperIds, this.username, this.computerId
    ).length;
    const newMessageCount = messagesAfter - messagesBefore;

    // Find sender name for typing indicator
    const sameChannelSender = allNewIds.reduce<string | null>((found, id) => {
      if (found) return found;
      const info = getDeliveryInfo(id, this.username);
      return info && info.channelId === this.activeChannelId ? info.senderName : null;
    }, null);

    if (sameChannelSender && newMessageCount > 0) {
      // Animate messages appearing one at a time
      this.replyOptions = [];
      this.replyDeliveryId = "";
      this.hiddenMessageCount = newMessageCount;
      this.animationSenderName = sameChannelSender;
      this.isAnimating = true;

      // Brief pause before typing indicator appears (just show the reply first)
      this.terminal.write(`\x1b[H\x1b[J${this.buildConversationView()}`);
      this.animationTimer = setTimeout(() => this.showNextMessage(), 500);
    } else {
      // No same-channel follow-ups — just redraw
      this.refreshReplyOptions();

      this.terminal.write(`\x1b[H\x1b[J${this.buildConversationView()}`);
    }
  }

  private showNextMessage(): void {
    this.isAnimating = true;

    // Render conversation with hidden messages omitted, plus typing indicator
    const width = this.getWidth();
    const header = renderPiperHeader(this.activeChannelName, width, this.activeChannelDesc);
    const allMessages = getConversationHistory(this.activeChannelId, this.info.deliveredPiperIds, this.username, this.computerId);
    const visible = allMessages.slice(0, allMessages.length - this.hiddenMessageCount);
    const conversation = renderConversation(visible, width);
    const typing = renderTypingIndicator(this.animationSenderName);
    const footer = renderConversationFooter(width, false);

    // Apply windowing so conversation doesn't overflow the terminal
    const termRows = this.terminal.rows;
    const headerLines = this.activeChannelDesc ? 3 : 2;
    const footerLines = 2; // border + hints
    const typingLines = 3; // blank + typing indicator + blank
    const availableRows = termRows - headerLines - footerLines - typingLines;

    const convLines = conversation ? conversation.split("\r\n") : [];
    let visibleConv: string;
    if (convLines.length > availableRows && availableRows > 0) {
      const sliced = convLines.slice(convLines.length - availableRows);
      sliced[0] = renderScrollIndicator(width);
      visibleConv = sliced.join("\r\n");
    } else {
      visibleConv = conversation;
    }

    this.terminal.write(`\x1b[H\x1b[J${header}${visibleConv}\r\n\r\n${typing}\r\n\r\n${footer}`);

    // Scale delay by upcoming message length: base + 8ms per character, clamped to [1s, 4s]
    const nextMessage = allMessages[allMessages.length - this.hiddenMessageCount];
    const charCount = nextMessage?.body.length ?? 0;
    const delay = Math.max(1000, Math.min(4000, PIPER_TYPING_DELAY_MS + charCount * 8));
    this.animationTimer = setTimeout(() => this.revealOneMessage(), delay);
  }

  private revealOneMessage(): void {
    this.hiddenMessageCount--;

    if (this.hiddenMessageCount > 0) {
      // More messages to reveal — show next typing cycle
      this.showNextMessage();
    } else {
      // All messages revealed — finish animation
      this.isAnimating = false;
      this.animationTimer = null;
      this.markChannelSeen();
      this.unreadCountAtOpen = 0;

      this.refreshReplyOptions();

      this.redraw();
    }
  }

  private markChannelSeen(): void {
    const messages = getConversationHistory(this.activeChannelId, this.info.deliveredPiperIds, this.username, this.computerId);
    const npcMessages = messages.filter((m) => !m.isPlayer);
    const seenPrefix = `seen:${this.activeChannelId}:`;

    // Remove old seen marker
    this.info.deliveredPiperIds = this.info.deliveredPiperIds.filter(
      (id) => !id.startsWith(`seen:${this.activeChannelId}:`)
    );

    // Add new seen marker
    this.info.deliveredPiperIds.push(`${seenPrefix}${npcMessages.length}`);
  }

  private buildChannelListView(): string {
    const width = this.getWidth();
    const header = renderPiperHeader("Piper", width);
    const list = renderChannelList(
      this.channelItems.map((item) => ({
        name: item.channel.name,
        type: item.channel.type,
        unread: item.unread,
      })),
      this.selectedIndex,
      width
    );
    const footer = renderChannelListFooter(width, this.digitBuffer);

    return `${header}\r\n\r\n${list}\r\n\r\n${footer}`;
  }

  private buildConversationView(): string {
    const width = this.getWidth();
    const header = renderPiperHeader(this.activeChannelName, width, this.activeChannelDesc);
    const allMessages = getConversationHistory(this.activeChannelId, this.info.deliveredPiperIds, this.username, this.computerId);
    const messages = this.hiddenMessageCount > 0
      ? allMessages.slice(0, allMessages.length - this.hiddenMessageCount)
      : allMessages;
    const conversation = renderConversation(messages, width, this.unreadCountAtOpen);
    const hasReply = this.replyOptions.length > 0;

    // Calculate available rows for conversation content
    const termRows = this.terminal.rows;
    const headerLines = this.activeChannelDesc ? 3 : 2; // top border, optional description, bottom border
    const footerLines = 2; // border + hints
    const blankLines = 2;  // blank lines around conversation

    let replyLines = 0;
    let replyMenu = "";
    const sep = renderSeparator(width);
    if (hasReply) {
      replyMenu = renderReplyMenu(this.replyOptions, this.selectedIndex);
      // separator + reply options + blank line before footer
      replyLines = 1 + this.replyOptions.length + 1;
    }

    const availableRows = termRows - headerLines - footerLines - blankLines - replyLines;

    // Split conversation into lines and apply windowing
    const convLines = conversation ? conversation.split("\r\n") : [];
    const totalLines = convLines.length;
    const canScroll = totalLines > availableRows && availableRows > 0;

    // Clamp scrollOffset
    if (canScroll) {
      const maxOffset = totalLines - availableRows;
      this.scrollOffset = Math.min(this.scrollOffset, maxOffset);
    } else {
      this.scrollOffset = 0;
    }

    let visibleConv: string;
    let hasMoreAbove = false;
    if (canScroll) {
      const end = totalLines - this.scrollOffset;
      const start = end - availableRows;
      hasMoreAbove = start > 0;
      const sliced = convLines.slice(Math.max(0, start), end);
      if (hasMoreAbove) {
        sliced[0] = renderScrollIndicator(width);
      }
      visibleConv = sliced.join("\r\n");
    } else {
      visibleConv = conversation;
    }

    const footer = renderConversationFooter(width, hasReply, canScroll, this.digitBuffer);

    if (hasReply) {
      return `${header}${visibleConv}\r\n\r\n${sep}\r\n${replyMenu}\r\n${footer}`;
    } else {
      return `${header}${visibleConv}\r\n\r\n${footer}`;
    }
  }

  private redraw(): void {
    const content = this.view === "channels"
      ? this.buildChannelListView()
      : this.buildConversationView();
    // Single atomic write: clear screen + content (no flicker)
    this.terminal.write(`\x1b[H\x1b[J${content}`);
  }

  private exitSession(): SessionResult {
    this.terminal.write("\x1b[H\x1b[J\x1b[?25h\x1b[?1049l");
    return {
      type: "exit",
      triggerEvents: this.pendingEvents.length > 0 ? [...this.pendingEvents] : undefined,
    };
  }

  private skipAnimation(): void {
    if (this.animationTimer) {
      clearTimeout(this.animationTimer);
      this.animationTimer = null;
    }
    this.isAnimating = false;
    this.hiddenMessageCount = 0;
    this.markChannelSeen();

    this.refreshReplyOptions();

    this.redraw();
  }

  private refreshReplyOptions(): void {
    const pending = getPendingReply(this.activeChannelId, this.info.deliveredPiperIds, this.username);
    this.replyOptionMapping = [];
    this.replyOptions = [];
    this.replyDeliveryId = "";
    if (pending?.options) {
      for (let i = 0; i < pending.options.length; i++) {
        const opt = pending.options[i];
        if (opt.visibleWhen && !this.info.storyFlags[opt.visibleWhen.flag]) continue;
        this.replyOptionMapping.push(i);
        this.replyOptions.push(opt);
      }
      this.replyDeliveryId = pending.deliveryId;
    }
    this.selectedIndex = 0;
  }

  private getWidth(): number {
    return Math.min(this.terminal.cols, 44);
  }
}
