import { getGoogleOAuthCredentials } from './googleOAuthCredentials';

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_MAILBOX = 'emailbot@optimation.io';

interface GmailTokenCache {
  accessToken: string;
  expiresAt: number;
}

interface GmailHeader {
  name?: string;
  value?: string;
}

interface GmailMessagePart {
  mimeType?: string;
  headers?: GmailHeader[];
  body?: {
    data?: string;
    attachmentId?: string;
    size?: number;
  };
  parts?: GmailMessagePart[];
}

interface GmailMessageResource {
  id: string;
  threadId?: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailMessagePart;
}

export interface GmailQuoteMessage {
  externalMessageId: string;
  externalThreadId?: string;
  internetMessageId?: string;
  mailboxAddress: string;
  senderName?: string;
  senderEmail?: string;
  recipientEmail?: string;
  subject?: string;
  receivedAt?: string;
  rawText: string;
}

export interface GmailMailboxConfiguration {
  configured: boolean;
  mailboxAddress: string;
  query: string;
  pollIntervalMs: number;
  missing: string[];
}

let tokenCache: GmailTokenCache | null = null;

function requiredEnvironment(): Array<{ key: string; value: string | undefined }> {
  const oauthCredentials = getGoogleOAuthCredentials();
  return [
    {
      key: 'Google OAuth client (credentials.json or GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET)',
      value: oauthCredentials ? 'configured' : undefined
    },
    { key: 'GMAIL_REFRESH_TOKEN', value: process.env.GMAIL_REFRESH_TOKEN }
  ];
}

export function getGmailMailboxConfiguration(): GmailMailboxConfiguration {
  const missing = requiredEnvironment()
    .filter(function(entry) { return !entry.value; })
    .map(function(entry) { return entry.key; });
  const rawInterval = Number(process.env.GMAIL_POLL_INTERVAL_MS || 60000);
  const mailboxAddress = process.env.GMAIL_QUOTE_MAILBOX || DEFAULT_MAILBOX;
  return {
    configured: missing.length === 0,
    mailboxAddress,
    query: process.env.GMAIL_QUOTE_QUERY || `to:${mailboxAddress} in:inbox newer_than:30d`,
    pollIntervalMs: Number.isFinite(rawInterval) && rawInterval >= 15000 ? rawInterval : 60000,
    missing
  };
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60000) {
    return tokenCache.accessToken;
  }

  const config = getGmailMailboxConfiguration();
  const oauthCredentials = getGoogleOAuthCredentials();
  if (!config.configured) {
    const err: any = new Error('Gmail quote inbox is not configured');
    err.status = 503;
    err.details = { missing: config.missing };
    throw err;
  }
  if (!oauthCredentials) {
    const err: any = new Error('Google OAuth client credentials are not configured');
    err.status = 503;
    throw err;
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: oauthCredentials.clientId,
      client_secret: oauthCredentials.clientSecret,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN || '',
      grant_type: 'refresh_token'
    }).toString()
  });
  const payload: any = await response.json().catch(function() { return {}; });
  if (!response.ok || !payload.access_token) {
    const err: any = new Error('Unable to authorize the Gmail quote inbox');
    err.status = 502;
    err.details = {
      providerStatus: response.status,
      providerError: payload.error_description || payload.error
    };
    throw err;
  }

  tokenCache = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + Math.max(60, Number(payload.expires_in || 3600)) * 1000
  };
  return tokenCache.accessToken;
}

async function gmailGet(path: string, params?: Record<string, string>): Promise<any> {
  const token = await getAccessToken();
  const url = new URL(GMAIL_API_BASE + path);
  Object.entries(params || {}).forEach(function(entry) {
    url.searchParams.set(entry[0], entry[1]);
  });
  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });
  const payload: any = await response.json().catch(function() { return {}; });
  if (!response.ok) {
    if (response.status === 401) tokenCache = null;
    const err: any = new Error(`Gmail API request failed (${response.status})`);
    err.status = 502;
    err.details = {
      providerStatus: response.status,
      providerMessage: payload?.error?.message
    };
    throw err;
  }
  return payload;
}

