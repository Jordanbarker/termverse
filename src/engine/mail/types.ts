export interface Email {
  id: string;
  from: string;
  to: string;
  date: string;
  subject: string;
  body: string;
}

export interface ReplyOption {
  label: string;
  replyBody: string;
  triggerEvents?: import("./delivery").GameEvent[];
}

export interface EmailDelivery {
  email: Email;
  trigger: EmailTrigger | EmailTrigger[];
  replyOptions?: ReplyOption[];
}

export type EmailTrigger =
  | { type: "immediate" }
  | { type: "after_file_read"; filePath: string; requireDelivered?: string }
  | { type: "after_email_read"; emailId: string }
  | { type: "after_command"; command: string; requiredFlags?: string[] }
  | { type: "after_objective"; objectiveId: string }
  | { type: "after_story_flag"; flag: string; requiredFlags?: string[] }
  | { type: "after_event_detail"; eventType: import("./delivery").GameEvent["type"]; detail: string };
