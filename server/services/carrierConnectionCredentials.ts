import crypto from 'crypto';
import db from '../db';

const PROVIDER = 'forward_air';
const AAD = 'first-class:carrier-connection:forward-air:v1';

export interface ForwardAirCredentials {
  username: string;
  password: string;
  customerId: string;
  billToCustomerNumber: string;
  shipperCustomerNumber: string;
}

export interface ForwardAirConnectionStatus {
  saved: boolean;
  encryptionReady: boolean;
  environmentConfigured: boolean;
  updatedAt?: string;
  billToAccountSuffix?: string;
  shipperAccountSuffix?: string;
}

function accountSuffix(value: string): string | undefined {
  const digits = String(value || '').replace(/\s/g, '');
  return digits ? `••••${digits.slice(-4)}` : undefined;
}

function encryptionKey(): Buffer | undefined {
  const value = String(process.env.CARRIER_CREDENTIALS_ENCRYPTION_KEY || '').trim();
  return value ? crypto.createHash('sha256').update(value).digest() : undefined;
}

function encrypt(credentials: ForwardAirCredentials): string {
  const key = encryptionKey();
  if (!key) throw new Error('Carrier credential storage is not configured. Set CARRIER_CREDENTIALS_ENCRYPTION_KEY.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(AAD));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()]);
  return JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') });
}

function decrypt(payload: string): ForwardAirCredentials | undefined {
  const key = encryptionKey();
  if (!key) return undefined;
  try {
    const parsed = JSON.parse(payload);
    if (parsed.version !== 1) return undefined;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'base64'));
    decipher.setAAD(Buffer.from(AAD));
    decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(parsed.ciphertext, 'base64')), decipher.final()]).toString('utf8');
    const credentials = JSON.parse(plaintext);
    if (!credentials || typeof credentials !== 'object') return undefined;
    const required = ['username', 'password', 'customerId', 'billToCustomerNumber', 'shipperCustomerNumber'];
    if (required.some(function(field) { return !String(credentials[field] || '').trim(); })) return undefined;
    return credentials as ForwardAirCredentials;
  } catch (_error) {
    return undefined;
  }
}

function forwardAirEnvironmentConfigured(): boolean {
  return [
    'FORWARD_AIR_BASE_URL', 'FORWARD_AIR_USERNAME', 'FORWARD_AIR_PASSWORD', 'FORWARD_AIR_CUSTOMER_ID',
    'FORWARD_AIR_BILL_TO_CUSTOMER_NUMBER', 'FORWARD_AIR_SHIPPER_CUSTOMER_NUMBER'
  ].every(function(name) { return Boolean(String(process.env[name] || '').trim()); });
}

export async function getForwardAirConnectionStatus(): Promise<ForwardAirConnectionStatus> {
  const status: ForwardAirConnectionStatus = {
    saved: false,
    encryptionReady: Boolean(encryptionKey()),
    environmentConfigured: forwardAirEnvironmentConfigured()
  };
  try {
    const result = await db.query(
      `SELECT updated_at FROM public.carrier_connection_credentials WHERE provider = $1`,
      [PROVIDER]
    );
    if (result.rows.length) {
      status.saved = true;
      status.updatedAt = result.rows[0].updated_at;
      const credentials = await getStoredForwardAirCredentials();
      if (credentials) {
        status.billToAccountSuffix = accountSuffix(credentials.billToCustomerNumber);
        status.shipperAccountSuffix = accountSuffix(credentials.shipperCustomerNumber);
      }
    }
  } catch (_error) {
    // The setup page remains available until its additive migration runs.
  }
  return status;
}

export async function getStoredForwardAirCredentials(): Promise<ForwardAirCredentials | undefined> {
  if (!encryptionKey()) return undefined;
  try {
    const result = await db.query(
      `SELECT encrypted_payload FROM public.carrier_connection_credentials WHERE provider = $1`,
      [PROVIDER]
    );
    return result.rows.length ? decrypt(String(result.rows[0].encrypted_payload || '')) : undefined;
  } catch (_error) {
    return undefined;
  }
}

export async function saveForwardAirCredentials(credentials: ForwardAirCredentials, userId: string): Promise<void> {
  const encryptedPayload = encrypt(credentials);
  await db.queryWithUser(
    `INSERT INTO public.carrier_connection_credentials
      (provider, encrypted_payload, created_by, updated_by)
     VALUES ($1, $2, $3, $3)
     ON CONFLICT (provider) DO UPDATE
       SET encrypted_payload = EXCLUDED.encrypted_payload,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
    [PROVIDER, encryptedPayload, userId],
    userId
  );
}
