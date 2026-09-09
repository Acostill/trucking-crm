import assert from 'assert';
import { ALLOWED_SENDER_EMAILS } from '../config/quoteInboxSenders';
import { getGmailMailboxConfiguration, listGmailQuoteMessages } from '../services/gmailQuoteInbox';

async function run() {
  const originalFetch = global.fetch;
  const keys = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GMAIL_QUOTE_MAILBOX', 'GMAIL_QUOTE_QUERY'] as const;
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    process.env.GMAIL_CLIENT_ID = 'test-client';
    process.env.GMAIL_CLIENT_SECRET = 'test-secret';
    process.env.GMAIL_REFRESH_TOKEN = 'test-refresh';
    process.env.GMAIL_QUOTE_MAILBOX = 'emailbot@optimation.io';
    delete process.env.GMAIL_QUOTE_QUERY;
    const defaultQuery = getGmailMailboxConfiguration().query;
    assert(defaultQuery.includes('to:emailbot@optimation.io in:inbox newer_than:30d'));
    assert(defaultQuery.includes('from:diana@truckfirstclass.com'));

    const boundary = 'to:emailbot@optimation.io in:inbox newer_than:30d after:1788930000';
    process.env.GMAIL_QUOTE_QUERY = boundary;
    const query = getGmailMailboxConfiguration().query;
    assert(query.startsWith(`(${boundary}) `), 'The production cutoff must be retained');
    for (const sender of ALLOWED_SENDER_EMAILS) assert(query.includes(`from:${sender}`));
    assert.equal(ALLOWED_SENDER_EMAILS.length, 5);

    let discovered = false;
    global.fetch = (async (input: any) => {
      const url = new URL(String(input));
      let payload: any;
      if (url.hostname === 'oauth2.googleapis.com') {
        payload = { access_token: 'test-access-token', expires_in: 3600 };
      } else if (url.pathname.endsWith('/messages')) {
        assert.equal(url.searchParams.get('q'), query, 'Gmail must search the shared sender list');
        discovered = true;
        payload = { messages: [{ id: 'diana' }, { id: 'dispatch' }, { id: 'unauthorized' }] };
      } else {
        const id = url.pathname.split('/').pop();
        const from = id === 'diana' ? 'Diana O <DIANA@TRUCKFIRSTCLASS.COM>'
          : id === 'dispatch' ? 'dispatch@truckfirstclass.com' : 'unapproved@example.com';
        payload = { id, threadId: id, internalDate: id === 'diana' ? '1788982780000' : '1788982820000',
          payload: { headers: [{ name: 'From', value: from }, { name: 'To', value: 'emailbot@optimation.io' },
            { name: 'Subject', value: 'Shipment request' }], mimeType: 'text/plain',
            body: { data: Buffer.from('Pickup NC 28273, delivery ATL airport').toString('base64url') } } };
      }
      return { ok: true, status: 200, json: async () => payload } as Response;
    }) as typeof fetch;

    const messages = await listGmailQuoteMessages();
    assert(discovered);
    assert.deepEqual(messages.map(message => message.externalMessageId), ['diana', 'dispatch'],
      'Diana and existing allowed senders must be accepted; unknown senders must remain excluded');
    assert.equal(messages[0].senderEmail?.toLowerCase(), 'diana@truckfirstclass.com');
    console.log('Gmail sender intake regression checks passed (default/custom query, cutoff, Diana, existing senders, unknown sender).');
  } finally {
    global.fetch = originalFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
