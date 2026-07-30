import {
  getGmailMailboxConfiguration,
  getGmailMailboxProfile,
  listGmailQuoteMessages
} from './gmailQuoteInbox';
import { ingestGmailQuoteMessage } from './emailQuoteWorkflow';

export interface EmailQuotePollState {
  running: boolean;
  enabled: boolean;
  configured: boolean;
  mailboxAddress: string;
  connectedAddress?: string;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  lastDiscovered: number;
  lastCreated: number;
  lastSkipped: number;
  lastFailed: number;
}

let pollState: EmailQuotePollState = {
  running: false,
  enabled: process.env.GMAIL_POLL_ENABLED !== 'false',
  configured: false,
  mailboxAddress: process.env.GMAIL_QUOTE_MAILBOX || 'emailbot@optimation.io',
  lastDiscovered: 0,
  lastCreated: 0,
  lastSkipped: 0,
  lastFailed: 0
};
let pollTimer: NodeJS.Timeout | null = null;

export function getEmailQuotePollState(): EmailQuotePollState & { missing?: string[]; query?: string } {
  const config = getGmailMailboxConfiguration();
  return {
    ...pollState,
    configured: config.configured,
    mailboxAddress: config.mailboxAddress,
    missing: config.missing,
    query: config.query
  };
}

export async function pollGmailQuoteInbox(): Promise<EmailQuotePollState> {
  if (pollState.running) return getEmailQuotePollState();
  const config = getGmailMailboxConfiguration();
  pollState = {
    ...pollState,
    running: true,
    configured: config.configured,
    mailboxAddress: config.mailboxAddress,
    lastAttemptAt: new Date().toISOString(),
    lastError: undefined,
    lastDiscovered: 0,
    lastCreated: 0,
    lastSkipped: 0,
    lastFailed: 0
  };

  try {
    if (!config.configured) {
      throw new Error(`Gmail quote inbox is missing: ${config.missing.join(', ')}`);
    }
    const profile = await getGmailMailboxProfile();
    pollState.connectedAddress = profile.emailAddress;
    const allowAlias = process.env.GMAIL_ALLOW_MAILBOX_ALIAS === 'true';
    if (
      !allowAlias &&
      profile.emailAddress &&
      profile.emailAddress.toLowerCase() !== config.mailboxAddress.toLowerCase()
    ) {
      throw new Error(
        `Gmail OAuth is connected to ${profile.emailAddress}, not ${config.mailboxAddress}`
      );
    }

    const messages = await listGmailQuoteMessages(
      Number(process.env.GMAIL_POLL_BATCH_SIZE || 25)
    );
    pollState.lastDiscovered = messages.length;
    for (const message of messages) {
      try {
        const result = await ingestGmailQuoteMessage(message);
        if (result.created) pollState.lastCreated += 1;
        else pollState.lastSkipped += 1;
      } catch (err) {
        pollState.lastFailed += 1;
        console.error(
          '[EmailQuotePoller] Unable to process Gmail message',
          message.externalMessageId,
          err
        );
      }
    }
    pollState.lastSuccessAt = new Date().toISOString();
  } catch (err: any) {
    pollState.lastError = err && err.message ? err.message : 'Gmail quote inbox poll failed';
    throw err;
  } finally {
    pollState.running = false;
  }
  return getEmailQuotePollState();
}

export function startGmailQuotePoller(): void {
  const config = getGmailMailboxConfiguration();
  pollState = {
    ...pollState,
    configured: config.configured,
    mailboxAddress: config.mailboxAddress,
    enabled: process.env.GMAIL_POLL_ENABLED !== 'false'
  };
  if (!pollState.enabled || !config.configured || pollTimer) {
    if (!config.configured) {
      console.log(
        `[EmailQuotePoller] ${config.mailboxAddress} is waiting for Gmail OAuth configuration`
      );
    }
    return;
  }

  const run = function() {
    pollGmailQuoteInbox().catch(function(err) {
      console.error('[EmailQuotePoller]', err && err.message ? err.message : err);
    });
  };
  const initialTimer = setTimeout(run, 5000);
  initialTimer.unref();
  pollTimer = setInterval(run, config.pollIntervalMs);
  pollTimer.unref();
  console.log(
    `[EmailQuotePoller] Monitoring ${config.mailboxAddress} every ${config.pollIntervalMs}ms`
  );
}