function decodeBase64Url(value: string | undefined): string {
  if (!value) return '';
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 ? '='.repeat(4 - normalized.length % 4) : '';
  return Buffer.from(normalized + padding, 'base64').toString('utf8');
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function htmlToText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function extractMessageBody(payload: GmailMessagePart | undefined): string {
  const plain: string[] = [];
  const html: string[] = [];

  function visit(part: GmailMessagePart | undefined) {
    if (!part) return;
    const mimeType = String(part.mimeType || '').toLowerCase();
    const value = decodeBase64Url(part.body && part.body.data);
    if (value && mimeType === 'text/plain') plain.push(value);
    if (value && mimeType === 'text/html') html.push(value);
    (part.parts || []).forEach(visit);
  }

  visit(payload);
  if (plain.length) return plain.join('\n\n').trim();
  if (html.length) return htmlToText(html.join('\n'));
  return decodeBase64Url(payload && payload.body && payload.body.data).trim();
}

function getHeader(headers: GmailHeader[] | undefined, name: string): string {
  const target = String(name).toLowerCase();
  const match = (headers || []).find(function(header) {
    return String(header.name || '').toLowerCase() === target;
  });
  return String(match && match.value || '').trim();
}

function parseAddress(value: string): { name?: string; email?: string } {
  const match = String(value || '').match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (match) {
    return {
      name: match[1].trim() || undefined,
      email: match[2].trim().toLowerCase()
    };
  }
  const emailMatch = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return {
    email: emailMatch ? emailMatch[0].toLowerCase() : undefined
  };
}

function mapGmailMessage(message: GmailMessageResource, mailboxAddress: string): GmailQuoteMessage {
  const headers = message.payload && message.payload.headers || [];
  const subject = getHeader(headers, 'Subject');
  const from = getHeader(headers, 'From');
  const to = getHeader(headers, 'To');
  const internetMessageId = getHeader(headers, 'Message-ID');
  const sender = parseAddress(from);
  const recipient = parseAddress(to);
  const body = extractMessageBody(message.payload) || message.snippet || '';
  const receivedAt = message.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : undefined;
  const rawText = [
    subject ? `Subject: ${subject}` : '',
    from ? `From: ${from}` : '',
    to ? `To: ${to}` : '',
    '',
    body
  ].filter(function(value, index) {
    return value || index === 3;
  }).join('\n').trim();

  return {
    externalMessageId: message.id,
    externalThreadId: message.threadId,
    internetMessageId: internetMessageId || undefined,
    mailboxAddress,
    senderName: sender.name,
    senderEmail: sender.email,
    recipientEmail: recipient.email || to || mailboxAddress,
    subject: subject || '(No subject)',
    receivedAt,
    rawText
  };
}

export async function getGmailMailboxProfile(): Promise<{ emailAddress?: string; messagesTotal?: number }> {
  const profile = await gmailGet('/users/me/profile');
  return {
    emailAddress: profile.emailAddress,
    messagesTotal: Number(profile.messagesTotal) || 0
  };
}

export async function listGmailQuoteMessages(maxResults = 25): Promise<GmailQuoteMessage[]> {
  const config = getGmailMailboxConfiguration();
  const boundedMax = Math.max(1, Math.min(100, Number(maxResults) || 25));
  const list = await gmailGet('/users/me/messages', {
    maxResults: String(boundedMax),
    q: config.query
  });
  const summaries = Array.isArray(list.messages) ? list.messages : [];
  const messages = await Promise.all(summaries.map(async function(summary: any) {
    const full = await gmailGet(`/users/me/messages/${encodeURIComponent(summary.id)}`, {
      format: 'full'
    });
    return mapGmailMessage(full as GmailMessageResource, config.mailboxAddress);
  }));
  return messages.sort(function(a, b) {
    return String(a.receivedAt || '').localeCompare(String(b.receivedAt || ''));
  });
}
