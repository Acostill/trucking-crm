import fs from 'fs';
import path from 'path';

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

export function getGoogleOAuthCredentials(): GoogleOAuthCredentials | null {
  const clientId = String(process.env.GMAIL_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GMAIL_CLIENT_SECRET || '').trim();
  if (clientId && clientSecret) {
    return {
      clientId,
      clientSecret,
      source: 'environment'
    };
  }

  for (const candidate of credentialFileCandidates()) {
    const credentials = credentialsFromFile(candidate);
    if (credentials) return credentials;
  }
  return null;
}
