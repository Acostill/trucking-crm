import crypto from 'crypto';
import { getGoogleOAuthCredentials, GoogleOAuthRole } from './googleOAuthCredentials';

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_MAILBOX = 'emailbot@optimation.io';
const ALLOWED_SENDER_EMAILS = [
  'gerson@optimation.io',
  'david@optimation.io',
  'jack@truckfirstclass.com',
  'dispatch@truckfirstclass.com'
];
const ALLOWED_SENDER_EMAIL_SET = new Set(
  ALLOWED_SENDER_EMAILS.map(function(email) { return email.toLowerCase(); })
);

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

export interface GmailSendConfiguration {
  configured: boolean;
  usingSeparateAccount: boolean;
  sendAccount: string;
  fromAddress: string;
  fromName?: string;
  missing: string[];
}

const tokenCaches: Record<GoogleOAuthRole, GmailTokenCache | null> = {
  inbox: null,
  send: null
};

function refreshTokenFor(role: GoogleOAuthRole): string {
  if (role === 'send') return String(process.env.GMAIL_SEND_REFRESH_TOKEN || '').trim();
  return String(process.env.GMAIL_REFRESH_TOKEN || '').trim();
}

function requiredInboxEnvironment(): Array<{ key: string; value: string | undefined }> {
  const oauthCredentials = getGoogleOAuthCredentials('inbox');
  return [
    {
      key: 'Google OAuth client (credentials.json or GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET)',
      value: oauthCredentials ? 'configured' : undefined
    },
    { key: 'GMAIL_REFRESH_TOKEN', value: process.env.GMAIL_REFRESH_TOKEN }
  ];
}

export function getGmailMailboxConfiguration(): GmailMailboxConfiguration {
  const missing = requiredInboxEnvironment()
    .filter(function(entry) { return !entry.value; })
    .map(function(entry) { return entry.key; });
  const rawInterval = Number(process.env.GMAIL_POLL_INTERVAL_MS || 60000);
  const mailboxAddress = process.env.GMAIL_QUOTE_MAILBOX || DEFAULT_MAILBOX;
  return {
    configured: missing.length === 0,
    mailboxAddress,
    query: process.env.GMAIL_QUOTE_QUERY ||
      `to:${mailboxAddress} in:inbox newer_than:30d (${ALLOWED_SENDER_EMAILS
        .map(function(email) { return `from:${email}`; })
        .join(' OR ')})`,
    pollIntervalMs: Number.isFinite(rawInterval) && rawInterval >= 15000 ? rawInterval : 60000,
    missing
  };
}

export function getGmailSendConfiguration(): GmailSendConfiguration {
  const inboxConfig = getGmailMailboxConfiguration();
  const sendRefreshToken = refreshTokenFor('send');
  const sendAccount = String(process.env.GMAIL_SEND_ACCOUNT || '').trim();
  const fromAddress = String(process.env.GMAIL_SEND_FROM_ADDRESS || '').trim();
  const fromName = String(process.env.GMAIL_SEND_FROM_NAME || '').trim();

  const usingSeparateAccount = Boolean(sendRefreshToken);

  if (usingSeparateAccount) {
    const missing: string[] = [];
    if (!getGoogleOAuthCredentials('send')) {
      missing.push(
        'Google OAuth client (GMAIL_SEND_CLIENT_ID + GMAIL_SEND_CLIENT_SECRET, or the inbox client)'
      );
    }
    if (!sendAccount) missing.push('GMAIL_SEND_ACCOUNT');
    const resolvedFrom = fromAddress || sendAccount;
    return {
      configured: missing.length === 0,
      usingSeparateAccount: true,
      sendAccount,
      fromAddress: resolvedFrom,
      fromName: fromName || undefined,
      missing
    };
  }

  return {
    configured: inboxConfig.configured,
    usingSeparateAccount: false,
    sendAccount: inboxConfig.mailboxAddress,
    fromAddress: fromAddress || inboxConfig.mailboxAddress,
    fromName: fromName || undefined,
    missing: inboxConfig.missing
  };
}

async function getAccessToken(role: GoogleOAuthRole = 'inbox'): Promise<string> {
  const cached = tokenCaches[role];
  if (cached && cached.expiresAt > Date.now() + 60000) {
    return cached.accessToken;
  }

  if (role === 'inbox') {
    const config = getGmailMailboxConfiguration();
    if (!config.configured) {
      const err: any = new Error('Gmail quote inbox is not configured');
      err.status = 503;
      err.details = { missing: config.missing };
      throw err;
    }
  } else {
    const config = getGmailSendConfiguration();
    if (!config.configured) {
      const err: any = new Error('Gmail send-as workflow is not configured');
      err.status = 503;
      err.details = { missing: config.missing };
      throw err;
    }
  }

  const oauthCredentials = getGoogleOAuthCredentials(role);
  if (!oauthCredentials) {
    const err: any = new Error('Google OAuth client credentials are not configured');
    err.status = 503;
    throw err;
  }

  const refreshToken = refreshTokenFor(role);
  if (!refreshToken) {
    const err: any = new Error(
      role === 'send'
        ? 'GMAIL_SEND_REFRESH_TOKEN is not configured'
        : 'GMAIL_REFRESH_TOKEN is not configured'
    );
    err.status = 503;
    throw err;
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: oauthCredentials.clientId,
      client_secret: oauthCredentials.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    }).toString()
  });
  const payload: any = await response.json().catch(function() { return {}; });
  if (!response.ok || !payload.access_token) {
    const baseMessage = role === 'send'
      ? 'Unable to authorize the Gmail send-as account'
      : 'Unable to authorize the Gmail quote inbox';
    const providerError = payload.error_description || payload.error;
    const err: any = new Error(
      providerError ? `${baseMessage}: ${providerError}` : baseMessage
    );
    err.status = 502;
    err.details = {
      providerStatus: response.status,
      providerError
    };
    throw err;
  }

  const cache: GmailTokenCache = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + Math.max(60, Number(payload.expires_in || 3600)) * 1000
  };
  tokenCaches[role] = cache;
  return cache.accessToken;
}

