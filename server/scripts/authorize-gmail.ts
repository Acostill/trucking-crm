import 'dotenv/config';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import { getGoogleOAuthCredentials } from '../services/googleOAuthCredentials';

const oauthCredentials = getGoogleOAuthCredentials();
const clientId = oauthCredentials && oauthCredentials.clientId;
const clientSecret = oauthCredentials && oauthCredentials.clientSecret;
const redirectUri = process.env.GMAIL_REDIRECT_URI || 'http://127.0.0.1:53682/oauth2callback';
const mailbox = process.env.GMAIL_QUOTE_MAILBOX || 'emailbot@optimation.io';

if (!clientId || !clientSecret) {
  console.error('');
  console.error('Google OAuth credentials were not found.');
  console.error('Download a Desktop app OAuth client from Google Cloud, then save it as:');
  console.error('  server/credentials.json');
  console.error('');
  console.error('You can also set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in server/.env.');
  process.exit(1);
}

function saveRefreshToken(refreshToken: string): string {
  const envCandidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'server', '.env'),
    path.resolve(__dirname, '..', '.env')
  ];
  const envPath = envCandidates.find(function(candidate) {
    return fs.existsSync(candidate);
  }) || envCandidates[0];
  const line = `GMAIL_REFRESH_TOKEN=${refreshToken}`;
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const updated = /^GMAIL_REFRESH_TOKEN=.*$/m.test(existing)
    ? existing.replace(/^GMAIL_REFRESH_TOKEN=.*$/m, function() { return line; })
    : existing.replace(/\s*$/, '') + (existing.trim() ? '\n' : '') + line + '\n';
  fs.writeFileSync(envPath, updated, { mode: 0o600 });
  return envPath;
}

const redirect = new URL(redirectUri);
const state = crypto.randomBytes(24).toString('hex');
const authorizeUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authorizeUrl.searchParams.set('client_id', clientId);
authorizeUrl.searchParams.set('redirect_uri', redirectUri);
authorizeUrl.searchParams.set('response_type', 'code');
authorizeUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/gmail.readonly');
authorizeUrl.searchParams.set('access_type', 'offline');
authorizeUrl.searchParams.set('prompt', 'consent');
authorizeUrl.searchParams.set('login_hint', mailbox);
authorizeUrl.searchParams.set('state', state);

console.log('');
console.log(`Authorize the quote inbox as ${mailbox}:`);
console.log(authorizeUrl.toString());
console.log('');
console.log(`Waiting for the Google callback at ${redirectUri} ...`);

const server = http.createServer(async function(req, res) {
  const requestUrl = new URL(req.url || '/', redirectUri);
  if (requestUrl.pathname !== redirect.pathname) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  if (requestUrl.searchParams.get('state') !== state) {
    res.statusCode = 400;
    res.end('Invalid OAuth state');
    server.close();
    return;
  }
  const error = requestUrl.searchParams.get('error');
  const code = requestUrl.searchParams.get('code');
  if (error || !code) {
    res.statusCode = 400;
    res.end(`Google authorization failed: ${error || 'missing authorization code'}`);
    server.close();
    return;
  }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      }).toString()
    });
    const tokens: any = await tokenResponse.json().catch(function() { return {}; });
    if (!tokenResponse.ok || !tokens.refresh_token) {
      throw new Error(tokens.error_description || tokens.error || 'Google did not return a refresh token');
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<h1>Gmail quote inbox connected</h1><p>You can close this window and return to the terminal.</p>');
    const envPath = saveRefreshToken(tokens.refresh_token);
    console.log('');
    console.log(`Authorization complete. The refresh token was saved to ${envPath}.`);
    console.log('Restart the API with npm run dev.');
    console.log('');
  } catch (err: any) {
    res.statusCode = 500;
    res.end('Unable to exchange the Google authorization code.');
    console.error(err && err.message ? err.message : err);
  } finally {
    server.close();
  }
});

server.listen(Number(redirect.port || 53682), redirect.hostname);

setTimeout(function() {
  console.error('Authorization timed out. Run the command again.');
  server.close();
}, 15 * 60 * 1000).unref();
