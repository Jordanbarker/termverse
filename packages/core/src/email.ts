/**
 * Email — a plain message record for the in-engine mail system. Pure data,
 * story-agnostic; story content supplies the field values.
 */
export interface Email {
  id: string;
  from: string;
  to: string;
  date: string;
  subject: string;
  body: string;
}
