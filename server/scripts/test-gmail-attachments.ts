import assert from 'assert';
import { hydrateGmailQuoteMessageAttachments } from '../services/gmailQuoteInbox';

async function run() {
  const encoded = Buffer.from('2 pallets, 1200 x 1000 x 1300 mm, 1000 kg', 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const hydrated = await hydrateGmailQuoteMessageAttachments({
    externalMessageId: 'gmail-message-test',
    mailboxAddress: 'emailbot@optimation.io',
    rawText: 'Subject: RFQ attached',
    attachments: [{
      inlineData: encoded,
      fileName: 'rfq.txt',
      mimeType: 'text/plain',
      size: 48
    }]
  });
  assert.match(hydrated.rawText, /ATTACHMENT: rfq\.txt/);
  assert.match(hydrated.rawText, /1000 kg/);
  console.log('Gmail attachment intake tests passed.');
}

run().catch(function(error) {
  console.error(error);
  process.exitCode = 1;
});
