// Shared by Gmail intake and the local operations inspector.
export const ALLOWED_SENDER_EMAILS = [
  'gerson@optimation.io',
  'david@optimation.io',
  'jack@truckfirstclass.com',
  'diana@truckfirstclass.com',
  'dispatch@truckfirstclass.com'
];

// Keep Gmail discovery and the post-fetch sender check on the same list.
// GMAIL_QUOTE_QUERY supplies mailbox/date filters, not a duplicate sender list.
export function buildGmailQuoteQuery(baseQuery: string): string {
  const senders = ALLOWED_SENDER_EMAILS.map(email => `from:${email}`).join(' OR ');
  return `(${baseQuery}) (${senders})`;
}
