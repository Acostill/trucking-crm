import fs from 'fs';
import path from 'path';

export type GoogleOAuthRole = 'inbox' | 'send';

export interface GoogleOAuthCredentials {
  clientId: string;
  clientSecret: string;
  source: string;
}

function credentialsFromFile(filePath: string): GoogleOAuthCredentials | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const document = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const client = document.installed || document.web || document;
    if (!client.client_id || !client.client_secret) return null;
    return {
      clientId: String(client.client_id),
      clientSecret: String(client.client_secret),
      source: filePath
    };
  } catch (_err) {
    return null;
  }
}

function credentialFileCandidates(): string[] {
  const directories = [
    process.cwd(),
    path.resolve(process.cwd(), 'server'),
    path.resolve(__dirname, '..')
  ];
  const explicit = process.env.GMAIL_CREDENTIALS_FILE
    ? path.resolve(process.cwd(), process.env.GMAIL_CREDENTIALS_FILE)
    : null;
  const candidates = explicit ? [explicit] : [];

  directories.forEach(function(directory) {
    candidates.push(path.join(directory, 'credentials.json'));
    if (!fs.existsSync(directory)) return;
    fs.readdirSync(directory)
      .filter(function(name) {
        return /^client_secret.*\.json$/i.test(name);
      })
      .forEach(function(name) {
        candidates.push(path.join(directory, name));
      });
  });
  return Array.from(new Set(candidates));
}

function environmentCredentials(prefix: string, sourceLabel: string): GoogleOAuthCredentials | null {
  const clientId = String(process.env[`${prefix}CLIENT_ID`] || '').trim();
  const clientSecret = String(process.env[`${prefix}CLIENT_SECRET`] || '').trim();
  if (clientId && clientSecret) {
    return { clientId, clientSecret, source: sourceLabel };
  }
  return null;
}

export function getGoogleOAuthCredentials(role: GoogleOAuthRole = 'inbox'): GoogleOAuthCredentials | null {
  if (role === 'send') {
    const sendCredentials = environmentCredentials('GMAIL_SEND_', 'environment:send');
    if (sendCredentials) return sendCredentials;
    // Fall back to the inbox OAuth client so operators can reuse the same
    // Google Cloud client for both flows and only provide a distinct refresh
    // token for the sending account.
  }

  const inboxCredentials = environmentCredentials('GMAIL_', 'environment');
  if (inboxCredentials) return inboxCredentials;

  for (const candidate of credentialFileCandidates()) {
    const credentials = credentialsFromFile(candidate);
    if (credentials) return credentials;
  }
  return null;
}