async function gmailGet(
  path: string,
  params?: Record<string, string>,
  role: GoogleOAuthRole = 'inbox'
): Promise<any> {
  const token = await getAccessToken(role);
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
    if (response.status === 401) tokenCaches[role] = null;
    const providerMessage = payload?.error?.message;
    const err: any = new Error(
      providerMessage
        ? `Gmail API request failed (${response.status}): ${providerMessage}`
        : `Gmail API request failed (${response.status})`
    );
    err.status = 502;
    err.details = {
      providerStatus: response.status,
      providerMessage
    };
    throw err;
  }
  return payload;
}

async function gmailPost(path: string, body: any, role: GoogleOAuthRole = 'inbox'): Promise<any> {
  const token = await getAccessToken(role);
  const response = await fetch(GMAIL_API_BASE + path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(body)
  });
  const payload: any = await response.json().catch(function() { return {}; });
  if (!response.ok) {
    if (response.status === 401) tokenCaches[role] = null;
    const providerMessage = payload?.error?.message;
    const err: any = new Error(
      providerMessage
        ? `Gmail API request failed (${response.status}): ${providerMessage}`
        : `Gmail API request failed (${response.status})`
    );
    err.status = 502;
    err.details = {
      providerStatus: response.status,
      providerMessage
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

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function encodeMimeHeaderWord(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
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

export async function getGmailMailboxProfile(
  role: GoogleOAuthRole = 'inbox'
): Promise<{ emailAddress?: string; messagesTotal?: number }> {
  const profile = await gmailGet('/users/me/profile', undefined, role);
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
  const allowedSenders = messages.filter(function(message) {
    return Boolean(message.senderEmail && ALLOWED_SENDER_EMAIL_SET.has(message.senderEmail.toLowerCase()));
  });
  return allowedSenders.sort(function(a, b) {
    return String(a.receivedAt || '').localeCompare(String(b.receivedAt || ''));
  });
}

function formatFromHeader(address: string, name?: string): string {
  if (!name) return address;
  const encodedName = encodeMimeHeaderWord(name);
  const quotedName = encodedName === name && /[",<>@]/.test(name)
    ? `"${name.replace(/"/g, '\\"')}"`
    : encodedName;
  return `${quotedName} <${address}>`;
}

function normalizeMessageId(value?: string): string | undefined {
  const trimmed = String(value || '').trim();
  if (!trimmed) return undefined;
  return /^<.*>$/.test(trimmed) ? trimmed : `<${trimmed.replace(/^<|>$/g, '')}>`;
}

export async function sendGmailMessage(params: {
  to: string;
  cc?: string;
  subject: string;
  html: string;
  threadId?: string;
  inReplyToMessageId?: string;
}): Promise<{ id: string; threadId?: string }> {
  const sendConfig = getGmailSendConfiguration();
  const role: GoogleOAuthRole = sendConfig.usingSeparateAccount ? 'send' : 'inbox';
  const fromHeader = formatFromHeader(sendConfig.fromAddress, sendConfig.fromName);
  const text = htmlToText(params.html);
  const boundary = `fct_${crypto.randomBytes(12).toString('hex')}`;
  const inReplyTo = normalizeMessageId(params.inReplyToMessageId);
  // Gmail thread IDs are per-mailbox. When we authenticate as a different
  // account for sending, the inbox's threadId does not exist there and the
  // API returns 404. Rely on In-Reply-To / References for cross-mailbox
  // threading instead.
  const threadId = sendConfig.usingSeparateAccount ? undefined : params.threadId;
  const mime = [
    `From: ${fromHeader}`,
    `To: ${params.to}`,
    ...(params.cc ? [`Cc: ${params.cc}`] : []),
    `Subject: ${encodeMimeHeaderWord(params.subject)}`,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []),
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    '',
    params.html,
    '',
    `--${boundary}--`
  ].join('\r\n');
  const payload = await gmailPost('/users/me/messages/send', {
    raw: encodeBase64Url(mime),
    ...(threadId ? { threadId } : {})
  }, role);
  return { id: payload.id, threadId: payload.threadId };
}
