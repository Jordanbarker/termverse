export interface ChipMessage {
  text: string;
  triggeredBy?: string;
}

export interface AssistantState {
  visible: boolean;
  currentMessage: ChipMessage | null;
  messageHistory: ChipMessage[];
}
